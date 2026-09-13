namespace Jellyfin.Plugin.TorrentClaw.Configuration;

public sealed class DevelopmentApiKeyFileCredentialsProvider : IDevelopmentApiKeyFileCredentialsProvider
{
    private readonly string _path;

    public DevelopmentApiKeyFileCredentialsProvider(string developmentRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(developmentRoot);
        _path = Path.Combine(Path.GetFullPath(developmentRoot), "API_KEY.txt");
    }

    public async ValueTask<string> GetApiKeyAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_path))
        {
            throw new TorrentClawConfigurationException(
                "TorrentClaw development API key file API_KEY.txt not found.");
        }

        var value = (await File.ReadAllTextAsync(_path, cancellationToken).ConfigureAwait(false)).Trim();
        if (value.Length == 0)
        {
            throw new TorrentClawConfigurationException("TorrentClaw API key is empty.");
        }

        return value;
    }
}

public sealed class TorrentClawCredentialsProvider : ITorrentClawCredentialsProvider
{
    private readonly ITorrentClawConfiguration _configuration;
    private readonly IDevelopmentApiKeyFileCredentialsProvider _developmentFile;
    private readonly bool _isDevelopment;

    public TorrentClawCredentialsProvider(
        ITorrentClawConfiguration configuration,
        IDevelopmentApiKeyFileCredentialsProvider developmentFile,
        bool isDevelopment)
    {
        _configuration = configuration;
        _developmentFile = developmentFile;
        _isDevelopment = isDevelopment;
    }

    public ValueTask<string> GetApiKeyAsync(CancellationToken cancellationToken)
    {
        var configured = _configuration.GetTorrentClawSettings().ApiKey;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return ValueTask.FromResult(configured.Trim());
        }

        if (!_isDevelopment)
        {
            throw new TorrentClawConfigurationException(
                "TorrentClaw API key is not configured in Jellyfin.");
        }

        return _developmentFile.GetApiKeyAsync(cancellationToken);
    }
}

public sealed class TorrentClawConfigurationException : InvalidOperationException
{
    public TorrentClawConfigurationException(string message)
        : base(message)
    {
    }
}

