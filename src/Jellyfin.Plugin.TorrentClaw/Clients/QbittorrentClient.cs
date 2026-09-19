using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Security;

namespace Jellyfin.Plugin.TorrentClaw.Clients;

public interface IQbittorrentClient
{
    Task AuthenticateAsync(CancellationToken cancellationToken);

    Task AddTorrentAsync(
        string magnetUrl,
        string category,
        string savePath,
        CancellationToken cancellationToken);

    /// <summary>
    /// Adds a magnet and stops it as soon as qBittorrent has received the torrent metainfo.
    /// This allows the plugin to verify the actual total size before content download is confirmed.
    /// </summary>
    Task AddMetadataPreflightAsync(
        string magnetUrl,
        string category,
        string savePath,
        CancellationToken cancellationToken);

    Task<TorrentStatus?> GetTorrentStatusAsync(string hash, CancellationToken cancellationToken);

    Task PauseAsync(string hash, CancellationToken cancellationToken);

    Task ResumeAsync(string hash, CancellationToken cancellationToken);

    Task DeleteTorrentAsync(string hash, bool deleteFiles, CancellationToken cancellationToken);

    Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken);
}

public sealed class QbittorrentClient : IQbittorrentClient
{
    private const string ClientName = "Qbittorrent";
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ITorrentClawConfiguration _configuration;
    private readonly IUrlSecurityValidator _urlValidator;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public QbittorrentClient(
        IHttpClientFactory httpClientFactory,
        ITorrentClawConfiguration configuration,
        IUrlSecurityValidator urlValidator)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _urlValidator = urlValidator;
    }

    public async Task AuthenticateAsync(CancellationToken cancellationToken)
    {
        _ = await AuthenticateCoreAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task AddTorrentAsync(
        string magnetUrl,
        string category,
        string savePath,
        CancellationToken cancellationToken)
    {
        await AddTorrentCoreAsync(magnetUrl, category, savePath, stopWhenMetadataReceived: false, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task AddMetadataPreflightAsync(
        string magnetUrl,
        string category,
        string savePath,
        CancellationToken cancellationToken)
    {
        await AddTorrentCoreAsync(magnetUrl, category, savePath, stopWhenMetadataReceived: true, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task AddTorrentCoreAsync(
        string magnetUrl,
        string category,
        string savePath,
        bool stopWhenMetadataReceived,
        CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(magnetUrl, UriKind.Absolute, out var magnet)
            || !magnet.Scheme.Equals("magnet", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("A valid magnet URI is required.", nameof(magnetUrl));
        }

        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(magnetUrl), "urls");
        content.Add(new StringContent(category ?? string.Empty), "category");
        content.Add(new StringContent(savePath ?? string.Empty), "savepath");
        if (stopWhenMetadataReceived)
        {
            // Web API v2.8.15+: fetch the metainfo, then stop before the payload transfer starts.
            content.Add(new StringContent("MetadataReceived"), "stop_condition");
        }

        using var response = await SendAuthenticatedAsync(
            HttpMethod.Post,
            "api/v2/torrents/add",
            content,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<TorrentStatus?> GetTorrentStatusAsync(
        string hash,
        CancellationToken cancellationToken)
    {
        ValidateHash(hash);
        using var response = await SendAuthenticatedAsync(
            HttpMethod.Get,
            $"api/v2/torrents/info?hashes={Uri.EscapeDataString(hash)}",
            null,
            cancellationToken).ConfigureAwait(false);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken)
            .ConfigureAwait(false);
        QbittorrentTorrent[] torrents;
        try
        {
            torrents = await JsonSerializer.DeserializeAsync<QbittorrentTorrent[]>(
                stream,
                _jsonOptions,
                cancellationToken).ConfigureAwait(false) ?? [];
        }
        catch (JsonException ex)
        {
            throw new QbittorrentProtocolException("qBittorrent returned malformed JSON.", ex);
        }

        return torrents.Length == 0 ? null : Map(torrents[0]);
    }

    public Task PauseAsync(string hash, CancellationToken cancellationToken) =>
        PostHashActionAsync("api/v2/torrents/stop", hash, cancellationToken);

    public Task ResumeAsync(string hash, CancellationToken cancellationToken) =>
        PostHashActionAsync("api/v2/torrents/start", hash, cancellationToken);

    public async Task DeleteTorrentAsync(
        string hash,
        bool deleteFiles,
        CancellationToken cancellationToken)
    {
        ValidateHash(hash);
        using var content = new FormUrlEncodedContent(
        [
            new KeyValuePair<string, string>("hashes", hash),
            new KeyValuePair<string, string>("deleteFiles", deleteFiles ? "true" : "false")
        ]);
        using var response = await SendAuthenticatedAsync(
            HttpMethod.Post,
            "api/v2/torrents/delete",
            content,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken)
    {
        try
        {
            await AuthenticateAsync(cancellationToken).ConfigureAwait(false);
            return new ConnectionTestResult("Connected", "Connected");
        }
        catch (QbittorrentAuthenticationException)
        {
            return new ConnectionTestResult("Unauthorized", "Unauthorized");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ConnectionTestResult("Timeout", "Timeout");
        }
        catch (ArgumentException ex)
        {
            return new ConnectionTestResult("ConfigurationError", ex.Message);
        }
        catch (HttpRequestException)
        {
            return new ConnectionTestResult("ServiceUnavailable", "Service unavailable");
        }
    }

    public static DownloadState MapState(string? value) => value?.ToLowerInvariant() switch
    {
        "downloading" or "forceddl" or "metadl" => DownloadState.Downloading,
        "queueddl" or "queuedup" => DownloadState.Queued,
        "pauseddl" or "pausedup" or "stoppeddl" or "stoppedup" => DownloadState.Paused,
        "stalleddl" => DownloadState.Stalled,
        "checkingdl" or "checkingup" or "checkingresumeData" or "checkingresumedata" => DownloadState.Checking,
        "uploading" or "forcedup" or "stalledup" => DownloadState.Completed,
        "error" => DownloadState.Error,
        "missingfiles" => DownloadState.MissingFiles,
        _ => DownloadState.Unknown
    };

    private async Task<QbittorrentSessionCookie> AuthenticateCoreAsync(CancellationToken cancellationToken)
    {
        var settings = _configuration.GetQbittorrentSettings();
        if (string.IsNullOrWhiteSpace(settings.Username) || string.IsNullOrEmpty(settings.Password))
        {
            throw new ArgumentException("qBittorrent username and password are required.");
        }

        var baseUri = _urlValidator.ValidateQbittorrent(settings.BaseUrl);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
        using var content = new FormUrlEncodedContent(
        [
            new KeyValuePair<string, string>("username", settings.Username),
            new KeyValuePair<string, string>("password", settings.Password)
        ]);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "api/v2/auth/login"))
        {
            Content = content
        };
        using var response = await _httpClientFactory.CreateClient(ClientName)
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
            .ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
        var hasExpectedLegacyBody = body.Trim().Equals("Ok.", StringComparison.Ordinal);
        var hasCurrentNoContentResponse = response.StatusCode == HttpStatusCode.NoContent;
        if (!response.IsSuccessStatusCode || (!hasExpectedLegacyBody && !hasCurrentNoContentResponse))
        {
            throw new QbittorrentAuthenticationException();
        }

        if (!response.Headers.TryGetValues("Set-Cookie", out var cookieValues))
        {
            throw new QbittorrentProtocolException("qBittorrent did not return an authentication cookie.");
        }

        var sessionCookie = cookieValues.Select(ParseSessionCookie).FirstOrDefault(value => value is not null);
        return sessionCookie ?? throw new QbittorrentProtocolException(
            "qBittorrent did not return a valid authentication cookie.");
    }

    private async Task<HttpResponseMessage> SendAuthenticatedAsync(
        HttpMethod method,
        string relativePath,
        HttpContent? content,
        CancellationToken cancellationToken)
    {
        var settings = _configuration.GetQbittorrentSettings();
        var baseUri = _urlValidator.ValidateQbittorrent(settings.BaseUrl);
        var sessionCookie = await AuthenticateCoreAsync(cancellationToken).ConfigureAwait(false);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
        using var request = new HttpRequestMessage(method, new Uri(baseUri, relativePath))
        {
            Content = content
        };
        request.Headers.TryAddWithoutValidation("Cookie", $"{sessionCookie.Name}={sessionCookie.Value}");
        var response = await _httpClientFactory.CreateClient(ClientName)
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
            .ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var status = response.StatusCode;
            response.Dispose();
            throw new HttpRequestException(
                $"qBittorrent returned HTTP {(int)status}.",
                null,
                status);
        }

        return response;
    }

    private async Task PostHashActionAsync(
        string relativePath,
        string hash,
        CancellationToken cancellationToken)
    {
        ValidateHash(hash);
        using var content = new FormUrlEncodedContent(
        [
            new KeyValuePair<string, string>("hashes", hash)
        ]);
        using var response = await SendAuthenticatedAsync(
            HttpMethod.Post,
            relativePath,
            content,
            cancellationToken).ConfigureAwait(false);
    }

    private static QbittorrentSessionCookie? ParseSessionCookie(string cookie)
    {
        var first = cookie.Split(';', 2)[0].Trim();
        var separator = first.IndexOf('=', StringComparison.Ordinal);
        if (separator <= 0 || separator == first.Length - 1)
        {
            return null;
        }

        var name = first[..separator];
        if (!name.Equals("SID", StringComparison.OrdinalIgnoreCase)
            && !name.StartsWith("QBT_SID_", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return new QbittorrentSessionCookie(name, first[(separator + 1)..]);
    }

    private static void ValidateHash(string hash)
    {
        if (hash.Length is not (40 or 64) || !hash.All(Uri.IsHexDigit))
        {
            throw new ArgumentException("A valid torrent info hash is required.", nameof(hash));
        }
    }

    private static TorrentStatus Map(QbittorrentTorrent torrent) => new(
        torrent.Hash,
        torrent.Name,
        torrent.Progress,
        torrent.DownloadSpeed,
        torrent.Downloaded,
        torrent.TotalSize,
        torrent.Eta,
        torrent.Progress >= 1 ? DownloadState.Completed : MapState(torrent.State),
        torrent.SavePath,
        MapState(torrent.State) is DownloadState.Error or DownloadState.MissingFiles
            ? torrent.State
            : null);

    private sealed record QbittorrentTorrent
    {
        [JsonPropertyName("hash")]
        public string Hash { get; init; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; init; } = string.Empty;

        [JsonPropertyName("progress")]
        public double Progress { get; init; }

        [JsonPropertyName("dlspeed")]
        public long DownloadSpeed { get; init; }

        [JsonPropertyName("downloaded")]
        public long Downloaded { get; init; }

        [JsonPropertyName("total_size")]
        public long TotalSize { get; init; }

        [JsonPropertyName("eta")]
        public long Eta { get; init; }

        [JsonPropertyName("state")]
        public string State { get; init; } = string.Empty;

        [JsonPropertyName("save_path")]
        public string SavePath { get; init; } = string.Empty;
    }

    private sealed record QbittorrentSessionCookie(string Name, string Value);
}

public sealed class QbittorrentAuthenticationException : UnauthorizedAccessException
{
    public QbittorrentAuthenticationException()
        : base("qBittorrent authentication failed.")
    {
    }
}

public sealed class QbittorrentProtocolException : Exception
{
    public QbittorrentProtocolException(string message)
        : base(message)
    {
    }

    public QbittorrentProtocolException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
