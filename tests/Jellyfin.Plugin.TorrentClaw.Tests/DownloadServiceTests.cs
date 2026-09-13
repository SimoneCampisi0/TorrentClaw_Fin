using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Services;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class DownloadServiceTests
{
    [Fact]
    public async Task CompletedDownloadRequestsOneLibraryRefresh()
    {
        var root = Directory.CreateTempSubdirectory("TorrentClawDownload-").FullName;
        try
        {
            const string hash = "0123456789abcdef0123456789abcdef01234567";
            var search = new CompletedReleaseSearchService(new SelectedRelease(
                $"magnet:?xt=urn:btih:{hash}",
                hash,
                "Public domain test release",
                ContentKind.Movie));
            var qbittorrent = new CompletedQbittorrentClient(hash, root);
            var configuration = new TestConfiguration
            {
                Qbittorrent = new QbittorrentSettings(
                    "http://127.0.0.1:8080",
                    "user",
                    "password",
                    15,
                    "movies",
                    root,
                    root,
                    root)
            };
            var library = new RecordingLibraryService();
            var service = new DownloadService(
                search,
                qbittorrent,
                configuration,
                library,
                new ListLogger<DownloadService>());

            var item = await service.StartAsync("release-id", CancellationToken.None);
            await service.MonitorOnceAsync(CancellationToken.None);
            await service.MonitorOnceAsync(CancellationToken.None);

            Assert.True(qbittorrent.AddCalled);
            Assert.True(item.LibraryRefreshRequested);
            Assert.Equal(root + Path.DirectorySeparatorChar, library.LastPath);
            Assert.Equal(1, library.RefreshCount);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private sealed class CompletedReleaseSearchService(SelectedRelease release) : ISearchService
    {
        public Task<IReadOnlyList<ReleaseResult>> SearchAsync(
            ReleaseSearchRequest request,
            CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<ReleaseResult>>([]);

        public bool TryResolveRelease(string releaseId, out SelectedRelease? selectedRelease)
        {
            selectedRelease = releaseId == "release-id" ? release : null;
            return selectedRelease is not null;
        }
    }

    private sealed class CompletedQbittorrentClient(string hash, string savePath) : IQbittorrentClient
    {
        public bool AddCalled { get; private set; }

        public Task AuthenticateAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public Task AddTorrentAsync(
            string magnetUrl,
            string category,
            string targetPath,
            CancellationToken cancellationToken)
        {
            AddCalled = true;
            return Task.CompletedTask;
        }

        public Task<TorrentStatus?> GetTorrentStatusAsync(
            string torrentHash,
            CancellationToken cancellationToken) => Task.FromResult<TorrentStatus?>(new TorrentStatus(
                hash,
                "Public domain test release",
                1,
                0,
                1024,
                1024,
                0,
                DownloadState.Completed,
                savePath,
                null));

        public Task PauseAsync(string torrentHash, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task ResumeAsync(string torrentHash, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task DeleteTorrentAsync(
            string torrentHash,
            bool deleteFiles,
            CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new ConnectionTestResult("Connected", "Connected"));
    }

    private sealed class RecordingLibraryService : IJellyfinLibraryService
    {
        public int RefreshCount { get; private set; }

        public string? LastPath { get; private set; }

        public Task RefreshAsync(string completedPath, CancellationToken cancellationToken)
        {
            RefreshCount++;
            LastPath = completedPath;
            return Task.CompletedTask;
        }
    }
}
