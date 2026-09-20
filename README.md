# TorrentClaw_Fin

TorrentClaw_Fin is a Jellyfin 12 plugin that adds a deliberate, review-first workflow for finding releases through the TorrentClaw API and sending a selected release to qBittorrent.

It is designed for administrators who want the search, selection, download monitoring, and library-refresh flow to happen from Jellyfin without changing Jellyfin's native search experience. Downloads are never started automatically: an administrator must choose a release and press Download.

> The public project name is TorrentClaw_Fin. The current assembly, package, and Jellyfin dashboard pages retain the technical name TorrentClaw for compatibility with existing installations.

## Features

- Dedicated Jellyfin dashboard pages for Search, Downloads, and Settings.
- Server-side TorrentClaw search with resolution, codec, HDR, language, size, seeder, and REMUX preferences.
- Deterministic local eligibility and ranking, so incompatible releases cannot be sent from the results page.
- Manual hand-off of the chosen magnet to qBittorrent through its Web API.
- Per-download progress, speed, ETA, pause, resume, and removal controls.
- Background qBittorrent monitoring and a Jellyfin library refresh request after a completed download.
- Server-side poster proxy and bounded cache.
- Secret-preserving configuration API: read operations expose configuration status, not API keys or passwords.
- English and Italian interface, selectable from the flag picker in every page header (see Interface language).

## Important notice

Use TorrentClaw_Fin only for content you are authorized to download, store, and distribute. You are responsible for complying with applicable law, the terms of the services you use, and the rules of your network.

This repository must never contain API keys, qBittorrent credentials, magnets, torrent files, or downloaded media.

## Requirements

- Jellyfin Server 12.0.0 or compatible ABI 12.0.0 host.
- qBittorrent with Web UI enabled and reachable from the Jellyfin server.
- A TorrentClaw API key.
- Media paths that are writable by qBittorrent and readable by the Jellyfin server process.

For development and packaging:

- .NET SDK 10.0.401 or a compatible .NET 10 SDK.
- Node.js 20 or later is optional and is used by the browser-script tests when available.

## Install from GitHub Releases

The recommended installation path is the prebuilt release asset. No local build is required.

