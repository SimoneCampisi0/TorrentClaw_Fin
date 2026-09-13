using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TorrentClaw.Services;

public interface IJellyfinLibraryService
{
    Task RefreshAsync(string completedPath, CancellationToken cancellationToken);
}

public sealed class JellyfinLibraryService : IJellyfinLibraryService
{
    private static readonly Action<ILogger, Exception?> LogRefresh = LoggerMessage.Define(
        LogLevel.Information,
        new EventId(3001, "LibraryRefresh"),
        "Requesting Jellyfin library refresh after a completed download.");
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<JellyfinLibraryService> _logger;

    public JellyfinLibraryService(
        ILibraryManager libraryManager,
        ILogger<JellyfinLibraryService> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
    }

    public async Task RefreshAsync(string completedPath, CancellationToken cancellationToken)
    {
        if (!Directory.Exists(completedPath) && !File.Exists(completedPath))
        {
            throw new DirectoryNotFoundException("Completed download path does not exist.");
        }

        LogRefresh(_logger, null);
        await _libraryManager.ValidateMediaLibrary(new Progress<double>(), cancellationToken)
            .ConfigureAwait(false);
    }
}
