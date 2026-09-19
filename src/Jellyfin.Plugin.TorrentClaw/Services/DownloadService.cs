using System.Collections.Concurrent;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TorrentClaw.Services;

public interface IDownloadService
{
    Task<DownloadItem> StartAsync(string releaseId, CancellationToken cancellationToken);

    Task<DownloadPreflightResult> PreflightAsync(string releaseId, CancellationToken cancellationToken);

    Task<DownloadItem> ConfirmPreflightAsync(string releaseId, CancellationToken cancellationToken);

    Task CancelPreflightAsync(string releaseId, CancellationToken cancellationToken);

    IReadOnlyList<DownloadItem> GetDownloads();

    Task PauseAsync(Guid id, CancellationToken cancellationToken);

    Task ResumeAsync(Guid id, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, bool deleteFiles, CancellationToken cancellationToken);

    Task MonitorOnceAsync(CancellationToken cancellationToken);
}

public sealed class DownloadService : IDownloadService
{
    private static readonly Action<ILogger, string, Exception?> LogAdded = LoggerMessage.Define<string>(
        LogLevel.Information,
        new EventId(2001, "TorrentAdded"),
        "Added selected release {ReleaseName} to qBittorrent.");
    private static readonly Action<ILogger, string, Exception?> LogStatusFailure = LoggerMessage.Define<string>(
        LogLevel.Warning,
        new EventId(2002, "TorrentStatusFailed"),
        "Unable to update torrent {TorrentHashPrefix}.");
    private readonly ISearchService _searchService;
    private readonly IQbittorrentClient _qbittorrent;
    private readonly ITorrentClawConfiguration _configuration;
    private readonly IJellyfinLibraryService _libraryService;
    private readonly ILogger<DownloadService> _logger;
    private readonly ConcurrentDictionary<Guid, DownloadItem> _downloads = new();
    private readonly ConcurrentDictionary<string, Task<PendingPreflight>> _preflights = new(StringComparer.Ordinal);

    public DownloadService(
        ISearchService searchService,
        IQbittorrentClient qbittorrent,
        ITorrentClawConfiguration configuration,
        IJellyfinLibraryService libraryService,
        ILogger<DownloadService> logger)
    {
        _searchService = searchService;
        _qbittorrent = qbittorrent;
        _configuration = configuration;
        _libraryService = libraryService;
        _logger = logger;
    }

    public async Task<DownloadItem> StartAsync(string releaseId, CancellationToken cancellationToken)
    {
        if (!_searchService.TryResolveRelease(releaseId, out var release) || release is null)
        {
            throw new KeyNotFoundException("Release expired or was not produced by the latest search.");
        }

        var settings = _configuration.GetQbittorrentSettings();
        var savePath = release.ContentType == ContentKind.Movie
            ? settings.MovieSavePath
            : settings.TvSavePath;
        if (string.IsNullOrWhiteSpace(savePath))
        {
            throw new InvalidOperationException("The save path for this media type is not configured.");
        }

        EnsureDownloadWillNotOverwrite(savePath, release.ReleaseName);

        await _qbittorrent.AddTorrentAsync(
            release.MagnetUrl,
            settings.Category,
            savePath,
            cancellationToken).ConfigureAwait(false);
        return RegisterDownload(release);
    }

    public async Task<DownloadPreflightResult> PreflightAsync(string releaseId, CancellationToken cancellationToken)
    {
        var task = _preflights.GetOrAdd(
            releaseId,
            key => CreatePreflightAsync(key, cancellationToken));
        PendingPreflight preflight;
        try
        {
            preflight = await task.ConfigureAwait(false);
        }
        catch
        {
            _preflights.TryRemove(new KeyValuePair<string, Task<PendingPreflight>>(releaseId, task));
            throw;
        }

        if (preflight.Status != DownloadPreflightStatus.Ready)
        {
            _preflights.TryRemove(new KeyValuePair<string, Task<PendingPreflight>>(releaseId, task));
        }

        return preflight.ToResult();
    }

    public async Task<DownloadItem> ConfirmPreflightAsync(string releaseId, CancellationToken cancellationToken)
    {
        if (!_preflights.TryRemove(releaseId, out var task))
        {
            throw new InvalidOperationException("The torrent verification has expired. Verify the release again.");
        }

        var preflight = await task.ConfigureAwait(false);
        if (preflight.Status != DownloadPreflightStatus.Ready)
        {
            throw new InvalidOperationException(preflight.Message);
        }

        try
        {
            await _qbittorrent.ResumeAsync(preflight.Release.InfoHash, cancellationToken).ConfigureAwait(false);
            return RegisterDownload(preflight.Release);
        }
        catch
        {
            _preflights.TryAdd(releaseId, Task.FromResult(preflight));
            throw;
        }
    }

