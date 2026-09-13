using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text.Json;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Security;
using Jellyfin.Plugin.TorrentClaw.Services;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class PosterServiceTests
{
    private const string PosterUrl = "https://image.tmdb.org/t/p/w500/poster.jpg";
    private static readonly string ReleaseId = ReleaseIdentifier.Create("0123456789abcdef0123456789abcdef01234567", "Release");
    private static readonly byte[] JpegBytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46];
    private static readonly JsonSerializerOptions WebJsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void TorrentClawSearchResponseDeserializesPosterUrlAndYear()
    {
        const string json = """
            {"total":1,"results":[{"title":"Spider-Man 2","year":2004,"contentType":"movie",
              "posterUrl":"https://image.tmdb.org/t/p/w500/poster.jpg","torrents":[]}]}
            """;

        var response = JsonSerializer.Deserialize<TorrentClawSearchResponse>(json, WebJsonOptions);

        Assert.NotNull(response);
        Assert.Equal(PosterUrl, response.Results[0].PosterUrl);
        Assert.Equal(2004, response.Results[0].Year);
    }

    [Theory]
    [InlineData("https://image.tmdb.org/t/p/w500/poster.jpg")]
    [InlineData("https://image.tmdb.org:443/t/p/original/poster.png?size=large")]
    public void AcceptsPublicHttpsPosterUrls(string url)
    {
        Assert.True(PosterService.TryCreatePosterUri(url, out var uri));
        Assert.Equal(Uri.UriSchemeHttps, uri.Scheme);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("http://image.tmdb.org/poster.jpg")]
    [InlineData("https://user:password@image.tmdb.org/poster.jpg")]
    [InlineData("https://image.tmdb.org:8443/poster.jpg")]
    [InlineData("https://image.tmdb.org/poster.jpg#fragment")]
    [InlineData("https://localhost/poster.jpg")]
    [InlineData("https://nas.local/poster.jpg")]
    [InlineData("https://127.0.0.1/poster.jpg")]
    [InlineData("https://10.0.0.5/poster.jpg")]
    [InlineData("https://192.168.1.20/poster.jpg")]
    [InlineData("https://169.254.169.254/latest/meta-data")]
    [InlineData("https://[::1]/poster.jpg")]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:image/png;base64,AAAA")]
    [InlineData("file:///C:/Windows/win.ini")]
    [InlineData("/relative/poster.jpg")]
    public void RejectsUnsafePosterUrls(string? url)
    {
        Assert.False(PosterService.TryCreatePosterUri(url, out _));
    }

    [Fact]
    public void RegistrationRequiresAValidReleaseIdAndPoster()
    {
        var service = CreateService(new QueueHttpHandler());

        Assert.True(service.RegisterPoster(ReleaseId, PosterUrl));
        Assert.False(service.RegisterPoster(ReleaseId, null));
        Assert.False(service.RegisterPoster("not-a-release-id", PosterUrl));
    }

    [Fact]
    public async Task UnregisteredReleaseNeverTriggersAnHttpRequest()
    {
        var handler = new QueueHttpHandler();

        var image = await CreateService(handler).GetPosterAsync(ReleaseId, CancellationToken.None);

        Assert.Null(image);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task ValidPosterIsReturnedAndCached()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) => Task.FromResult(ImageResponse(JpegBytes, "image/jpeg")));
        var service = CreateService(handler);
        service.RegisterPoster(ReleaseId, PosterUrl);

        var first = await service.GetPosterAsync(ReleaseId, CancellationToken.None);
        var second = await service.GetPosterAsync(ReleaseId, CancellationToken.None);

        Assert.NotNull(first);
        Assert.Equal("image/jpeg", first.ContentType);
        Assert.Equal(JpegBytes, first.Content);
        Assert.Same(first, second);
        Assert.Single(handler.Requests);
        Assert.Equal(new Uri(PosterUrl), handler.Requests[0].Uri);
    }

    [Theory]
    [InlineData("text/html")]
    [InlineData("image/svg+xml")]
    [InlineData("application/octet-stream")]
    public async Task NonRasterContentTypesAreRejected(string contentType)
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) => Task.FromResult(ImageResponse(JpegBytes, contentType)));

        Assert.Null(await GetRegisteredPosterAsync(handler));
    }

    [Fact]
    public async Task ContentThatDoesNotMatchTheDeclaredImageTypeIsRejected()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) => Task.FromResult(ImageResponse("<svg onload=alert(1)>"u8.ToArray(), "image/png")));

        Assert.Null(await GetRegisteredPosterAsync(handler));
    }

    [Fact]
    public async Task RedirectsAreNotFollowed()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.Found);
            response.Headers.Location = new Uri("http://169.254.169.254/latest/meta-data");
            return Task.FromResult(response);
        });

        Assert.Null(await GetRegisteredPosterAsync(handler));
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task OversizedPostersAreRejected()
    {
        var oversized = new byte[PosterService.MaximumPosterBytes + 1];
        JpegBytes.CopyTo(oversized, 0);
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) => Task.FromResult(ImageResponse(oversized, "image/jpeg")));

        Assert.Null(await GetRegisteredPosterAsync(handler));
    }

    [Fact]
    public async Task OversizedPostersWithoutContentLengthAreRejectedWhileReading()
    {
        var oversized = new byte[PosterService.MaximumPosterBytes + 1];
        JpegBytes.CopyTo(oversized, 0);
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) =>
        {
            var content = new StreamContent(new NonSeekableStream(oversized));
            content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
        });

        Assert.Null(await GetRegisteredPosterAsync(handler));
    }

    [Fact]
    public async Task NetworkFailuresFallBackToThePlaceholder()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) => throw new HttpRequestException("Connection refused."));

        Assert.Null(await GetRegisteredPosterAsync(handler));
    }

    [Theory]
    [InlineData("127.0.0.1", true)]
    [InlineData("10.1.2.3", true)]
    [InlineData("172.20.0.1", true)]
    [InlineData("192.168.0.1", true)]
    [InlineData("169.254.169.254", true)]
    [InlineData("::1", true)]
    [InlineData("fd00::1", true)]
    [InlineData("::ffff:192.168.0.1", true)]
    [InlineData("8.8.8.8", false)]
    [InlineData("2606:4700:4700::1111", false)]
    public void PrivateAndSpecialAddressesAreDetected(string address, bool expected)
    {
        Assert.Equal(expected, UrlSecurityValidator.IsPrivateOrSpecial(IPAddress.Parse(address)));
    }

    [Fact]
    public async Task ConnectCallbackRefusesPrivateDestinationsEvenWhenReachable()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        using var handler = new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            UseProxy = false,
            ConnectCallback = PublicNetworkConnector.ConnectAsync
        };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(5) };

        var exception = await Assert.ThrowsAsync<HttpRequestException>(
            () => client.GetAsync(new Uri($"http://127.0.0.1:{port}/poster.jpg")));

        Assert.Contains("private or special-purpose", exception.ToString(), StringComparison.Ordinal);
        Assert.False(listener.Pending());
    }

    [Fact]
    public async Task SearchPropagatesYearAndPosterAvailabilityWithoutExposingUrls()
    {
        var torrentClaw = new FixedTorrentClawClient(new TorrentClawSearchResponse
        {
            Total = 2,
            Results =
            [
                new TorrentClawContentResult
                {
                    Title = "Spider-Man 2",
                    Year = 2004,
                    PosterUrl = PosterUrl,
                    Torrents = [CreateTorrent("0123456789abcdef0123456789abcdef01234567", "Spider-Man.2.2004.2160p")]
                },
                new TorrentClawContentResult
                {
                    Title = "Insecure poster",
                    PosterUrl = "http://image.tmdb.org/insecure.jpg",
                    Torrents = [CreateTorrent("89abcdef0123456789abcdef0123456789abcdef", "Insecure.Poster.1080p")]
                }
            ]
        });
        var search = new SearchService(torrentClaw, new ReleaseRankingService(), CreateService(new QueueHttpHandler()));

        var results = await search.SearchAsync(new ReleaseSearchRequest { Query = "Spider-Man" }, CancellationToken.None);
        var json = JsonSerializer.Serialize(results);

        var secure = Assert.Single(results, result => result.Title == "Spider-Man 2");
        var insecure = Assert.Single(results, result => result.Title == "Insecure poster");
        Assert.Equal(2004, secure.Year);
        Assert.True(secure.HasPoster);
        Assert.False(insecure.HasPoster);
        Assert.DoesNotContain("image.tmdb.org", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("magnet", json, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<PosterImage?> GetRegisteredPosterAsync(QueueHttpHandler handler)
    {
        var service = CreateService(handler);
        Assert.True(service.RegisterPoster(ReleaseId, PosterUrl));
        return await service.GetPosterAsync(ReleaseId, CancellationToken.None);
    }

    private static PosterService CreateService(QueueHttpHandler handler) =>
        new(new SingleClientFactory(handler), new ListLogger<PosterService>());

    private static HttpResponseMessage ImageResponse(byte[] content, string contentType)
    {
        var body = new ByteArrayContent(content);
        body.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = body };
    }

    private static TorrentClawTorrent CreateTorrent(string infoHash, string rawTitle) => new()
    {
        InfoHash = infoHash,
        RawTitle = rawTitle,
        MagnetUrl = $"magnet:?xt=urn:btih:{infoHash}",
        Quality = "2160p",
        SizeBytes = 1024,
        Seeders = 10
    };

    private sealed class FixedTorrentClawClient(TorrentClawSearchResponse response) : ITorrentClawClient
    {
        public Task<TorrentClawSearchResponse> SearchAsync(ReleaseSearchRequest request, CancellationToken cancellationToken) =>
            Task.FromResult(response);

        public Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new ConnectionTestResult("Connected", "Connected"));
    }

    private sealed class NonSeekableStream(byte[] content) : MemoryStream(content)
    {
        public override bool CanSeek => false;

        public override long Length => throw new NotSupportedException();
    }
}
