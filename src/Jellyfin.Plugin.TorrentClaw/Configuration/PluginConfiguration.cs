using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.TorrentClaw.Configuration;

/// <summary>Persistent plugin configuration. Secret values are never returned by the plugin API.</summary>
public sealed class PluginConfiguration : BasePluginConfiguration
{
    public string TorrentClawBaseUrl { get; set; } = "https://torrentclaw.com";

    public string TorrentClawApiKey { get; set; } = string.Empty;

    public int TorrentClawTimeoutSeconds { get; set; } = 15;

    public int TorrentClawMaxRetries { get; set; } = 2;

    public string QbittorrentBaseUrl { get; set; } = "http://127.0.0.1:8080";

    public string QbittorrentUsername { get; set; } = string.Empty;

    public string QbittorrentPassword { get; set; } = string.Empty;

    public int QbittorrentTimeoutSeconds { get; set; } = 15;

    public string QbittorrentCategory { get; set; } = "movies";

    public string MovieSavePath { get; set; } = string.Empty;

    public string TvSavePath { get; set; } = string.Empty;

    public string DownloadDirectory { get; set; } = string.Empty;

    public string PreferredResolution { get; set; } = "2160p";

    public string PreferredCodec { get; set; } = "HEVC";

    public string PreferredHdr { get; set; } = "HDR10";

    public string PreferredLanguage { get; set; } = "it";

    public string PreferredSubtitleLanguage { get; set; } = string.Empty;

    public double MaxSizeGb { get; set; } = 30;

    public int MinimumSeeders { get; set; } = 5;

    public bool PreferRemux { get; set; }

    public int DownloadPollSeconds { get; set; } = 15;
}
