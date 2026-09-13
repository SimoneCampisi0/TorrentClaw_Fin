namespace Jellyfin.Plugin.TorrentClaw.Tests;

internal static class RepositoryPaths
{
    private const string SolutionFileName = "TorrentClaw.Jellyfin.slnx";

    public static string Root { get; } = FindRoot();

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, SolutionFileName)))
        {
            directory = directory.Parent;
        }

        return directory?.FullName
            ?? throw new InvalidOperationException($"Repository root containing {SolutionFileName} was not found.");
    }
}
