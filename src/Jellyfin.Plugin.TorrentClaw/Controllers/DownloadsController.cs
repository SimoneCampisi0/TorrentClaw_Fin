using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Services;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TorrentClaw.Controllers;

/// <summary>Starts and controls the downloads selected by an administrator.</summary>
[ApiController]
[Authorize(Policy = Policies.RequiresElevation)]
[Route("TorrentClaw/Downloads")]
[Produces("application/json")]
[TorrentClawExceptionFilter]
public sealed class DownloadsController : ControllerBase
{
    private readonly IDownloadService _downloadService;

    public DownloadsController(IDownloadService downloadService)
    {
        _downloadService = downloadService;
    }

    [HttpPost]
    [ProducesResponseType<DownloadItem>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    public async Task<ActionResult<DownloadItem>> StartDownload(
        [FromBody] StartDownloadRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var item = await _downloadService.StartAsync(request.ReleaseId, cancellationToken).ConfigureAwait(false);
        return Ok(item);
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<DownloadItem>>(StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<DownloadItem>> GetDownloads() =>
        Ok(_downloadService.GetDownloads());

    [HttpPost("{id:guid}/Pause")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    public async Task<ActionResult> Pause(Guid id, CancellationToken cancellationToken)
    {
        await _downloadService.PauseAsync(id, cancellationToken).ConfigureAwait(false);
        return NoContent();
    }

    [HttpPost("{id:guid}/Resume")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    public async Task<ActionResult> Resume(Guid id, CancellationToken cancellationToken)
    {
        await _downloadService.ResumeAsync(id, cancellationToken).ConfigureAwait(false);
        return NoContent();
    }

    /// <summary>Removes the torrent from qBittorrent. Downloaded files are always kept.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    public async Task<ActionResult> Delete(
        Guid id,
        [FromQuery] bool deleteFiles,
        CancellationToken cancellationToken)
    {
        await _downloadService.DeleteAsync(id, deleteFiles, cancellationToken).ConfigureAwait(false);
        return NoContent();
    }
}
