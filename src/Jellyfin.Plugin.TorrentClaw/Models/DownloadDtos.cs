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

    public TorrentStatus? Status { get; set; }

    public bool LibraryRefreshRequested { get; set; }
}

public sealed record StartDownloadRequest
{
    [Required]
    [RegularExpression(ReleaseIdentifier.Pattern)]
    public string ReleaseId { get; init; } = string.Empty;
}

public sealed record DeleteDownloadRequest(bool DeleteFiles = false);
