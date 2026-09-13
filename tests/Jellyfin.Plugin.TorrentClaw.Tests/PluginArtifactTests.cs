using System.Reflection;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class PluginArtifactTests
{
    private const string ExpectedVersion = "0.1.0";
    private const string ExpectedAssemblyVersion = "0.1.0.0";
    private static readonly string[] PageNames = [Plugin.SearchPageName, Plugin.DownloadsPageName, Plugin.SettingsPageName];
    private static readonly string[] ScriptSections =
    [
        "Constants",
        "DOM helpers",
        "API functions",
        "Rendering functions",
        "Event handlers",
        "Page lifecycle"
    ];

    private static readonly string[] WebResourceNames =
    [
        "Jellyfin.Plugin.TorrentClaw.Web.Search.search.html",
        "Jellyfin.Plugin.TorrentClaw.Web.Search.search.css",
        "Jellyfin.Plugin.TorrentClaw.Web.Search.search.js",
        "Jellyfin.Plugin.TorrentClaw.Web.Downloads.downloads.html",
        "Jellyfin.Plugin.TorrentClaw.Web.Downloads.downloads.css",
        "Jellyfin.Plugin.TorrentClaw.Web.Downloads.downloads.js",
        "Jellyfin.Plugin.TorrentClaw.Web.Settings.settings.html",
        "Jellyfin.Plugin.TorrentClaw.Web.Settings.settings.css",
        "Jellyfin.Plugin.TorrentClaw.Web.Settings.settings.js"
    ];

    public static TheoryData<string> WebResources => ResourcesEndingWith(string.Empty);

    public static TheoryData<string> HtmlResources => ResourcesEndingWith(".html");

    public static TheoryData<string> ScriptResources => ResourcesEndingWith(".js");

    [Theory]
    [MemberData(nameof(WebResources))]
    public void WebResourceIsEmbeddedInPluginAssembly(string resourceName)
    {
        Assert.Contains(resourceName, typeof(Plugin).Assembly.GetManifestResourceNames());
    }

    [Fact]
    public void OnlyTheNineWebResourcesAreEmbedded()
    {
        var embedded = typeof(Plugin).Assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith("Jellyfin.Plugin.TorrentClaw.Web.", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal);

        Assert.Equal(WebResourceNames.Order(StringComparer.Ordinal), embedded);
        Assert.DoesNotContain("Jellyfin.Plugin.TorrentClaw.Web.configPage.html", typeof(Plugin).Assembly.GetManifestResourceNames());
    }

    [Fact]
    public void RegisteredPagesPointToEmbeddedResources()
    {
        var pages = Plugin.CreatePages();
        var resources = typeof(Plugin).Assembly.GetManifestResourceNames();

        Assert.Equal(9, pages.Count);
        Assert.Equal(pages.Count, pages.Select(page => page.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(pages, page => Assert.Contains(page.EmbeddedResourcePath, resources));
        Assert.Equal(PageNames, pages.Where(page => page.EnableInMainMenu).Select(page => page.Name));
        Assert.All(PageNames, name =>
        {
            Assert.Contains(pages, page => page.Name == name + ".js" && !page.EnableInMainMenu);
            Assert.Contains(pages, page => page.Name == name + ".css" && !page.EnableInMainMenu);
        });
    }

    [Fact]
    public void HtmlPagesLoadTheirOwnScriptAndStylesheet()
    {
        foreach (var pageName in PageNames)
        {
            var page = Plugin.CreatePages().Single(candidate => candidate.Name == pageName);
            var html = ReadResource(page.EmbeddedResourcePath);

            Assert.Contains($"data-controller=\"__plugin/{pageName}.js\"", html, StringComparison.Ordinal);
            Assert.Contains($"href=\"configurationpage?name={pageName}.css\"", html, StringComparison.Ordinal);
        }
    }

    [Theory]
    [MemberData(nameof(HtmlResources))]
    public void HtmlContainsNoInlineCssOrJavaScript(string resourceName)
    {
        var html = ReadResource(resourceName);

        Assert.DoesNotContain("<style", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript:", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotMatch(new Regex(@"\sstyle\s*=", RegexOptions.IgnoreCase), html);
        Assert.DoesNotMatch(new Regex(@"\son[a-z]+\s*=", RegexOptions.IgnoreCase), html);
    }

    [Theory]
    [MemberData(nameof(ScriptResources))]
    public void ScriptsBuildDomSafelyAndNeverHandleSecretsOrMagnets(string resourceName)
    {
        var script = ReadResource(resourceName);

        Assert.DoesNotContain("innerHTML", script, StringComparison.Ordinal);
        Assert.DoesNotContain("outerHTML", script, StringComparison.Ordinal);
        Assert.DoesNotContain("insertAdjacentHTML", script, StringComparison.Ordinal);
        Assert.DoesNotContain("document.write", script, StringComparison.Ordinal);
        Assert.DoesNotContain("eval(", script, StringComparison.Ordinal);
        Assert.DoesNotContain("console.", script, StringComparison.Ordinal);
        Assert.DoesNotContain("localStorage", script, StringComparison.Ordinal);
        Assert.DoesNotContain("magnet:", script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("MagnetUrl", script, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("InfoHash", script, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [MemberData(nameof(ScriptResources))]
    public void ScriptsAreReadableAndOrganisedBySection(string resourceName)
    {
        var lines = ReadResource(resourceName).Split('\n');

        Assert.True(lines.Length > 150, "Script looks minified or incomplete.");
        Assert.All(lines, line => Assert.True(line.TrimEnd('\r').Length <= 160, $"Line too long: {line}"));
        Assert.All(ScriptSections, section => Assert.Contains(lines, line => line.Trim() == "* " + section));
        Assert.Contains(lines, line => line.StartsWith("export default function ", StringComparison.Ordinal));
    }

    [Fact]
    public void BrowserReleaseDtoCannotExposeMagnetHashApiKeyOrPosterUrl()
    {
        var result = new ReleaseResult
        {
            ReleaseId = ReleaseIdentifier.Create("0123456789abcdef0123456789abcdef01234567", "Release"),
            Title = "Title",
            Year = 2004,
            ReleaseName = "Release",
            ContentType = ContentKind.Movie,
            HasPoster = true,
            AudioTracks = [new TorrentClawAudioTrack { Lang = "ita", Codec = "AC3", Channels = 6 }],
            SubtitleTracks = [new TorrentClawSubtitleTrack { Lang = "eng", Codec = "subrip" }]
        };

        var json = JsonSerializer.Serialize(result);

        Assert.DoesNotContain("magnet", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("apiKey", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("0123456789abcdef", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("http", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"HasPoster\":true", json, StringComparison.Ordinal);
    }

    [Fact]
    public void BrowserDownloadDtoDoesNotExposeInfoHash()
    {
        const string hash = "0123456789abcdef0123456789abcdef01234567";
        var item = new DownloadItem
        {
            Id = Guid.NewGuid(),
            Hash = hash,
            ReleaseName = "Release",
            ContentType = ContentKind.Movie,
            CreatedAt = DateTimeOffset.UtcNow,
            Status = new TorrentStatus(hash, "Release", 0.5, 10, 5, 10, 60, DownloadState.Downloading, "C:\\Movies", null)
        };

        var json = JsonSerializer.Serialize(item);

        Assert.DoesNotContain(hash, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"Hash\"", json, StringComparison.Ordinal);
    }

    [Fact]
    public void AssemblyTargetsNet10AndJellyfin12Abi()
    {
        var assembly = typeof(ReleaseResult).Assembly;
        var target = assembly.GetCustomAttribute<TargetFrameworkAttribute>()?.FrameworkName;
        var references = assembly.GetReferencedAssemblies();

        Assert.Equal(".NETCoreApp,Version=v10.0", target);
        Assert.Contains(references, reference =>
            reference.Name == "MediaBrowser.Common" && reference.Version == new Version(12, 0, 0, 0));
        Assert.Contains(references, reference =>
            reference.Name == "MediaBrowser.Controller" && reference.Version == new Version(12, 0, 0, 0));
    }

    [Fact]
    public void VersionIsConsistentAcrossAssemblyManifestPackagingAndUserAgent()
    {
        var root = RepositoryPaths.Root;

        Assert.Equal(new Version(ExpectedAssemblyVersion), typeof(Plugin).Assembly.GetName().Version);
        Assert.EndsWith("/" + ExpectedVersion, PluginServiceRegistrator.UserAgent, StringComparison.Ordinal);
        Assert.Contains($"version: \"{ExpectedVersion}\"", File.ReadAllText(Path.Combine(root, "build.yaml")), StringComparison.Ordinal);
        Assert.Contains(ExpectedVersion, File.ReadAllText(Path.Combine(root, "README.md")), StringComparison.Ordinal);
        Assert.DoesNotContain("12.0.0.3\"", File.ReadAllText(Path.Combine(root, "scripts", "package.ps1")), StringComparison.Ordinal);
    }

    private static TheoryData<string> ResourcesEndingWith(string extension)
    {
        var data = new TheoryData<string>();
        foreach (var name in WebResourceNames.Where(name => name.EndsWith(extension, StringComparison.Ordinal)))
        {
            data.Add(name);
        }

        return data;
    }

    private static string ReadResource(string resourceName)
    {
        using var stream = typeof(Plugin).Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Missing resource {resourceName}.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
