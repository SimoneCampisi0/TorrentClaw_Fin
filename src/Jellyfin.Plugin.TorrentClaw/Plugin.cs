using Jellyfin.Plugin.TorrentClaw.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.TorrentClaw;

public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public const string SearchPageName = "TorrentClawSearch";
    public const string DownloadsPageName = "TorrentClawDownloads";
    public const string SettingsPageName = "TorrentClawSettings";
    public const string SharedI18nAssetName = "TorrentClawI18n.js";
    public const string SharedStylesAssetName = "TorrentClawShared.css";
    private const string ResourcePrefix = "Jellyfin.Plugin.TorrentClaw.Web";

    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "TorrentClaw";

    public override string Description =>
        "Search TorrentClaw, manually select releases, and monitor qBittorrent downloads.";

    public override Guid Id => Guid.Parse("7619f4e6-29bc-41e1-9232-d4eb06f1962c");

    public IEnumerable<PluginPageInfo> GetPages() => CreatePages();

    /// <summary>
    /// Three menu pages plus their stylesheet and script, and the i18n module and stylesheet they share
    /// (the language picker and translations). Jellyfin serves every entry through
    /// <c>web/ConfigurationPage?name=...</c>; page names are prefixed because they are global across plugins.
    /// The Search page is listed first because the dashboard plugin card opens the first menu page.
    /// Menu labels are fixed English strings: Jellyfin Web draws the side menu from the server page list and
    /// cannot localise <see cref="PluginPageInfo.DisplayName"/>, while the UI language lives in the browser.
    /// </summary>
    public static IReadOnlyList<PluginPageInfo> CreatePages() =>
    [
        CreateMenuPage(SearchPageName, "TorrentClaw · Search", "search", "Search.search.html"),
        CreateMenuPage(DownloadsPageName, "TorrentClaw · Downloads", "download", "Downloads.downloads.html"),
        CreateMenuPage(SettingsPageName, "TorrentClaw · Settings", "settings", "Settings.settings.html"),
        CreateAssetPage(SearchPageName + ".js", "Search.search.js"),
        CreateAssetPage(SearchPageName + ".css", "Search.search.css"),
        CreateAssetPage(DownloadsPageName + ".js", "Downloads.downloads.js"),
        CreateAssetPage(DownloadsPageName + ".css", "Downloads.downloads.css"),
        CreateAssetPage(SettingsPageName + ".js", "Settings.settings.js"),
        CreateAssetPage(SettingsPageName + ".css", "Settings.settings.css"),
        CreateAssetPage(SharedI18nAssetName, "Shared.torrentclaw-i18n.js"),
        CreateAssetPage(SharedStylesAssetName, "Shared.torrentclaw-shared.css")
    ];

    private static PluginPageInfo CreateMenuPage(string name, string displayName, string icon, string resource) => new()
    {
        Name = name,
        DisplayName = displayName,
        EnableInMainMenu = true,
        MenuSection = "server",
        MenuIcon = icon,
        EmbeddedResourcePath = $"{ResourcePrefix}.{resource}"
    };

    private static PluginPageInfo CreateAssetPage(string name, string resource) => new()
    {
        Name = name,
        EmbeddedResourcePath = $"{ResourcePrefix}.{resource}"
    };
}
