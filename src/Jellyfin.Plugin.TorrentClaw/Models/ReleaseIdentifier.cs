using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;

namespace Jellyfin.Plugin.TorrentClaw.Models;

/// <summary>Opaque release identifiers handed to the browser instead of magnets or info hashes.</summary>
public static class ReleaseIdentifier
{
    public const string Pattern = "^[0-9a-f]{32}$";

    public static string Create(string infoHash, string title)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(infoHash + "\n" + title));
        return Convert.ToHexString(bytes.AsSpan(0, 16)).ToLowerInvariant();
    }

    public static bool IsValid([NotNullWhen(true)] string? value) =>
        value is { Length: 32 } && value.All(character => character is (>= '0' and <= '9') or (>= 'a' and <= 'f'));
}
