using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.TorrentClaw.Models;

public enum DownloadState
{
    Unknown,
    Queued,
    Downloading,
    Paused,
    Stalled,
    Checking,
    Completed,
    Error,
    MissingFiles
}

public sealed record TorrentStatus(
    [property: JsonIgnore] string Hash,
    string Name,
    double Progress,
    long DownloadSpeed,
    long DownloadedBytes,
    long TotalBytes,
    long EtaSeconds,
    DownloadState State,
    string SavePath,
    string? Error);

public sealed record DownloadItem
{
    public required Guid Id { get; init; }

    /// <summary>
    /// Info hash used internally for qBittorrent calls; never serialized to the browser.
    /// Not <c>required</c>: System.Text.Json refuses to serialize ignored required properties.
    /// </summary>
    [JsonIgnore]
    public string Hash { get; init; } = string.Empty;

    public required string ReleaseName { get; init; }

    public required ContentKind ContentType { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>
    /// Size supplied by TorrentClaw when the release was searched. This value is informative only;
    /// <see cref="TorrentStatus.TotalBytes"/> is the size verified from the torrent metainfo.
    /// </summary>
    public long? SourceSizeBytes { get; init; }

    public TorrentStatus? Status { get; set; }

    public bool LibraryRefreshRequested { get; set; }
}

public sealed record StartDownloadRequest
{
    [Required]
    [RegularExpression(ReleaseIdentifier.Pattern)]
    public string ReleaseId { get; init; } = string.Empty;
}

public enum DownloadPreflightStatus
{
    Ready,
    MaximumSizeExceeded,
    MetadataUnavailable
}

/// <summary>Result of adding a magnet only long enough for qBittorrent to obtain its metainfo.</summary>
public sealed record DownloadPreflightResult(
    string ReleaseId,
    string ReleaseName,
    ContentKind ContentType,
    long? SourceSizeBytes,
    long? ActualSizeBytes,
    long? MaximumSizeBytes,
    DownloadPreflightStatus Status,
    string Message);

/// <summary>Explicit, administrator-requested magnet disclosure for the clipboard action.</summary>
public sealed record ReleaseMagnetResponse(string Url);

public sealed record DeleteDownloadRequest(bool DeleteFiles = false);
