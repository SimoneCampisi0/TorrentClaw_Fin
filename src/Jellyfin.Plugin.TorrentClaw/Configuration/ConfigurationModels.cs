namespace Jellyfin.Plugin.TorrentClaw.Configuration;

public sealed record TorrentClawSettings(
    string BaseUrl,
    string? ApiKey,
    int TimeoutSeconds,
    int MaxRetries);

public sealed record QbittorrentSettings(
    string BaseUrl,
    string Username,
    string Password,
    int TimeoutSeconds,
    string Category,
    string MovieSavePath,
    string TvSavePath,
    string DownloadDirectory);

public interface ITorrentClawConfiguration
{
    TorrentClawSettings GetTorrentClawSettings();

    QbittorrentSettings GetQbittorrentSettings();
}

public interface ITorrentClawCredentialsProvider
{
    ValueTask<string> GetApiKeyAsync(CancellationToken cancellationToken);
}

public interface IDevelopmentApiKeyFileCredentialsProvider
{
    ValueTask<string> GetApiKeyAsync(CancellationToken cancellationToken);
}

