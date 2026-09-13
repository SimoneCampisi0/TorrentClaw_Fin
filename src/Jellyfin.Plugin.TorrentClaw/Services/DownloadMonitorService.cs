using Jellyfin.Plugin.TorrentClaw.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TorrentClaw.Services;

public sealed class DownloadMonitorService : BackgroundService
{
    private static readonly Action<ILogger, Exception?> LogIterationFailure = LoggerMessage.Define(
        LogLevel.Warning,
        new EventId(4001, "MonitorIterationFailed"),
        "TorrentClaw download monitor iteration failed.");
    private readonly IDownloadService _downloads;
    private readonly ILogger<DownloadMonitorService> _logger;

    public DownloadMonitorService(
        IDownloadService downloads,
        ILogger<DownloadMonitorService> logger)
    {
        _downloads = downloads;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var configuredSeconds = Plugin.Instance?.Configuration.DownloadPollSeconds ?? 15;
            var delay = TimeSpan.FromSeconds(Math.Clamp(configuredSeconds, 10, 300));
            try
            {
                await Task.Delay(delay, stoppingToken).ConfigureAwait(false);
                await _downloads.MonitorOnceAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                LogIterationFailure(_logger, ex);
            }
        }
    }
}