    public async Task CancelPreflightAsync(string releaseId, CancellationToken cancellationToken)
    {
        if (!_preflights.TryRemove(releaseId, out var task))
        {
            return;
        }

        var preflight = await task.ConfigureAwait(false);
        try
        {
            await _qbittorrent.DeleteTorrentAsync(preflight.Release.InfoHash, false, cancellationToken)
                .ConfigureAwait(false);
        }
        catch
        {
            _preflights.TryAdd(releaseId, Task.FromResult(preflight));
            throw;
        }
    }

    public IReadOnlyList<DownloadItem> GetDownloads() =>
        _downloads.Values.OrderByDescending(item => item.CreatedAt).ToArray();

    public Task PauseAsync(Guid id, CancellationToken cancellationToken) =>
        _qbittorrent.PauseAsync(Get(id).Hash, cancellationToken);

    public Task ResumeAsync(Guid id, CancellationToken cancellationToken) =>
        _qbittorrent.ResumeAsync(Get(id).Hash, cancellationToken);

    public async Task DeleteAsync(Guid id, bool deleteFiles, CancellationToken cancellationToken)
    {
        if (deleteFiles)
        {
            throw new InvalidOperationException(
                "Deleting downloaded files is disabled by this plugin. Delete them manually if required.");
        }

        var item = Get(id);
        await _qbittorrent.DeleteTorrentAsync(item.Hash, false, cancellationToken).ConfigureAwait(false);
        _downloads.TryRemove(id, out _);
    }

