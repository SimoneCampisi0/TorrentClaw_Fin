namespace Jellyfin.Plugin.TorrentClaw.Configuration;

public sealed class PluginConfigurationProvider : ITorrentClawConfiguration
{
    public TorrentClawSettings GetTorrentClawSettings()
    {
        var value = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return new TorrentClawSettings(
            value.TorrentClawBaseUrl,
            NullIfWhiteSpace(value.TorrentClawApiKey),
            Math.Clamp(value.TorrentClawTimeoutSeconds, 1, 120),
            Math.Clamp(value.TorrentClawMaxRetries, 0, 3));
    }

    public QbittorrentSettings GetQbittorrentSettings()
    {
        var value = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return new QbittorrentSettings(
            value.QbittorrentBaseUrl,
            value.QbittorrentUsername.Trim(),
            value.QbittorrentPassword,
            Math.Clamp(value.QbittorrentTimeoutSeconds, 1, 120),
            value.QbittorrentCategory.Trim(),
            value.MovieSavePath.Trim(),
            value.TvSavePath.Trim(),
            value.DownloadDirectory.Trim());
    }

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

