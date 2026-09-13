using System.Net;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class TorrentClawClientTests
{
    private const string ValidResponse = """
        {
          "total": 1,
          "results": [{
            "title": "Big Buck Bunny",
            "contentType": "movie",
            "torrents": [{
              "infoHash": "0123456789abcdef0123456789abcdef01234567",
              "rawTitle": "Big.Buck.Bunny.1080p.AV1",
              "quality": "1080p",
              "codec": "AV1",
              "sizeBytes": 1000,
              "seeders": 9,
              "leechers": 1,
              "magnetUrl": "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
              "source": "test",
              "qualityScore": 88,
              "languages": ["en"],
              "audioCodec": "EAC3",
              "audioTracks": [{"lang":"en","codec":"EAC3","channels":6,"default":true}],
              "subtitleTracks": [{"lang":"it","codec":"subrip","forced":true}],
              "subtitleLanguages": ["it"],
              "scanStatus": "completed"
            }]
          }]
        }
        """;

    [Fact]
    public async Task ParsesOfficialSearchShapeAndSendsApiKeyHeader()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.OK, ValidResponse);
        var client = CreateClient(handler);

        var response = await client.SearchAsync(
            new ReleaseSearchRequest { Query = "Big Buck Bunny", Type = ContentKind.Movie },
            CancellationToken.None);

        Assert.Equal(1, response.Total);
        Assert.Equal("AV1", response.Results[0].Torrents[0].Codec);
        Assert.Equal("en", response.Results[0].Torrents[0].AudioTracks[0].Lang);
        Assert.Equal(6, response.Results[0].Torrents[0].AudioTracks[0].Channels);
        Assert.Equal("it", response.Results[0].Torrents[0].SubtitleTracks[0].Lang);
        Assert.True(response.Results[0].Torrents[0].SubtitleTracks[0].Forced);
        Assert.Equal(["it"], response.Results[0].Torrents[0].SubtitleLanguages);
        Assert.Equal("tc_test_dummy_key", handler.Requests[0].Headers["X-API-Key"]);
    }

    [Fact]
    public async Task SendsOnlyDocumentedServerSideFilters()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.OK, ValidResponse);
        var client = CreateClient(handler);
        var request = new ReleaseSearchRequest
        {
            Query = "Bunny",
            Type = ContentKind.Show,
            Resolution = "2160p",
            AudioLanguage = "it,en",
            SubtitleLanguage = "en,it",
            Audio = "atmos",
            Hdr = "Dolby Vision",
            Codec = "HEVC",
            MaxSizeGb = 20,
            MinimumSeeders = 5,
            VerifiedOnly = true
        };

        await client.SearchAsync(request, CancellationToken.None);

        var query = handler.Requests[0].Uri.Query;
        Assert.Contains("type=show", query, StringComparison.Ordinal);
        Assert.Contains("quality=2160p", query, StringComparison.Ordinal);
        Assert.Contains("lang=it", query, StringComparison.Ordinal);
        Assert.Contains("subs=en", query, StringComparison.Ordinal);
        Assert.Contains("audio=atmos", query, StringComparison.Ordinal);
        Assert.Contains("hdr=dolby_vision", query, StringComparison.Ordinal);
        Assert.Contains("verified=true", query, StringComparison.Ordinal);
        Assert.DoesNotContain("codec", query, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("seeders", query, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("size", query, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task NoSubtitleFilterIsEvaluatedLocallyAndNotSentAsUndocumentedValue()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.OK, ValidResponse);

        await CreateClient(handler).SearchAsync(
            new ReleaseSearchRequest { Query = "Bunny", SubtitleLanguage = "none" },
            CancellationToken.None);

        Assert.DoesNotContain("subs=", handler.Requests[0].Uri.Query, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "InvalidApiKey")]
    [InlineData(HttpStatusCode.Forbidden, "Unauthorized")]
    public async Task TestConnectionMapsAuthenticationFailures(HttpStatusCode status, string expected)
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(status, "{}");

        var result = await CreateClient(handler).TestConnectionAsync(CancellationToken.None);

        Assert.Equal(expected, result.Status);
    }

    [Fact]
    public async Task TestConnectionReturnsConnected()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.OK, ValidResponse);

        var result = await CreateClient(handler).TestConnectionAsync(CancellationToken.None);

        Assert.Equal("Connected", result.Status);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task TestConnectionMapsTransientServiceFailures(HttpStatusCode status)
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(status, "{}");

        var result = await CreateClient(handler).TestConnectionAsync(CancellationToken.None);

        Assert.Equal("ServiceUnavailable", result.Status);
    }

    [Fact]
    public async Task MalformedResponseThrowsProtocolError()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.OK, "{not-json");

        await Assert.ThrowsAsync<TorrentClawProtocolException>(
            () => CreateClient(handler).SearchAsync(
                new ReleaseSearchRequest { Query = "Bunny" },
                CancellationToken.None));
    }

    [Fact]
    public async Task RateLimitIsRetriedWithinConfiguredLimit()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.TooManyRequests, "{}");
        handler.Enqueue(HttpStatusCode.OK, ValidResponse);
        var configuration = new TestConfiguration
        {
            TorrentClaw = new TorrentClawSettings("https://unit.test", "tc_test_dummy_key", 15, 1)
        };

        var response = await CreateClient(handler, configuration).SearchAsync(
            new ReleaseSearchRequest { Query = "Bunny" },
            CancellationToken.None);

        Assert.Equal(1, response.Total);
        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task ApiKeyIsNeverWrittenToLogsOrExceptions()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.InternalServerError, "tc_test_dummy_key");
        handler.Enqueue(HttpStatusCode.InternalServerError, "tc_test_dummy_key");
        var logger = new ListLogger<TorrentClawClient>();
        var configuration = new TestConfiguration
        {
            TorrentClaw = new TorrentClawSettings("https://unit.test", "tc_test_dummy_key", 15, 1)
        };
        var client = CreateClient(handler, configuration, logger);

        var exception = await Assert.ThrowsAsync<TorrentClawApiException>(
            () => client.SearchAsync(new ReleaseSearchRequest { Query = "Bunny" }, CancellationToken.None));

        Assert.DoesNotContain("tc_test_dummy_key", exception.ToString(), StringComparison.Ordinal);
        Assert.All(logger.Messages, message => Assert.DoesNotContain("tc_test_dummy_key", message, StringComparison.Ordinal));
    }

    [Fact]
    public async Task TimeoutIsMappedByConnectionTest()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(async (_, token) =>
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var configuration = new TestConfiguration
        {
            TorrentClaw = new TorrentClawSettings("https://unit.test", "tc_test_dummy_key", 1, 0)
        };

        var result = await CreateClient(handler, configuration).TestConnectionAsync(CancellationToken.None);

        Assert.Equal("Timeout", result.Status);
    }

    [Fact]
    public async Task ExplicitNullsFromTheApiAreNormalizedAndCanBeRanked()
    {
        const string responseWithNulls = """
            {
              "total": 1,
              "results": [{
                "title": "Big Buck Bunny",
                "year": 2008,
                "posterUrl": null,
                "contentType": "movie",
                "torrents": [{
                  "infoHash": "0123456789abcdef0123456789abcdef01234567",
                  "rawTitle": null,
                  "quality": null,
                  "codec": null,
                  "sizeBytes": null,
                  "seeders": 4,
                  "magnetUrl": "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
                  "source": null,
                  "languages": null,
                  "audioTracks": null,
                  "subtitleTracks": [null, {"lang": null, "codec": null}],
                  "subtitleLanguages": null,
                  "videoInfo": null,
                  "scanStatus": null
                }]
              }]
            }
            """;
        var handler = new QueueHttpHandler();
        handler.Enqueue(HttpStatusCode.OK, responseWithNulls);

        var response = await CreateClient(handler).SearchAsync(
            new ReleaseSearchRequest { Query = "Big Buck Bunny" },
            CancellationToken.None);
        var torrent = response.Results[0].Torrents[0];
        var ranked = new Services.ReleaseRankingService().Rank(
            "id",
            response.Results[0].Title,
            ContentKind.Movie,
            torrent,
            new ReleaseSearchRequest { Query = "Big Buck Bunny", AudioLanguage = "it", SubtitleLanguage = "en", MaxSizeGb = 10 });

        Assert.Empty(torrent.AudioTracks);
        Assert.Empty(torrent.Languages);
        Assert.Empty(torrent.SubtitleLanguages);
        Assert.Single(torrent.SubtitleTracks);
        Assert.Equal(string.Empty, torrent.RawTitle);
        Assert.Equal(string.Empty, torrent.Source);
        Assert.False(ranked.Eligible);
        Assert.Contains("requested audio language (metadata unavailable)", ranked.ConstraintsViolated);
    }

    private static TorrentClawClient CreateClient(
        QueueHttpHandler handler,
        TestConfiguration? configuration = null,
        ListLogger<TorrentClawClient>? logger = null) => new(
            new SingleClientFactory(handler),
            configuration ?? new TestConfiguration(),
            new FixedCredentials(),
            new TestUrlValidator(),
            logger ?? new ListLogger<TorrentClawClient>());
}
