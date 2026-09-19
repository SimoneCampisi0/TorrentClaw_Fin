using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Services;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TorrentClaw.Controllers;

/// <summary>Searches TorrentClaw and serves the posters of the returned releases.</summary>
[ApiController]
[Authorize(Policy = Policies.RequiresElevation)]
[Route("TorrentClaw/Search")]
[Produces("application/json")]
[TorrentClawExceptionFilter]
public sealed class SearchController : ControllerBase
{
    private const string PosterCacheControl = "private, max-age=1800";
    private readonly ISearchService _searchService;
    private readonly IPosterService _posterService;

    public SearchController(ISearchService searchService, IPosterService posterService)
    {
        _searchService = searchService;
        _posterService = posterService;
    }

    [HttpPost]
    [ProducesResponseType<IReadOnlyList<ReleaseResult>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status504GatewayTimeout)]
    public async Task<ActionResult<IReadOnlyList<ReleaseResult>>> Search(
        [FromBody] ReleaseSearchRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var results = await _searchService.SearchAsync(request, cancellationToken).ConfigureAwait(false);
        return Ok(results);
    }

    /// <summary>
    /// Returns the poster registered for an opaque release id. The browser never supplies a URL,
    /// so this endpoint cannot be used as a generic proxy.
    /// </summary>
    [HttpGet("{releaseId}/Poster")]
    [Produces("image/jpeg", "image/png", "image/webp", "image/gif")]
    [ProducesResponseType<FileContentResult>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetPoster(string releaseId, CancellationToken cancellationToken)
    {
        if (!ReleaseIdentifier.IsValid(releaseId))
        {
            return NotFound();
        }

        var poster = await _posterService.GetPosterAsync(releaseId, cancellationToken).ConfigureAwait(false);
        if (poster is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = PosterCacheControl;
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(poster.Content, poster.ContentType);
    }

    /// <summary>
    /// Returns a magnet only after an administrator explicitly requests the clipboard action for a cached release.
    /// It is deliberately separate from the search payload so release listings never contain magnets.
    /// </summary>
    [HttpGet("{releaseId}/Magnet")]
    [ProducesResponseType<ReleaseMagnetResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<ReleaseMagnetResponse> GetMagnet(string releaseId)
    {
        if (!ReleaseIdentifier.IsValid(releaseId)
            || !_searchService.TryResolveRelease(releaseId, out var release)
            || release is null)
        {
            return NotFound();
        }

        return Ok(new ReleaseMagnetResponse(release.MagnetUrl));
    }
}
