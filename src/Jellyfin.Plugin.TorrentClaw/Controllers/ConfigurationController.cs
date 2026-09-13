using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TorrentClaw.Controllers;

/// <summary>Reads and updates the plugin settings and verifies the external connections.</summary>
[ApiController]
[Authorize(Policy = Policies.RequiresElevation)]
[Route("TorrentClaw")]
[Produces("application/json")]
[TorrentClawExceptionFilter]
public sealed class ConfigurationController : ControllerBase
{
    private readonly IPluginConfigurationStore _configurationStore;
    private readonly ITorrentClawClient _torrentClawClient;
    private readonly IQbittorrentClient _qbittorrentClient;

    public ConfigurationController(
        IPluginConfigurationStore configurationStore,
        ITorrentClawClient torrentClawClient,
        IQbittorrentClient qbittorrentClient)
    {
        _configurationStore = configurationStore;
        _torrentClawClient = torrentClawClient;
        _qbittorrentClient = qbittorrentClient;
    }

    [HttpGet("Configuration")]
    [ProducesResponseType<ConfigurationView>(StatusCodes.Status200OK)]
    public ActionResult<ConfigurationView> GetConfiguration() =>
        ConfigurationMapper.ToView(_configurationStore.Load());

    [HttpPost("Configuration")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult UpdateConfiguration([FromBody] ConfigurationUpdate request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var updated = ConfigurationMapper.ApplyUpdate(_configurationStore.Load(), request);
        _configurationStore.Save(updated);
        return NoContent();
    }

    [HttpPost("Connections/TorrentClaw/Test")]
    [ProducesResponseType<ConnectionTestResult>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ConnectionTestResult>> TestTorrentClaw(CancellationToken cancellationToken) =>
        await _torrentClawClient.TestConnectionAsync(cancellationToken).ConfigureAwait(false);

    [HttpPost("Connections/Qbittorrent/Test")]
    [ProducesResponseType<ConnectionTestResult>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ConnectionTestResult>> TestQbittorrent(CancellationToken cancellationToken) =>
        await _qbittorrentClient.TestConnectionAsync(cancellationToken).ConfigureAwait(false);
}
