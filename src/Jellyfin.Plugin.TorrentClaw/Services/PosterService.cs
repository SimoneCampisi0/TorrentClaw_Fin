using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Net;
using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Security;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TorrentClaw.Services;

public interface IPosterService
{
    /// <summary>
    /// Associates the poster advertised by TorrentClaw with an opaque release id.
    /// Returns <c>false</c> when the URL is missing or unsafe.
    /// </summary>
    bool RegisterPoster(string releaseId, string? posterUrl);

    Task<PosterImage?> GetPosterAsync(string releaseId, CancellationToken cancellationToken);
}

public sealed record PosterImage(byte[] Content, string ContentType);

/// <summary>
/// Downloads TorrentClaw posters on behalf of the browser. Only URLs received from TorrentClaw are fetched,
/// over HTTPS on the default port, without redirects, with a size limit, a content-type/signature check,
/// connect-time private-address blocking (see <see cref="PublicNetworkConnector"/>) and a bounded cache.
/// </summary>
public sealed class PosterService : IPosterService
{
    public const string HttpClientName = "TorrentClawPoster";
    public const int MaximumPosterBytes = 5 * 1024 * 1024;
    private const int MaximumUrlLength = 2048;
    private const int MaximumCachedImages = 64;
    private const long MaximumCachedBytes = 48L * 1024 * 1024;
    private const int MaximumRegisteredReleases = 2000;
    private const int ReadBufferBytes = 81920;
    private static readonly TimeSpan RegistrationLifetime = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan ImageLifetime = TimeSpan.FromHours(1);
    private static readonly TimeSpan DownloadTimeout = TimeSpan.FromSeconds(10);
    private static readonly Action<ILogger, string, Exception?> LogPosterUnavailable = LoggerMessage.Define<string>(
        LogLevel.Debug,
        new EventId(5001, "PosterUnavailable"),
        "Poster from host {PosterHost} could not be loaded.");

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PosterService> _logger;
    private readonly ConcurrentDictionary<string, RegisteredPoster> _registrations = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<Uri, CachedImage> _images = new();
    private readonly Lock _cacheLock = new();

