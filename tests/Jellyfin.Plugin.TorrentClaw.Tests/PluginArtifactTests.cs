using System.Reflection;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class PluginArtifactTests
{
    private const string ExpectedVersion = "0.1.1";
    private const string ExpectedAssemblyVersion = "0.1.1.0";
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
        "Jellyfin.Plugin.TorrentClaw.Web.Settings.settings.js",
        "Jellyfin.Plugin.TorrentClaw.Web.Shared.torrentclaw-i18n.js",
        "Jellyfin.Plugin.TorrentClaw.Web.Shared.torrentclaw-shared.css"
    ];

    private const string SharedScriptResource = "Jellyfin.Plugin.TorrentClaw.Web.Shared.torrentclaw-i18n.js";

    public static TheoryData<string> WebResources => ResourcesEndingWith(string.Empty);

    public static TheoryData<string> HtmlResources => ResourcesEndingWith(".html");

    /// <summary>Every script, including the shared i18n module: they all follow the same safety rules.</summary>
    public static TheoryData<string> ScriptResources => ResourcesEndingWith(".js");

    /// <summary>The page controllers, which also follow the section layout and export a controller.</summary>
    public static TheoryData<string> ControllerScriptResources => ResourcesEndingWith(".js", except: SharedScriptResource);

    [Theory]
    [MemberData(nameof(WebResources))]
    public void WebResourceIsEmbeddedInPluginAssembly(string resourceName)
    {
        Assert.Contains(resourceName, typeof(Plugin).Assembly.GetManifestResourceNames());
    }

    [Fact]
    public void OnlyTheElevenWebResourcesAreEmbedded()
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

        // Three menu pages, a script and a stylesheet for each of them, plus the shared i18n script and stylesheet.
        Assert.Equal(11, pages.Count);
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
    public void MenuPagesHaveFixedEnglishLabelsAndStableIdentity()
    {
        var menuPages = Plugin.CreatePages().Where(page => page.EnableInMainMenu).ToList();

        // Jellyfin Web cannot localise DisplayName, so the side menu is English whatever the UI language picker says.
        // Names (URLs), icons, section and order stay as they were.
        Assert.Equal(
            [
                ("TorrentClawSearch", "TorrentClaw · Search", "search"),
                ("TorrentClawDownloads", "TorrentClaw · Downloads", "download"),
                ("TorrentClawSettings", "TorrentClaw · Settings", "settings")
            ],
            menuPages.Select(page => (page.Name, page.DisplayName, page.MenuIcon)));
        Assert.All(menuPages, page => Assert.Equal("server", page.MenuSection));
        Assert.All(menuPages, page =>
            Assert.DoesNotMatch(new Regex(@"\b(Cerca|Ricerca|Impostazioni)\b", RegexOptions.IgnoreCase), page.DisplayName));
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
            Assert.Contains($"href=\"configurationpage?name={Plugin.SharedStylesAssetName}\"", html, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void SharedI18nAssetsAreRegisteredAsPluginAssets()
    {
        var pages = Plugin.CreatePages();

        foreach (var (assetName, resource) in new[]
        {
            (Plugin.SharedI18nAssetName, SharedScriptResource),
            (Plugin.SharedStylesAssetName, "Jellyfin.Plugin.TorrentClaw.Web.Shared.torrentclaw-shared.css")
        })
        {
            var page = Assert.Single(pages, candidate => candidate.Name == assetName);
            Assert.False(page.EnableInMainMenu);
            Assert.Equal(resource, page.EmbeddedResourcePath);
        }

        // Page controllers load the shared module through the asset name registered above.
        var controllers = WebResourceNames.Where(name => name.EndsWith(".js", StringComparison.Ordinal) && name != SharedScriptResource);
        foreach (var controller in controllers)
        {
            Assert.Contains($"name={Plugin.SharedI18nAssetName}", ReadResource(controller), StringComparison.Ordinal);
        }
    }

    [Fact]
    public void SharedI18nModuleIsReadableAndKeepsTheLanguageContract()
    {
        var script = ReadResource(SharedScriptResource);

        Assert.All(script.Split('\n'), line => Assert.True(line.TrimEnd('\r').Length <= 160, $"Line too long: {line}"));
        Assert.Contains("export const SUPPORTED_LANGUAGES", script, StringComparison.Ordinal);
        Assert.Contains("locale: 'en-GB'", script, StringComparison.Ordinal);
        Assert.Contains("locale: 'it-IT'", script, StringComparison.Ordinal);
        Assert.Contains("'torrentclaw.ui-language'", script, StringComparison.Ordinal);
        Assert.Contains("sessionStorage", script, StringComparison.Ordinal);
        Assert.Contains("export function createI18n", script, StringComparison.Ordinal);
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
    [MemberData(nameof(ControllerScriptResources))]
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

    private static TheoryData<string> ResourcesEndingWith(string extension, string? except = null)
    {
        var data = new TheoryData<string>();
        foreach (var name in WebResourceNames.Where(name =>
                     name.EndsWith(extension, StringComparison.Ordinal) && name != except))
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
