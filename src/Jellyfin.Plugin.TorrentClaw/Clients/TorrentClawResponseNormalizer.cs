using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Clients;

/// <summary>
/// TorrentClaw sends explicit JSON nulls for missing data (for example <c>"audioTracks": null</c>).
/// System.Text.Json assigns those nulls over the empty defaults of the DTOs, while ranking and search code
/// rely on non-null collections and titles, so the payload is normalised once at the protocol boundary.
/// </summary>
internal static class TorrentClawResponseNormalizer
{
    public static TorrentClawSearchResponse Normalize(TorrentClawSearchResponse response) => response with
    {
        Results = (response.Results ?? [])
            .Where(content => content is not null)
            .Select(NormalizeContent)
            .ToList()
    };

    private static TorrentClawContentResult NormalizeContent(TorrentClawContentResult content) => content with
    {
        Title = content.Title ?? string.Empty,
        ContentType = content.ContentType ?? string.Empty,
        Torrents = (content.Torrents ?? [])
            .Where(torrent => torrent is not null)
            .Select(NormalizeTorrent)
            .ToList()
    };

    private static TorrentClawTorrent NormalizeTorrent(TorrentClawTorrent torrent) => torrent with
    {
        InfoHash = torrent.InfoHash ?? string.Empty,
        RawTitle = torrent.RawTitle ?? string.Empty,
        Source = torrent.Source ?? string.Empty,
        Languages = torrent.Languages ?? [],
        SubtitleLanguages = torrent.SubtitleLanguages ?? [],
        AudioTracks = (torrent.AudioTracks ?? []).Where(track => track is not null).ToList(),
        SubtitleTracks = (torrent.SubtitleTracks ?? []).Where(track => track is not null).ToList()
    };
}