    public async Task MonitorOnceAsync(CancellationToken cancellationToken)
    {
        foreach (var item in _downloads.Values)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                item.Status = await _qbittorrent.GetTorrentStatusAsync(item.Hash, cancellationToken)
                    .ConfigureAwait(false);
                if (item.Status?.State == DownloadState.Completed && !item.LibraryRefreshRequested)
                {
                    var completedPath = ValidateCompletedPath(item, item.Status);
                    await _libraryService.RefreshAsync(completedPath, cancellationToken).ConfigureAwait(false);
                    item.LibraryRefreshRequested = true;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                LogStatusFailure(_logger, HashPrefix(item.Hash), ex);
            }
        }
    }

    private async Task<PendingPreflight> CreatePreflightAsync(string releaseId, CancellationToken cancellationToken)
    {
        if (!_searchService.TryResolveRelease(releaseId, out var release) || release is null)
        {
            throw new KeyNotFoundException("Release expired or was not produced by the latest search.");
        }

        var settings = _configuration.GetQbittorrentSettings();
        var savePath = release.ContentType == ContentKind.Movie
            ? settings.MovieSavePath
            : settings.TvSavePath;
        if (string.IsNullOrWhiteSpace(savePath))
        {
            throw new InvalidOperationException("The save path for this media type is not configured.");
        }

        EnsureDownloadWillNotOverwrite(savePath, release.ReleaseName);
        var added = false;
        try
        {
            await _qbittorrent.AddMetadataPreflightAsync(
                release.MagnetUrl,
                settings.Category,
                savePath,
                cancellationToken).ConfigureAwait(false);
            added = true;

            var status = await WaitForMetadataAsync(release.InfoHash, settings.TimeoutSeconds, cancellationToken)
                .ConfigureAwait(false);
            if (status is null)
            {
                await DeletePreflightTorrentAsync(release.InfoHash, CancellationToken.None).ConfigureAwait(false);
                added = false;
                return PendingPreflight.MetadataUnavailable(release, releaseId);
            }

            var maximumSizeBytes = release.MaximumSizeGb > 0
                ? checked((long)(release.MaximumSizeGb.Value * 1024 * 1024 * 1024))
                : (long?)null;
            if (maximumSizeBytes is not null && status.TotalBytes > maximumSizeBytes)
            {
                await DeletePreflightTorrentAsync(release.InfoHash, CancellationToken.None).ConfigureAwait(false);
                added = false;
                return PendingPreflight.MaximumSizeExceeded(release, releaseId, status.TotalBytes, maximumSizeBytes.Value);
            }

            return PendingPreflight.Ready(release, releaseId, status.TotalBytes, maximumSizeBytes);
        }
        catch
        {
            if (added)
            {
                await DeletePreflightTorrentAsync(release.InfoHash, CancellationToken.None).ConfigureAwait(false);
            }

            throw;
        }
    }

    private async Task<TorrentStatus?> WaitForMetadataAsync(
        string hash,
        int timeoutSeconds,
        CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(timeoutSeconds);
        while (DateTimeOffset.UtcNow < deadline)
        {
            var status = await _qbittorrent.GetTorrentStatusAsync(hash, cancellationToken).ConfigureAwait(false);
            if (status?.TotalBytes > 0)
            {
                return status;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken).ConfigureAwait(false);
        }

        return null;
    }

    private async Task DeletePreflightTorrentAsync(string hash, CancellationToken cancellationToken)
    {
        try
        {
            await _qbittorrent.DeleteTorrentAsync(hash, false, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            LogStatusFailure(_logger, HashPrefix(hash), ex);
        }
    }

    private DownloadItem RegisterDownload(SelectedRelease release)
    {
        var item = new DownloadItem
        {
            Id = Guid.NewGuid(),
            Hash = NormalizeInfoHash(release.InfoHash),
            ReleaseName = release.ReleaseName,
            ContentType = release.ContentType,
            CreatedAt = DateTimeOffset.UtcNow,
            SourceSizeBytes = release.SourceSizeBytes
        };
        _downloads[item.Id] = item;
        LogAdded(_logger, item.ReleaseName, null);
        return item;
    }

    private string ValidateCompletedPath(DownloadItem item, TorrentStatus status)
    {
        var settings = _configuration.GetQbittorrentSettings();
        var configuredRoot = item.ContentType == ContentKind.Movie
            ? settings.MovieSavePath
            : settings.TvSavePath;
        var root = Path.GetFullPath(configuredRoot)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        var reported = Path.GetFullPath(status.SavePath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        if (!reported.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "qBittorrent reported a completed path outside the configured media directory.");
        }

        return reported;
    }

    private DownloadItem Get(Guid id) =>
        _downloads.TryGetValue(id, out var item)
            ? item
            : throw new KeyNotFoundException("Download was not found.");

    private static string NormalizeInfoHash(string infoHash)
    {
        var hash = infoHash.Trim();
        if (hash.Length is not (40 or 64) || !hash.All(Uri.IsHexDigit))
        {
            throw new InvalidDataException("TorrentClaw returned an invalid info hash.");
        }

        return hash.ToLowerInvariant();
    }

    private static void EnsureDownloadWillNotOverwrite(string savePath, string releaseName)
    {
        var root = Path.GetFullPath(savePath);
        if (!Directory.Exists(root))
        {
            throw new DirectoryNotFoundException(
                "The configured media save directory does not exist or is not accessible to Jellyfin.");
        }

        var safeName = string.Concat(releaseName.Where(character =>
            !Path.GetInvalidFileNameChars().Contains(character))).Trim();
        if (safeName.Length == 0)
        {
            throw new InvalidDataException("The selected release has an invalid file name.");
        }

        var expectedTarget = Path.Combine(root, safeName);
        if (File.Exists(expectedTarget) || Directory.Exists(expectedTarget))
        {
            throw new IOException(
                "A file or directory with the selected release name already exists; download was not started.");
        }
    }

    private static string HashPrefix(string hash) => hash.Length <= 8 ? hash : hash[..8];

    private sealed record PendingPreflight(
        SelectedRelease Release,
        string ReleaseId,
        long? ActualSizeBytes,
        long? MaximumSizeBytes,
        DownloadPreflightStatus Status,
        string Message)
    {
        public static PendingPreflight Ready(
            SelectedRelease release,
            string releaseId,
            long actualSizeBytes,
            long? maximumSizeBytes) => new(
                release,
                releaseId,
                actualSizeBytes,
                maximumSizeBytes,
                DownloadPreflightStatus.Ready,
                "Torrent metadata verified. Confirm to start the download.");

        public static PendingPreflight MaximumSizeExceeded(
            SelectedRelease release,
            string releaseId,
            long actualSizeBytes,
            long maximumSizeBytes) => new(
                release,
                releaseId,
                actualSizeBytes,
                maximumSizeBytes,
                DownloadPreflightStatus.MaximumSizeExceeded,
                "The verified torrent size exceeds the configured maximum size.");

        public static PendingPreflight MetadataUnavailable(SelectedRelease release, string releaseId) => new(
            release,
            releaseId,
            null,
            null,
            DownloadPreflightStatus.MetadataUnavailable,
            "Torrent metadata could not be obtained before the timeout.");

        public DownloadPreflightResult ToResult() => new(
            ReleaseId,
            Release.ReleaseName,
            Release.ContentType,
            Release.SourceSizeBytes,
            ActualSizeBytes,
            MaximumSizeBytes,
            Status,
            Message);
    }
}
