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
                ContentKind.Movie,
                null,
                null));
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

    [Fact]
    public async Task PreflightRejectsVerifiedSizeThatExceedsTheConfiguredMaximum()
    {
        var root = Directory.CreateTempSubdirectory("TorrentClawPreflight-").FullName;
        try
        {
            const string hash = "0123456789abcdef0123456789abcdef01234567";
            const long sourceSize = 884L * 1024 * 1024;
            const long actualSize = 18L * 1024 * 1024 * 1024;
            var release = new SelectedRelease(
                $"magnet:?xt=urn:btih:{hash}",
                hash,
                "Verified size test release",
                ContentKind.Movie,
                sourceSize,
                10);
            var qbittorrent = new PreflightQbittorrentClient(hash, root, actualSize);
            var service = CreatePreflightService(release, qbittorrent, root);

            var result = await service.PreflightAsync("release-id", CancellationToken.None);

            Assert.Equal(DownloadPreflightStatus.MaximumSizeExceeded, result.Status);
            Assert.Equal(sourceSize, result.SourceSizeBytes);
            Assert.Equal(actualSize, result.ActualSizeBytes);
            Assert.Equal(10L * 1024 * 1024 * 1024, result.MaximumSizeBytes);
            Assert.True(qbittorrent.AddMetadataCalled);
            Assert.Equal([hash], qbittorrent.DeletedHashes);
            Assert.Empty(service.GetDownloads());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task ConfirmPreflightResumesTheVerifiedTorrentAndRetainsSourceSize()
    {
        var root = Directory.CreateTempSubdirectory("TorrentClawPreflight-").FullName;
        try
        {
            const string hash = "0123456789abcdef0123456789abcdef01234567";
            const long sourceSize = 884L * 1024 * 1024;
            const long actualSize = 2L * 1024 * 1024 * 1024;
            var release = new SelectedRelease(
                $"magnet:?xt=urn:btih:{hash}",
                hash,
                "Verified size test release",
                ContentKind.Movie,
                sourceSize,
                10);
            var qbittorrent = new PreflightQbittorrentClient(hash, root, actualSize);
            var service = CreatePreflightService(release, qbittorrent, root);

            var preflight = await service.PreflightAsync("release-id", CancellationToken.None);
            var item = await service.ConfirmPreflightAsync("release-id", CancellationToken.None);

            Assert.Equal(DownloadPreflightStatus.Ready, preflight.Status);
            Assert.Equal(actualSize, preflight.ActualSizeBytes);
            Assert.Equal(sourceSize, item.SourceSizeBytes);
            Assert.Equal([hash], qbittorrent.ResumedHashes);
            Assert.Empty(qbittorrent.DeletedHashes);
            Assert.Single(service.GetDownloads());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task CancelPreflightRemovesTheVerifiedTorrentWithoutDeletingFiles()
    {
        var root = Directory.CreateTempSubdirectory("TorrentClawPreflight-").FullName;
        try
        {
            const string hash = "0123456789abcdef0123456789abcdef01234567";
            var release = new SelectedRelease(
                $"magnet:?xt=urn:btih:{hash}",
                hash,
                "Verified size test release",
                ContentKind.Movie,
                884L * 1024 * 1024,
                10);
            var qbittorrent = new PreflightQbittorrentClient(hash, root, 2L * 1024 * 1024 * 1024);
            var service = CreatePreflightService(release, qbittorrent, root);

            await service.PreflightAsync("release-id", CancellationToken.None);
            await service.CancelPreflightAsync("release-id", CancellationToken.None);

            Assert.Equal([hash], qbittorrent.DeletedHashes);
            Assert.Empty(qbittorrent.ResumedHashes);
            Assert.Empty(service.GetDownloads());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task MetadataTimeoutRemovesThePreflightTorrentWithoutCreatingADownload()
    {
        var root = Directory.CreateTempSubdirectory("TorrentClawPreflight-").FullName;
        try
        {
            const string hash = "0123456789abcdef0123456789abcdef01234567";
            var release = new SelectedRelease(
                $"magnet:?xt=urn:btih:{hash}",
                hash,
                "Verified size test release",
                ContentKind.Movie,
                884L * 1024 * 1024,
                10);
            var qbittorrent = new PreflightQbittorrentClient(hash, root, 2L * 1024 * 1024 * 1024);
            var service = CreatePreflightService(release, qbittorrent, root, timeoutSeconds: 0);

            var result = await service.PreflightAsync("release-id", CancellationToken.None);

            Assert.Equal(DownloadPreflightStatus.MetadataUnavailable, result.Status);
            Assert.Equal([hash], qbittorrent.DeletedHashes);
            Assert.Empty(service.GetDownloads());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static DownloadService CreatePreflightService(
        SelectedRelease release,
        PreflightQbittorrentClient qbittorrent,
        string root,
        int timeoutSeconds = 15) => new(
            new CompletedReleaseSearchService(release),
            qbittorrent,
            new TestConfiguration
            {
                Qbittorrent = new QbittorrentSettings(
                    "http://127.0.0.1:8080",
                    "user",
                    "password",
                    timeoutSeconds,
                    "movies",
                    root,
                    root,
                    root)
            },
            new RecordingLibraryService(),
            new ListLogger<DownloadService>());

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

        public Task AddMetadataPreflightAsync(
            string magnetUrl,
            string category,
            string targetPath,
            CancellationToken cancellationToken) => Task.CompletedTask;

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

    private sealed class PreflightQbittorrentClient(string hash, string savePath, long totalBytes) : IQbittorrentClient
    {
        public bool AddMetadataCalled { get; private set; }

        public List<string> ResumedHashes { get; } = [];

        public List<string> DeletedHashes { get; } = [];

        public Task AuthenticateAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public Task AddTorrentAsync(
            string magnetUrl,
            string category,
            string targetPath,
            CancellationToken cancellationToken) => Task.CompletedTask;

        public Task AddMetadataPreflightAsync(
            string magnetUrl,
            string category,
            string targetPath,
            CancellationToken cancellationToken)
        {
            AddMetadataCalled = true;
            return Task.CompletedTask;
        }

        public Task<TorrentStatus?> GetTorrentStatusAsync(string torrentHash, CancellationToken cancellationToken) =>
            Task.FromResult<TorrentStatus?>(new TorrentStatus(
                hash,
                "Verified size test release",
                0,
                0,
                0,
                totalBytes,
                0,
                DownloadState.Paused,
                savePath,
                null));

        public Task PauseAsync(string torrentHash, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task ResumeAsync(string torrentHash, CancellationToken cancellationToken)
        {
            ResumedHashes.Add(torrentHash);
            return Task.CompletedTask;
        }

        public Task DeleteTorrentAsync(string torrentHash, bool deleteFiles, CancellationToken cancellationToken)
        {
            Assert.False(deleteFiles);
            DeletedHashes.Add(torrentHash);
            return Task.CompletedTask;
        }

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
