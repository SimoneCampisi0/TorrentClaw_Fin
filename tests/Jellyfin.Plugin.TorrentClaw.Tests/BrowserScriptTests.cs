using System.Diagnostics;
using Xunit.Abstractions;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

/// <summary>
/// Runs the Node.js unit tests in tests/web (language normalisation, Downloads polling lifecycle, Settings validation).
/// When Node.js is not installed the test is reported as passed with a note, unless
/// TORRENTCLAW_REQUIRE_NODE_TESTS=1 makes Node.js mandatory (recommended for CI).
/// </summary>
public sealed class BrowserScriptTests(ITestOutputHelper output)
{
    private static readonly TimeSpan NodeTimeout = TimeSpan.FromMinutes(2);

    [Fact]
    public async Task NodeUnitTestsForBrowserScriptsPass()
    {
        var node = FindExecutable(OperatingSystem.IsWindows() ? "node.exe" : "node");
        if (node is null)
        {
            Assert.NotEqual("1", Environment.GetEnvironmentVariable("TORRENTCLAW_REQUIRE_NODE_TESTS"));
            output.WriteLine("Node.js was not found on PATH: browser script tests were not executed.");
            return;
        }

        var testFiles = Directory.GetFiles(Path.Combine(RepositoryPaths.Root, "tests", "web"), "*.test.mjs");
        Assert.NotEmpty(testFiles);

        var startInfo = new ProcessStartInfo(node)
        {
            WorkingDirectory = RepositoryPaths.Root,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        startInfo.ArgumentList.Add("--test");
        foreach (var testFile in testFiles)
        {
            startInfo.ArgumentList.Add(testFile);
        }

        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Node.js could not be started.");
        using var timeout = new CancellationTokenSource(NodeTimeout);
        var standardOutput = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var standardError = process.StandardError.ReadToEndAsync(timeout.Token);
        await process.WaitForExitAsync(timeout.Token);

        output.WriteLine(await standardOutput);
        output.WriteLine(await standardError);
        Assert.Equal(0, process.ExitCode);
    }

    private static string? FindExecutable(string fileName) =>
        (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(directory => Path.Combine(directory, fileName))
            .FirstOrDefault(File.Exists);
}