    public PosterService(IHttpClientFactory httpClientFactory, ILogger<PosterService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public bool RegisterPoster(string releaseId, string? posterUrl)
    {
        if (!ReleaseIdentifier.IsValid(releaseId))
        {
            return false;
        }

        if (!TryCreatePosterUri(posterUrl, out var posterUri))
        {
            _registrations.TryRemove(releaseId, out _);
            return false;
        }

        if (_registrations.Count >= MaximumRegisteredReleases)
        {
            RemoveExpiredRegistrations();
            if (_registrations.Count >= MaximumRegisteredReleases && !_registrations.ContainsKey(releaseId))
            {
                return false;
            }
        }

        _registrations[releaseId] = new RegisteredPoster(posterUri, DateTimeOffset.UtcNow.Add(RegistrationLifetime));
        return true;
    }

    public async Task<PosterImage?> GetPosterAsync(string releaseId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        if (!ReleaseIdentifier.IsValid(releaseId)
            || !_registrations.TryGetValue(releaseId, out var registration)
            || registration.ExpiresAt < now)
        {
            return null;
        }

        if (_images.TryGetValue(registration.Uri, out var cached) && cached.ExpiresAt >= now)
        {
            return cached.Image;
        }

        var image = await DownloadAsync(registration.Uri, cancellationToken).ConfigureAwait(false);
        if (image is not null)
        {
            StoreInCache(registration.Uri, image);
        }

        return image;
    }

    public static bool TryCreatePosterUri(string? value, [NotNullWhen(true)] out Uri? posterUri)
    {
        posterUri = null;
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaximumUrlLength)
        {
            return false;
        }

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var candidate)
            || candidate.Scheme != Uri.UriSchemeHttps
            || !candidate.IsDefaultPort
            || !string.IsNullOrEmpty(candidate.UserInfo)
            || !string.IsNullOrEmpty(candidate.Fragment)
            || UrlSecurityValidator.IsLocalHostName(candidate.Host))
        {
            return false;
        }

        if (candidate.HostNameType is UriHostNameType.IPv4 or UriHostNameType.IPv6
            && (!IPAddress.TryParse(candidate.DnsSafeHost, out var address)
                || UrlSecurityValidator.IsPrivateOrSpecial(address)))
        {
            return false;
        }

        posterUri = candidate;
        return true;
    }

    public static string? DetectImageType(ReadOnlySpan<byte> content)
    {
        if (content.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF]))
        {
            return "image/jpeg";
        }

        if (content.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        {
            return "image/png";
        }

        if (content.StartsWith("GIF87a"u8) || content.StartsWith("GIF89a"u8))
        {
            return "image/gif";
        }

        if (content.Length >= 12 && content.StartsWith("RIFF"u8) && content[8..12].SequenceEqual("WEBP"u8))
        {
            return "image/webp";
        }

        return null;
    }

    private async Task<PosterImage?> DownloadAsync(Uri posterUri, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(DownloadTimeout);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, posterUri);
            request.Headers.Accept.ParseAdd("image/webp,image/png,image/jpeg;q=0.9,image/gif;q=0.8");
            using var response = await _httpClientFactory.CreateClient(HttpClientName)
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
                .ConfigureAwait(false);

            // Redirects are disabled on the handler, so a 3xx response is rejected like any other non-200 status.
            var declaredType = NormalizeMediaType(response.Content.Headers.ContentType?.MediaType);
            if (response.StatusCode != HttpStatusCode.OK
                || declaredType is null
                || response.Content.Headers.ContentLength > MaximumPosterBytes)
            {
                return Unavailable(posterUri, null);
            }

            var content = await ReadLimitedAsync(response.Content, timeout.Token).ConfigureAwait(false);
            if (content is null || DetectImageType(content) != declaredType)
            {
                return Unavailable(posterUri, null);
            }

            return new PosterImage(content, declaredType);
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            return Unavailable(posterUri, ex);
        }
        catch (HttpRequestException ex)
        {
            return Unavailable(posterUri, ex);
        }
    }

    private static async Task<byte[]?> ReadLimitedAsync(HttpContent content, CancellationToken cancellationToken)
    {
        await using var stream = await content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var buffer = new MemoryStream();
        var chunk = new byte[ReadBufferBytes];
        int read;
        while ((read = await stream.ReadAsync(chunk, cancellationToken).ConfigureAwait(false)) > 0)
        {
            if (buffer.Length + read > MaximumPosterBytes)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    private static string? NormalizeMediaType(string? mediaType) => mediaType?.Trim().ToLowerInvariant() switch
    {
        "image/jpeg" or "image/jpg" or "image/pjpeg" => "image/jpeg",
        "image/png" => "image/png",
        "image/webp" => "image/webp",
        "image/gif" => "image/gif",
        _ => null
    };

    private PosterImage? Unavailable(Uri posterUri, Exception? exception)
    {
        LogPosterUnavailable(_logger, posterUri.Host, exception);
        return null;
    }

    private void StoreInCache(Uri posterUri, PosterImage image)
    {
        lock (_cacheLock)
        {
            var now = DateTimeOffset.UtcNow;
            foreach (var expired in _images.Where(entry => entry.Value.ExpiresAt < now))
            {
                _images.TryRemove(expired.Key, out _);
            }

            while (!_images.IsEmpty
                &&(_images.Count >= MaximumCachedImages
                    || _images.Values.Sum(entry => (long)entry.Image.Content.Length) + image.Content.Length > MaximumCachedBytes))
            {
                var oldest = _images.MinBy(entry => entry.Value.ExpiresAt);
                _images.TryRemove(oldest.Key, out _);
            }

            _images[posterUri] = new CachedImage(image, now.Add(ImageLifetime));
        }
    }

    private void RemoveExpiredRegistrations()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var expired in _registrations.Where(entry => entry.Value.ExpiresAt < now))
        {
            _registrations.TryRemove(expired.Key, out _);
        }
    }

    private sealed record RegisteredPoster(Uri Uri, DateTimeOffset ExpiresAt);

    private sealed record CachedImage(PosterImage Image, DateTimeOffset ExpiresAt);
}
