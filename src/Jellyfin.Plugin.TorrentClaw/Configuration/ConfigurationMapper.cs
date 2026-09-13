using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Configuration;

/// <summary>Converts between the persisted configuration and the browser DTOs.</summary>
public static class ConfigurationMapper
{
    public const int MinimumTimeoutSeconds = 1;
    public const int MaximumTimeoutSeconds = 120;
    public const int MaximumRetries = 3;
    public const int MinimumPollSeconds = 10;
    public const int MaximumPollSeconds = 300;

    public static ConfigurationView ToView(PluginConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        return new ConfigurationView
        {
            TorrentClawBaseUrl = configuration.TorrentClawBaseUrl,
            TorrentClawApiKeyConfigured = !string.IsNullOrWhiteSpace(configuration.TorrentClawApiKey),
            TorrentClawTimeoutSeconds = configuration.TorrentClawTimeoutSeconds,
            TorrentClawMaxRetries = configuration.TorrentClawMaxRetries,
            QbittorrentBaseUrl = configuration.QbittorrentBaseUrl,
            QbittorrentUsername = configuration.QbittorrentUsername,
            QbittorrentPasswordConfigured = !string.IsNullOrEmpty(configuration.QbittorrentPassword),
            QbittorrentTimeoutSeconds = configuration.QbittorrentTimeoutSeconds,
            QbittorrentCategory = configuration.QbittorrentCategory,
            MovieSavePath = configuration.MovieSavePath,
            TvSavePath = configuration.TvSavePath,
            DownloadDirectory = configuration.DownloadDirectory,
            PreferredResolution = configuration.PreferredResolution,
            PreferredCodec = configuration.PreferredCodec,
            PreferredHdr = configuration.PreferredHdr,
            PreferredAudioLanguage = configuration.PreferredLanguage,
            PreferredSubtitleLanguage = configuration.PreferredSubtitleLanguage,
            MaxSizeGb = configuration.MaxSizeGb,
            MinimumSeeders = configuration.MinimumSeeders,
            PreferRemux = configuration.PreferRemux,
            DownloadPollSeconds = configuration.DownloadPollSeconds
        };
    }

    /// <summary>Builds the configuration to persist. Blank secret fields preserve the existing secret.</summary>
    public static PluginConfiguration ApplyUpdate(PluginConfiguration existing, ConfigurationUpdate request)
    {
        ArgumentNullException.ThrowIfNull(existing);
        ArgumentNullException.ThrowIfNull(request);
        return new PluginConfiguration
        {
            TorrentClawBaseUrl = RequireUrl(request.TorrentClawBaseUrl, "TorrentClaw Base URL", httpsOnly: true),
            TorrentClawApiKey = PreserveSecret(request.TorrentClawApiKey, existing.TorrentClawApiKey),
            TorrentClawTimeoutSeconds = Math.Clamp(request.TorrentClawTimeoutSeconds, MinimumTimeoutSeconds, MaximumTimeoutSeconds),
            TorrentClawMaxRetries = Math.Clamp(request.TorrentClawMaxRetries, 0, MaximumRetries),
            QbittorrentBaseUrl = RequireUrl(request.QbittorrentBaseUrl, "qBittorrent Base URL", httpsOnly: false),
            QbittorrentUsername = request.QbittorrentUsername?.Trim() ?? string.Empty,
            QbittorrentPassword = PreserveSecret(request.QbittorrentPassword, existing.QbittorrentPassword),
            QbittorrentTimeoutSeconds = Math.Clamp(request.QbittorrentTimeoutSeconds, MinimumTimeoutSeconds, MaximumTimeoutSeconds),
            QbittorrentCategory = request.QbittorrentCategory?.Trim() ?? string.Empty,
            MovieSavePath = request.MovieSavePath?.Trim() ?? string.Empty,
            TvSavePath = request.TvSavePath?.Trim() ?? string.Empty,
            DownloadDirectory = request.DownloadDirectory?.Trim() ?? string.Empty,
            PreferredResolution = request.PreferredResolution?.Trim() ?? string.Empty,
            PreferredCodec = request.PreferredCodec?.Trim() ?? string.Empty,
            PreferredHdr = request.PreferredHdr?.Trim() ?? string.Empty,
            PreferredLanguage = request.PreferredAudioLanguage?.Trim()
                ?? request.PreferredLanguage?.Trim()
                ?? existing.PreferredLanguage,
            PreferredSubtitleLanguage = request.PreferredSubtitleLanguage?.Trim() ?? string.Empty,
            MaxSizeGb = Math.Max(0, request.MaxSizeGb),
            MinimumSeeders = Math.Max(0, request.MinimumSeeders),
            PreferRemux = request.PreferRemux,
            DownloadPollSeconds = Math.Clamp(request.DownloadPollSeconds, MinimumPollSeconds, MaximumPollSeconds)
        };
    }

    private static string PreserveSecret(string? submitted, string existing) =>
        string.IsNullOrWhiteSpace(submitted) ? existing : submitted.Trim();

    private static string RequireUrl(string? value, string name, bool httpsOnly)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{name} is required.");
        }

        var trimmed = value.Trim();
        var validScheme = Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttps || (!httpsOnly && uri.Scheme == Uri.UriSchemeHttp));
        if (!validScheme || !string.IsNullOrEmpty(uri!.UserInfo))
        {
            var schemes = httpsOnly ? "HTTPS" : "HTTP(S)";
            throw new ArgumentException($"{name} must be a valid {schemes} URL without credentials.");
        }

        return trimmed;
    }
}
