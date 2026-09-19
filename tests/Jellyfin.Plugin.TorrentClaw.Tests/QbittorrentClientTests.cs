using System.Net;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class QbittorrentClientTests
{
    [Theory]
    [InlineData("downloading", DownloadState.Downloading)]
    [InlineData("pausedUP", DownloadState.Paused)]
    [InlineData("stalledUP", DownloadState.Completed)]
    [InlineData("missingFiles", DownloadState.MissingFiles)]
    [InlineData("checkingDL", DownloadState.Checking)]
    public void StateMappingMatchesQbittorrent(string source, DownloadState expected) =>
        Assert.Equal(expected, QbittorrentClient.MapState(source));

    [Fact]
    public async Task AuthenticateUsesDocumentedLoginAndCookie()
    {
        var handler = new QueueHttpHandler();
        EnqueueLogin(handler);
        var client = CreateClient(handler);

        await client.AuthenticateAsync(CancellationToken.None);

        Assert.Equal("/api/v2/auth/login", handler.Requests[0].Uri.AbsolutePath);
        Assert.Contains("username=user", handler.Requests[0].Body, StringComparison.Ordinal);
        Assert.Contains("password=password", handler.Requests[0].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AuthenticateAcceptsQbittorrentFiveTwoNoContentResponse()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue((_, _) =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.NoContent);
            response.Headers.TryAddWithoutValidation("Set-Cookie", "QBT_SID_8080=test-session; HttpOnly; SameSite=Strict");
            return Task.FromResult(response);
        });
        handler.Enqueue(HttpStatusCode.OK, "[]");

        await CreateClient(handler).GetTorrentStatusAsync(
            "0123456789abcdef0123456789abcdef01234567",
            CancellationToken.None);

        Assert.Equal("QBT_SID_8080=test-session", handler.Requests[1].Headers["Cookie"]);
    }

    [Fact]
    public async Task StatusParsesAndMapsCompletedState()
    {
        var handler = new QueueHttpHandler();
        EnqueueLogin(handler);
        handler.Enqueue(HttpStatusCode.OK, """
            [{"hash":"0123456789abcdef0123456789abcdef01234567","name":"Title","progress":1,
              "dlspeed":0,"downloaded":100,"total_size":100,"eta":0,"state":"stalledUP","save_path":"C:\\\\Movies"}]
            """);

        var result = await CreateClient(handler).GetTorrentStatusAsync(
            "0123456789abcdef0123456789abcdef01234567",
            CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(DownloadState.Completed, result.State);
        Assert.Equal(100, result.TotalBytes);
    }

    [Fact]
    public async Task MalformedStatusResponseThrowsProtocolError()
    {
        var handler = new QueueHttpHandler();
        EnqueueLogin(handler);
        handler.Enqueue(HttpStatusCode.OK, "bad-json");

        await Assert.ThrowsAsync<QbittorrentProtocolException>(
            () => CreateClient(handler).GetTorrentStatusAsync(
                "0123456789abcdef0123456789abcdef01234567",
                CancellationToken.None));
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task AuthenticationFailuresAreMapped(HttpStatusCode status)
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(status, "Fails.", "text/plain");

        var result = await CreateClient(handler).TestConnectionAsync(CancellationToken.None);

        Assert.Equal("Unauthorized", result.Status);
    }

    [Fact]
    public async Task DeleteDefaultsToKeepingFiles()
    {
        var handler = new QueueHttpHandler();
        EnqueueLogin(handler);
        handler.Enqueue(HttpStatusCode.OK, string.Empty, "text/plain");

        await CreateClient(handler).DeleteTorrentAsync(
            "0123456789abcdef0123456789abcdef01234567",
            false,
            CancellationToken.None);

        Assert.Contains("deleteFiles=false", handler.Requests[1].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AddTorrentUsesMultipartApiWithoutLoggingOrShells()
    {
        var handler = new QueueHttpHandler();
        EnqueueLogin(handler);
        handler.Enqueue(HttpStatusCode.OK, string.Empty, "text/plain");
        var magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";

        await CreateClient(handler).AddTorrentAsync(magnet, "movies", "C:\\Movies", CancellationToken.None);

        Assert.Equal("/api/v2/torrents/add", handler.Requests[1].Uri.AbsolutePath);
        Assert.Contains("name=urls", handler.Requests[1].Body, StringComparison.Ordinal);
        Assert.Contains(magnet, handler.Requests[1].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task MetadataPreflightStopsWhenMetainfoIsAvailable()
    {
        var handler = new QueueHttpHandler();
        EnqueueLogin(handler);
        handler.Enqueue(HttpStatusCode.OK, string.Empty, "text/plain");
        var magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";

        await CreateClient(handler).AddMetadataPreflightAsync(magnet, "movies", "C:\\Movies", CancellationToken.None);

        Assert.Equal("/api/v2/torrents/add", handler.Requests[1].Uri.AbsolutePath);
        Assert.Contains("name=stop_condition", handler.Requests[1].Body, StringComparison.Ordinal);
        Assert.Contains("MetadataReceived", handler.Requests[1].Body, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(true, "/api/v2/torrents/stop")]
    [InlineData(false, "/api/v2/torrents/start")]
    public async Task PauseAndResumeUseCurrentQbittorrentFiveEndpoints(bool pause, string expectedPath)
    {
        var handler = new QueueHttpHandler();
        EnqueueLogin(handler);
        handler.Enqueue(HttpStatusCode.OK, string.Empty, "text/plain");
        var client = CreateClient(handler);

        if (pause)
        {
            await client.PauseAsync("0123456789abcdef0123456789abcdef01234567", CancellationToken.None);
        }
        else
        {
            await client.ResumeAsync("0123456789abcdef0123456789abcdef01234567", CancellationToken.None);
        }

        Assert.Equal(expectedPath, handler.Requests[1].Uri.AbsolutePath);
    }

    [Fact]
    public async Task ConnectionTestMapsTimeout()
    {
        var handler = new QueueHttpHandler();
        handler.Enqueue(async (_, token) =>
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var configuration = new TestConfiguration
        {
            Qbittorrent = new QbittorrentSettings(
                "http://127.0.0.1:8080", "user", "password", 1, "movies", "C:\\Movies", "C:\\TV", "C:\\Downloads")
        };

        var result = await CreateClient(handler, configuration).TestConnectionAsync(CancellationToken.None);

        Assert.Equal("Timeout", result.Status);
    }

    private static void EnqueueLogin(QueueHttpHandler handler)
    {
        handler.Enqueue((_, _) =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("Ok.")
            };
            response.Headers.TryAddWithoutValidation("Set-Cookie", "SID=test-session; HttpOnly; SameSite=Strict");
            return Task.FromResult(response);
        });
    }

    private static QbittorrentClient CreateClient(
        QueueHttpHandler handler,
        TestConfiguration? configuration = null) => new(
            new SingleClientFactory(handler),
            configuration ?? new TestConfiguration(),
            new TestUrlValidator());
}
