using System.Net;
using System.Net.Sockets;

namespace Jellyfin.Plugin.TorrentClaw.Security;

public interface IUrlSecurityValidator
{
    ValueTask<Uri> ValidateExternalServiceAsync(string value, CancellationToken cancellationToken);

    Uri ValidateQbittorrent(string value);
}

public sealed class UrlSecurityValidator : IUrlSecurityValidator
{
    public async ValueTask<Uri> ValidateExternalServiceAsync(
        string value,
        CancellationToken cancellationToken)
    {
        var uri = ParseHttpUri(value);
        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("TorrentClaw Base URL must use HTTPS.", nameof(value));
        }

        if (uri.IsLoopback || IsLocalHostName(uri.Host))
        {
            throw new ArgumentException("TorrentClaw Base URL cannot target a local address.", nameof(value));
        }

        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(uri.DnsSafeHost, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (SocketException ex)
        {
            throw new ArgumentException("TorrentClaw Base URL host could not be resolved.", nameof(value), ex);
        }

        if (addresses.Length == 0 || addresses.Any(IsPrivateOrSpecial))
        {
            throw new ArgumentException(
                "TorrentClaw Base URL resolved to a private or special-purpose address.",
                nameof(value));
        }

        return uri;
    }

    public Uri ValidateQbittorrent(string value) => ParseHttpUri(value);

    private static Uri ParseHttpUri(string value)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Fragment))
        {
            throw new ArgumentException("A valid HTTP(S) Base URL without credentials is required.", nameof(value));
        }

        return new Uri(uri.GetLeftPart(UriPartial.Authority).TrimEnd('/') + "/", UriKind.Absolute);
    }

    internal static bool IsLocalHostName(string host) =>
        host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase)
        || host.EndsWith(".local", StringComparison.OrdinalIgnoreCase);

    internal static bool IsPrivateOrSpecial(IPAddress address)
    {
        if (IPAddress.IsLoopback(address)
            || address.Equals(IPAddress.Any)
            || address.Equals(IPAddress.IPv6Any)
            || address.Equals(IPAddress.None)
            || address.Equals(IPAddress.IPv6None))
        {
            return true;
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            return bytes[0] == 10
                || bytes[0] == 127
                || (bytes[0] == 169 && bytes[1] == 254)
                || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31)
                || (bytes[0] == 192 && bytes[1] == 168)
                || bytes[0] == 0
                || bytes[0] >= 224;
        }

        return address.IsIPv6LinkLocal
            || address.IsIPv6Multicast
            || bytes[0] == 0xfc
            || bytes[0] == 0xfd;
    }
}