1. Download [TorrentClaw_Fin_0.1.1.zip](https://github.com/SimoneCampisi0/TorrentClaw_Fin/releases/latest/download/TorrentClaw_Fin_0.1.1.zip) from the [latest GitHub Release](https://github.com/SimoneCampisi0/TorrentClaw_Fin/releases/latest).
2. Stop Jellyfin before replacing a plugin DLL.
3. Create a versioned plugin folder, for example:

       C:\ProgramData\Jellyfin\Server\plugins\TorrentClaw_Fin_0.1.1

4. Extract the ZIP into that folder.
5. Start Jellyfin, sign in as an administrator, and configure the plugin through Server Dashboard.

The GitHub Release also includes a SHA-256 checksum file. Verify it before installing when your deployment process requires artifact integrity checks.

## Build from source (optional)

From the repository root:

    dotnet restore TorrentClaw.Jellyfin.slnx
    dotnet test TorrentClaw.Jellyfin.slnx -c Release
    powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1

The packaging script checks the version against build.yaml and creates TorrentClaw_Fin_0.1.1.zip plus its SHA-256 checksum in artifacts.

## Manual installation details

1. Obtain TorrentClaw_Fin_0.1.1.zip from GitHub Releases or build it locally.
2. Stop Jellyfin before replacing a plugin DLL.
3. Create a versioned plugin folder in Jellyfin's plugins directory, for example:

       C:\ProgramData\Jellyfin\Server\plugins\TorrentClaw_Fin_0.1.1

4. Extract the release ZIP into that folder.
5. Start Jellyfin and sign in with an administrator account.
6. Open Server Dashboard, then use TorrentClaw - Settings under Plugins.

On non-Windows systems, use the Jellyfin data directory configured for your server and the equivalent plugins folder. The user running Jellyfin must be able to read the plugin files and access the configured media locations.

## Configure TorrentClaw_Fin

### 1. Configure TorrentClaw

Open TorrentClaw - Settings and provide:

- TorrentClaw base URL. The default is https://torrentclaw.com and production endpoints should use HTTPS.
- Your TorrentClaw API key.
- Request timeout and retry settings.

Use Test TorrentClaw connection to validate the API key and endpoint before saving a production setup.

### 2. Configure qBittorrent

In the same settings page, provide:

- qBittorrent Web UI base URL, for example http://127.0.0.1:8080.
- qBittorrent Web UI username and password.
- A category for plugin-managed torrents.
- Movie and TV save paths. These paths must be reachable by both qBittorrent and Jellyfin.
- The qBittorrent download directory and request timeout.

Use Test qBittorrent connection to verify Web UI authentication and connectivity.

If qBittorrent and Jellyfin run on different machines or in separate containers, configure paths as they are visible to each service. A path that exists only on the qBittorrent host cannot be scanned by Jellyfin.

### 3. Choose sensible defaults

The Settings page also controls default search preferences:

- Preferred resolution, video codec, HDR mode, audio language, and subtitle language.
- Maximum release size and minimum seeder count.
- REMUX preference.
- qBittorrent polling interval.

These preferences populate the Search page. Administrators can adjust the filters before each search.

## Use the plugin

1. Open TorrentClaw - Search from the Jellyfin server dashboard.
2. Enter a title, choose Film or TV, adjust filters, and search.
3. Review the result cards. Only releases marked eligible can be sent to qBittorrent.
4. Click Download on the single release you intend to add.
5. Open TorrentClaw - Downloads to monitor progress, speed, ETA, and state.
6. Pause or resume an active download if needed.
7. When it completes, confirm that Jellyfin has refreshed the target library.

Removing an entry from TorrentClaw - Downloads removes the associated torrent from qBittorrent but intentionally leaves downloaded files on disk. Delete or archive media through your normal library-management process.

## Interface language

The Search, Downloads, and Settings pages are shown in English by default. Use the flag picker at the top right of any page to switch to Italian (or back to English): the whole page, including its navigation, dates, numbers, and sizes, changes immediately without losing your inputs, search results, or download state.

The choice is a per-browser-session preference kept in the browser's session storage, so it survives refreshes and applies to all three pages until the browser session ends. It is not a server setting, does not change the Jellyfin language, and is not stored in the plugin configuration. Audio and subtitle preferences keep their codes; only their labels change with the interface language. The side-menu entries in the Jellyfin dashboard (TorrentClaw · Search, Downloads, Settings) are provided by the server and are always in English: the language chosen in the picker applies to the plugin pages, not to the menu.

## Security and privacy

- All plugin API endpoints require elevated Jellyfin access.
- API keys and qBittorrent passwords are not returned from the configuration endpoint and are cleared from the browser UI after use.
- Leaving a secret field empty while saving preserves its existing value.
- Do not put secrets in source files, issues, screenshots, logs, or pull requests.
- Jellyfin persists plugin configuration in its data directory. On current versions, API keys and qBittorrent passwords are stored there in plaintext; protect the Jellyfin data directory with appropriate filesystem permissions.
- API_KEY.txt is a development-only fallback. It is not a deployment mechanism and must not be copied into the installed plugin directory or committed to Git.

## Project layout

    src/Jellyfin.Plugin.TorrentClaw/  Plugin implementation
    tests/Jellyfin.Plugin.TorrentClaw.Tests/  Unit and integration-style tests
    tests/web/  Browser page tests
    scripts/package.ps1  Release packaging script
    artifacts/  Locally generated release output

## Compatibility and scope

TorrentClaw_Fin targets .NET 10 and Jellyfin 12. It uses dedicated administrative pages because Jellyfin's native external-search interfaces are intended to return existing Jellyfin items, not arbitrary external releases with magnet metadata.

The plugin does not use an LLM, MCP, or a runtime cloud service. It communicates only with the configured TorrentClaw endpoint, qBittorrent Web UI, and Jellyfin server APIs.

## Contributing

Issues and pull requests are welcome. Before opening a pull request:

1. Keep secrets and personal configuration out of the diff.
2. Run the test suite.
3. Update documentation when behavior, configuration, or compatibility changes.
4. Keep public-facing text in English.

## License

TorrentClaw_Fin is released under the MIT License. See LICENSE for the full text.
