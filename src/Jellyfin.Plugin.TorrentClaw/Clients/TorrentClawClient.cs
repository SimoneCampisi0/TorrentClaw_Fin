using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Security;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TorrentClaw.Clients;

public interface ITorrentClawClient
{
    Task<TorrentClawSearchResponse> SearchAsync(
        ReleaseSearchRequest request,
        CancellationToken cancellationToken);

    Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken);
}

public sealed class TorrentClawClient : ITorrentClawClient
{
    private const string ClientName = "TorrentClaw";
    private static readonly Action<ILogger, int, int, Exception?> LogRetry = LoggerMessage.Define<int, int>(
        LogLevel.Warning,
        new EventId(1001, "TorrentClawRetry"),
        "TorrentClaw request returned HTTP {StatusCode}; retrying attempt {Attempt}.");
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ITorrentClawConfiguration _configuration;
    private readonly ITorrentClawCredentialsProvider _credentials;
    private readonly IUrlSecurityValidator _urlValidator;
    private readonly ILogger<TorrentClawClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public TorrentClawClient(
        IHttpClientFactory httpClientFactory,
        ITorrentClawConfiguration configuration,
        ITorrentClawCredentialsProvider credentials,
        IUrlSecurityValidator urlValidator,
        ILogger<TorrentClawClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _credentials = credentials;
        _urlValidator = urlValidator;
        _logger = logger;
    }

    public Task<TorrentClawSearchResponse> SearchAsync(
        ReleaseSearchRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Query) || request.Query.Trim().Length > 200)
        {
            throw new ArgumentException("Search title must contain 1 to 200 characters.", nameof(request));
        }

        return SendSearchAsync(request, cancellationToken);
    }

    public async Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken)
    {
        try
        {
            _ = await SendSearchAsync(
                new ReleaseSearchRequest { Query = "Big Buck Bunny", Type = ContentKind.Movie },
                cancellationToken).ConfigureAwait(false);
            return new ConnectionTestResult("Connected", "Connected");
        }
        catch (TorrentClawApiException ex) when (ex.StatusCode == HttpStatusCode.Unauthorized)
        {
            return new ConnectionTestResult("InvalidApiKey", "Invalid API key");
        }
        catch (TorrentClawApiException ex) when (ex.StatusCode == HttpStatusCode.Forbidden)
        {
            return new ConnectionTestResult("Unauthorized", "Unauthorized");
        }
        catch (TorrentClawApiException ex) when (
            ex.StatusCode == HttpStatusCode.TooManyRequests
            || (int)ex.StatusCode >= 500)
        {
            return new ConnectionTestResult("ServiceUnavailable", "Service unavailable");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ConnectionTestResult("Timeout", "Timeout");
        }
        catch (TorrentClawConfigurationException ex)
        {
            return new ConnectionTestResult("ConfigurationError", ex.Message);
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

    private async Task<TorrentClawSearchResponse> SendSearchAsync(
        ReleaseSearchRequest request,
        CancellationToken cancellationToken)
    {
        var settings = _configuration.GetTorrentClawSettings();
        var baseUri = await _urlValidator.ValidateExternalServiceAsync(settings.BaseUrl, cancellationToken)
            .ConfigureAwait(false);
        var apiKey = await _credentials.GetApiKeyAsync(cancellationToken).ConfigureAwait(false);
        var requestUri = BuildSearchUri(baseUri, request);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));

        for (var attempt = 0; ; attempt++)
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, requestUri);
            message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            message.Headers.TryAddWithoutValidation("X-API-Key", apiKey);
            message.Headers.TryAddWithoutValidation("X-Search-Source", "jellyfin-plugin");
            using var response = await _httpClientFactory.CreateClient(ClientName)
                .SendAsync(message, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
                .ConfigureAwait(false);

            if (response.IsSuccessStatusCode)
            {
                await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token)
                    .ConfigureAwait(false);
                try
                {
                    var parsed = await JsonSerializer.DeserializeAsync<TorrentClawSearchResponse>(
                        stream,
                        _jsonOptions,
                        timeout.Token).ConfigureAwait(false)
                        ?? throw new TorrentClawProtocolException("TorrentClaw returned an empty response.");
                    return TorrentClawResponseNormalizer.Normalize(parsed);
                }
                catch (JsonException ex)
                {
                    throw new TorrentClawProtocolException("TorrentClaw returned malformed JSON.", ex);
                }
            }

            var retryable = response.StatusCode == HttpStatusCode.TooManyRequests
                || (int)response.StatusCode >= 500;
            if (!retryable || attempt >= settings.MaxRetries)
            {
                throw new TorrentClawApiException(response.StatusCode);
            }

            var delay = GetRetryDelay(response, attempt);
            LogRetry(_logger, (int)response.StatusCode, attempt + 1, null);
            await Task.Delay(delay, timeout.Token).ConfigureAwait(false);
        }
    }

    private static Uri BuildSearchUri(Uri baseUri, ReleaseSearchRequest request)
    {
        var values = new Dictionary<string, string?>
        {
            ["q"] = request.Query.Trim(),
            ["type"] = request.Type == ContentKind.Movie ? "movie" : "show",
            ["quality"] = NormalizeNullable(request.Resolution),
            ["lang"] = FirstLanguage(request.AudioLanguage ?? request.Language),
            ["subs"] = FirstLanguage(request.SubtitleLanguage),
            ["audio"] = NormalizeNullable(request.Audio),
            ["hdr"] = NormalizeHdrForApi(request.Hdr),
            ["verified"] = request.VerifiedOnly ? "true" : null,
            ["limit"] = "50",
            ["sort"] = request.Sort == ReleaseSort.Seeders ? "seeders" : "relevance"
        };
        var query = string.Join(
            "&",
            values.Where(pair => pair.Value is not null)
                .Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value!)}"));
        return new Uri(baseUri, $"api/v1/search?{query}");
    }

    private static string? NormalizeNullable(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? FirstLanguage(string? value)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null || normalized.Equals("none", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return normalized.Split([',', ';', '+'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault();
    }

    private static string? NormalizeHdrForApi(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Equals("SDR", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return value.Trim().ToLowerInvariant() switch
        {
            "dolby vision" or "dolby_vision" or "dv" => "dolby_vision",
            "hdr10+" or "hdr10plus" => "hdr10_plus",
            _ => value.Trim().ToLowerInvariant()
        };
    }

    private static TimeSpan GetRetryDelay(HttpResponseMessage response, int attempt)
    {
        var retryAfter = response.Headers.RetryAfter?.Delta;
        if (retryAfter is { } serverDelay)
        {
            return serverDelay > TimeSpan.FromSeconds(5) ? TimeSpan.FromSeconds(5) : serverDelay;
        }

        return TimeSpan.FromMilliseconds(Math.Min(4000, 250 * Math.Pow(2, attempt)));
    }
}

public sealed class TorrentClawApiException : HttpRequestException
{
    public TorrentClawApiException(HttpStatusCode statusCode)
        : base($"TorrentClaw returned HTTP {(int)statusCode}.", null, statusCode)
    {
        StatusCode = statusCode;
    }

    public new HttpStatusCode StatusCode { get; }
}

public sealed class TorrentClawProtocolException : Exception
{
    public TorrentClawProtocolException(string message)
        : base(message)
    {
    }

    public TorrentClawProtocolException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
