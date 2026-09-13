using System.Net;
using System.Net.Sockets;

namespace Jellyfin.Plugin.TorrentClaw.Security;

/// <summary>
/// <see cref="SocketsHttpHandler.ConnectCallback"/> that refuses private or special-purpose destinations.
/// Validation happens on the addresses actually used for the socket, so a DNS answer cannot change
/// between validation and connection (DNS rebinding).
/// </summary>
public static class PublicNetworkConnector
{
    public static async ValueTask<Stream> ConnectAsync(
        SocketsHttpConnectionContext context,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        var endpoint = context.DnsEndPoint;
        IPAddress[] addresses = IPAddress.TryParse(endpoint.Host, out var literal)
            ? [literal]
            : await Dns.GetHostAddressesAsync(endpoint.Host, cancellationToken).ConfigureAwait(false);
        if (addresses.Length == 0 || addresses.Any(UrlSecurityValidator.IsPrivateOrSpecial))
        {
            throw new HttpRequestException("The destination resolved to a private or special-purpose address.");
        }

        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            await socket.ConnectAsync(addresses, endpoint.Port, cancellationToken).ConfigureAwait(false);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }
}
