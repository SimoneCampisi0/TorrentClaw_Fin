using System.Collections.Concurrent;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Services;

public interface ISearchService
{
    Task<IReadOnlyList<ReleaseResult>> SearchAsync(
        ReleaseSearchRequest request,
        CancellationToken cancellationToken);

    bool TryResolveRelease(string releaseId, out SelectedRelease? release);
}

public sealed record SelectedRelease(
    string MagnetUrl,
    string InfoHash,
    string ReleaseName,
    ContentKind ContentType);

public sealed class SearchService : ISearchService
{
    private readonly ITorrentClawClient _client;
    private readonly IReleaseRankingService _ranking;
    private readonly IPosterService _posters;
    private readonly ConcurrentDictionary<string, CachedRelease> _releaseCache = new(StringComparer.Ordinal);

    public SearchService(ITorrentClawClient client, IReleaseRankingService ranking, IPosterService posters)
    {
        _client = client;
        _ranking = ranking;
        _posters = posters;
    }

    public async Task<IReadOnlyList<ReleaseResult>> SearchAsync(
        ReleaseSearchRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _client.SearchAsync(request, cancellationToken).ConfigureAwait(false);
        var releases = new List<ReleaseResult>();
        foreach (var content in response.Results)
        {
            foreach (var torrent in content.Torrents)
            {
                var id = ReleaseIdentifier.Create(torrent.InfoHash, torrent.RawTitle);
                if (!string.IsNullOrWhiteSpace(torrent.MagnetUrl) && !string.IsNullOrWhiteSpace(torrent.InfoHash))
                {
                    _releaseCache[id] = new CachedRelease(
                        new SelectedRelease(
                            torrent.MagnetUrl,
                            torrent.InfoHash,
                            torrent.RawTitle,
                            request.Type),
                        DateTimeOffset.UtcNow.AddMinutes(20));
                }

                var ranked = _ranking.Rank(id, content.Title, request.Type, torrent, request);
                releases.Add(ranked with
                {
                    Year = content.Year,
                    HasPoster = _posters.RegisterPoster(id, content.PosterUrl)
                });
            }
        }

        RemoveExpiredCacheEntries();
        return Sort(releases, request.Sort);
    }

    public bool TryResolveRelease(string releaseId, out SelectedRelease? release)
    {
        release = null;
        if (!_releaseCache.TryGetValue(releaseId, out var cached) || cached.ExpiresAt < DateTimeOffset.UtcNow)
        {
            return false;
        }

        release = cached.Release;
        return true;
    }

    private static ReleaseResult[] Sort(List<ReleaseResult> releases, ReleaseSort sort) =>
        sort switch
        {
            ReleaseSort.Quality => releases.OrderByDescending(item => item.TorrentClawScore ?? 0)
                .ThenByDescending(item => item.Seeders).ToArray(),
            ReleaseSort.Seeders => releases.OrderByDescending(item => item.Seeders)
                .ThenByDescending(item => item.CompatibilityScore).ToArray(),
            ReleaseSort.Size => releases.OrderBy(item => item.SizeBytes ?? long.MaxValue)
                .ThenByDescending(item => item.CompatibilityScore).ToArray(),
            _ => releases.OrderByDescending(item => item.Eligible)
                .ThenByDescending(item => item.CompatibilityScore)
                .ThenByDescending(item => item.Seeders).ToArray()
        };

    private void RemoveExpiredCacheEntries()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in _releaseCache.Where(entry => entry.Value.ExpiresAt < now))
        {
            _releaseCache.TryRemove(entry.Key, out _);
        }
    }

    private sealed record CachedRelease(SelectedRelease Release, DateTimeOffset ExpiresAt);
}
