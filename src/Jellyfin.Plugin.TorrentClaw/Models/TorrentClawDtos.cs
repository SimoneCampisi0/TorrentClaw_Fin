using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.TorrentClaw.Models;

public enum ContentKind
{
    Movie,
    Show
}

public enum ReleaseSort
{
    Compatibility,
    Quality,
    Seeders,
    Size
}

public sealed record ReleaseSearchRequest
{
    [Required]
    [StringLength(200, MinimumLength = 1)]
    public required string Query { get; init; }

    public ContentKind Type { get; init; }

    public string? Resolution { get; init; }

    public string? Codec { get; init; }

    public string? Hdr { get; init; }

    /// <summary>Required audio-track language(s), as comma-separated ISO 639 codes.</summary>
    public string? AudioLanguage { get; init; }

    /// <summary>Required subtitle language(s), as comma-separated ISO 639 codes, or "none".</summary>
    public string? SubtitleLanguage { get; init; }

    /// <summary>Legacy alias for <see cref="AudioLanguage"/>.</summary>
    public string? Language { get; init; }

    public string? Audio { get; init; }

    public double? MaxSizeGb { get; init; }

    public int? MinimumSeeders { get; init; }

    public bool PreferRemux { get; init; }

    public bool VerifiedOnly { get; init; }

    public ReleaseSort Sort { get; init; } = ReleaseSort.Compatibility;
}

/// <summary>Release data returned to the browser. It never contains magnets, info hashes or external URLs.</summary>
public sealed record ReleaseResult
{
    public required string ReleaseId { get; init; }

    public required string Title { get; init; }

    public int? Year { get; init; }

    public required string ReleaseName { get; init; }

    public required ContentKind ContentType { get; init; }

    /// <summary>
    /// True when a validated poster is available at <c>TorrentClaw/Search/{ReleaseId}/Poster</c>.
    /// The external poster URL itself stays on the server.
    /// </summary>
    public bool HasPoster { get; init; }

    public string? Source { get; init; }

    public string? Resolution { get; init; }

    public string? Codec { get; init; }

    public string? Hdr { get; init; }

    public bool DolbyVision { get; init; }

    public string? Audio { get; init; }

    public IReadOnlyList<TorrentClawAudioTrack> AudioTracks { get; init; } = [];

    public IReadOnlyList<TorrentClawSubtitleTrack> SubtitleTracks { get; init; } = [];

    public IReadOnlyList<string> AudioLanguages { get; init; } = [];

    public IReadOnlyList<string> SubtitleLanguages { get; init; } = [];

    public string AudioLanguageSource { get; init; } = "Unknown";

    public string SubtitleLanguageSource { get; init; } = "Unknown";

    /// <summary>Legacy language list retained for API compatibility.</summary>
    public IReadOnlyList<string> Languages { get; init; } = [];

    public long? SizeBytes { get; init; }

    public int Seeders { get; init; }

    public int Leechers { get; init; }

    public bool TrueSpec { get; init; }

    public int? TorrentClawScore { get; init; }

    public int CompatibilityScore { get; init; }

    public bool Eligible { get; init; }

    public IReadOnlyList<string> ConstraintsSatisfied { get; init; } = [];

    public IReadOnlyList<string> ConstraintsViolated { get; init; } = [];

    public IReadOnlyList<string> PreferenceMatches { get; init; } = [];

    public IReadOnlyList<string> Warnings { get; init; } = [];
}

public sealed record TorrentClawSearchResponse
{
    [JsonPropertyName("total")]
    public int Total { get; init; }

    [JsonPropertyName("results")]
    public List<TorrentClawContentResult> Results { get; init; } = [];
}

public sealed record TorrentClawContentResult
{
    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("year")]
    public int? Year { get; init; }

    [JsonPropertyName("contentType")]
    public string ContentType { get; init; } = string.Empty;

    [JsonPropertyName("posterUrl")]
    public string? PosterUrl { get; init; }

    [JsonPropertyName("torrents")]
    public List<TorrentClawTorrent> Torrents { get; init; } = [];
}

public sealed record TorrentClawTorrent
{
    [JsonPropertyName("infoHash")]
    public string InfoHash { get; init; } = string.Empty;

    [JsonPropertyName("rawTitle")]
    public string RawTitle { get; init; } = string.Empty;

    [JsonPropertyName("quality")]
    public string? Quality { get; init; }

    [JsonPropertyName("codec")]
    public string? Codec { get; init; }

    [JsonPropertyName("sourceType")]
    public string? SourceType { get; init; }

    [JsonPropertyName("sizeBytes")]
    public long? SizeBytes { get; init; }

    [JsonPropertyName("seeders")]
    public int Seeders { get; init; }

    [JsonPropertyName("leechers")]
    public int Leechers { get; init; }

    [JsonPropertyName("magnetUrl")]
    public string? MagnetUrl { get; init; }

    [JsonPropertyName("source")]
    public string Source { get; init; } = string.Empty;

    [JsonPropertyName("qualityScore")]
    public int? QualityScore { get; init; }

    [JsonPropertyName("languages")]
    public List<string> Languages { get; init; } = [];

    [JsonPropertyName("audioCodec")]
    public string? AudioCodec { get; init; }

    [JsonPropertyName("audioTracks")]
    public List<TorrentClawAudioTrack> AudioTracks { get; init; } = [];

    [JsonPropertyName("subtitleTracks")]
    public List<TorrentClawSubtitleTrack> SubtitleTracks { get; init; } = [];

    [JsonPropertyName("subtitleLanguages")]
    public List<string> SubtitleLanguages { get; init; } = [];

    [JsonPropertyName("videoInfo")]
    public TorrentClawVideoInfo? VideoInfo { get; init; }

    [JsonPropertyName("scanStatus")]
    public string? ScanStatus { get; init; }

    [JsonPropertyName("threatLevel")]
    public string? ThreatLevel { get; init; }

    [JsonPropertyName("hdrType")]
    public string? HdrType { get; init; }

    [JsonPropertyName("releaseGroup")]
    public string? ReleaseGroup { get; init; }
}

public sealed record TorrentClawAudioTrack
{
    [JsonPropertyName("lang")]
    public string Lang { get; init; } = string.Empty;

    [JsonPropertyName("codec")]
    public string Codec { get; init; } = string.Empty;

    [JsonPropertyName("channels")]
    public int Channels { get; init; }

    [JsonPropertyName("title")]
    public string? Title { get; init; }

    [JsonPropertyName("default")]
    public bool Default { get; init; }
}

public sealed record TorrentClawSubtitleTrack
{
    [JsonPropertyName("lang")]
    public string Lang { get; init; } = string.Empty;

    [JsonPropertyName("codec")]
    public string Codec { get; init; } = string.Empty;

    [JsonPropertyName("title")]
    public string? Title { get; init; }

    [JsonPropertyName("forced")]
    public bool Forced { get; init; }

    [JsonPropertyName("default")]
    public bool Default { get; init; }
}

public sealed record TorrentClawVideoInfo
{
    [JsonPropertyName("codec")]
    public string? Codec { get; init; }

    [JsonPropertyName("hdr")]
    public string? Hdr { get; init; }
}

public sealed record ConnectionTestResult(string Status, string Message);
