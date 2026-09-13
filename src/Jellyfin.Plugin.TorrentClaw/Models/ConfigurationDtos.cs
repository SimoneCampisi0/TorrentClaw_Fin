namespace Jellyfin.Plugin.TorrentClaw.Models;

/// <summary>Configuration returned to the browser. Secrets are reduced to "configured" flags.</summary>
public sealed record ConfigurationView
{
    public string TorrentClawBaseUrl { get; init; } = string.Empty;
    public bool TorrentClawApiKeyConfigured { get; init; }
    public int TorrentClawTimeoutSeconds { get; init; }
    public int TorrentClawMaxRetries { get; init; }
    public string QbittorrentBaseUrl { get; init; } = string.Empty;
    public string QbittorrentUsername { get; init; } = string.Empty;
    public bool QbittorrentPasswordConfigured { get; init; }
    public int QbittorrentTimeoutSeconds { get; init; }
    public string QbittorrentCategory { get; init; } = string.Empty;
    public string MovieSavePath { get; init; } = string.Empty;
    public string TvSavePath { get; init; } = string.Empty;
    public string DownloadDirectory { get; init; } = string.Empty;
    public string PreferredResolution { get; init; } = string.Empty;
    public string PreferredCodec { get; init; } = string.Empty;
    public string PreferredHdr { get; init; } = string.Empty;
    public string PreferredAudioLanguage { get; init; } = string.Empty;
    public string PreferredSubtitleLanguage { get; init; } = string.Empty;
    public double MaxSizeGb { get; init; }
    public int MinimumSeeders { get; init; }
    public bool PreferRemux { get; init; }
    public int DownloadPollSeconds { get; init; }
}

/// <summary>Configuration submitted by the Settings page. Empty secret fields keep the stored value.</summary>
public sealed record ConfigurationUpdate
{
    public string? TorrentClawBaseUrl { get; init; }
    public string? TorrentClawApiKey { get; init; }
    public int TorrentClawTimeoutSeconds { get; init; } = 15;
    public int TorrentClawMaxRetries { get; init; } = 2;
    public string? QbittorrentBaseUrl { get; init; }
    public string? QbittorrentUsername { get; init; }
    public string? QbittorrentPassword { get; init; }
    public int QbittorrentTimeoutSeconds { get; init; } = 15;
    public string? QbittorrentCategory { get; init; }
    public string? MovieSavePath { get; init; }
    public string? TvSavePath { get; init; }
    public string? DownloadDirectory { get; init; }
    public string? PreferredResolution { get; init; }
    public string? PreferredCodec { get; init; }
    public string? PreferredHdr { get; init; }
    public string? PreferredAudioLanguage { get; init; }
    public string? PreferredSubtitleLanguage { get; init; }

    /// <summary>Legacy alias for <see cref="PreferredAudioLanguage"/>.</summary>
    public string? PreferredLanguage { get; init; }

    public double MaxSizeGb { get; init; }
    public int MinimumSeeders { get; init; }
    public bool PreferRemux { get; init; }
    public int DownloadPollSeconds { get; init; } = 15;
}
