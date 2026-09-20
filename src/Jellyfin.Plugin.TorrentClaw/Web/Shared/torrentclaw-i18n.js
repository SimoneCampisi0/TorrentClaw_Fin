/*
 * TorrentClaw · Shared UI internationalisation
 *
 * A small, dependency-free i18n layer used by the Search, Downloads and Settings pages. It does not rely on
 * Jellyfin Web internals: the pages import this module by URL, and every pure function can be tested in Node.
 *
 * The chosen language is a per-browser-session preference kept in sessionStorage. English is the fallback
 * whenever nothing (or something unknown) is stored, or when the storage is not available.
 */

/* =============================================================================
 * Constants
 * ========================================================================== */

export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'torrentclaw.ui-language';
export const LANGUAGE_CHANGE_EVENT = 'torrentclaw:languagechange';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const SUPPORTED_LANGUAGES = Object.freeze([
    Object.freeze({ code: 'en', locale: 'en-GB', flag: '🇬🇧' }),
    Object.freeze({ code: 'it', locale: 'it-IT', flag: '🇮🇹' })
]);

/*
 * Keys are semantic and stable. Values may be plain strings, or objects with plural categories
 * ("one" / "other") selected through the "count" parameter. Placeholders use {name}.
 * Both languages must define every key: the unit tests enforce it.
 */
const ENGLISH = {
    'nav.label': 'TorrentClaw pages',
    'nav.search': 'Search',
    'nav.downloads': 'Downloads',
    'nav.settings': 'Settings',

    'language.picker.label': 'Interface language',
    'language.picker.current': 'Interface language: {language}',
    'language.en': 'English',
    'language.it': 'Italian',
    'language.es': 'Spanish',
    'language.fr': 'French',
    'language.de': 'German',
    'language.ja': 'Japanese',
    'language.pt': 'Portuguese',
    'language.ru': 'Russian',
    'language.itEn': 'Italian + English',
    'language.noSubtitles': 'No subtitles',
    'language.unknown': 'Unknown language',
    'language.unknownWithCode': 'Unknown language ({code})',

    'common.any': 'Any',
    'common.noPreference': 'No preference',
    'common.unknown': 'Unknown',
    'common.notSpecified': 'Not specified',
    'common.notSet': 'Not set',
    'common.text': '{text}',
    'common.reason': '{title}. {detail}',

    'error.network': 'Unable to reach the Jellyfin server. Check the connection and try again.',
    'error.unauthorized': 'Session expired or insufficient permissions: sign in again as an administrator.',
    'error.server': 'The server encountered an unexpected error. Try again later.',
    'error.generic': 'The request did not succeed. Try again.',

    'validation.required': 'This field is required.',
    'validation.url.full': 'Enter a full URL, for example https://example.com',
    'validation.url.httpsOnly': 'Only HTTPS is allowed.',
    'validation.url.httpOrHttps': 'Use an HTTP or HTTPS address.',
    'validation.url.credentials': 'Do not put credentials in the URL: use the dedicated fields.',
    'validation.integer': 'Enter a whole number.',
    'validation.number': 'Enter a number.',
    'validation.min': 'The minimum value is {min}.',
    'validation.range': 'Enter a value between {min} and {max}.',

    'settings.title': 'Settings',
    'settings.lead': 'Connections to TorrentClaw and qBittorrent, destination directories and default search filters.',
    'settings.notice.title': 'How credentials are stored',
    'settings.notice.text': 'The API key and password are saved in the plugin configuration file on the Jellyfin server, '
        + 'protected by filesystem permissions and not encrypted. They are never sent back to the browser: '
        + 'the page only shows whether they are set.',
    'settings.torrentclaw.text': 'Release search service. The API key travels only in the header of requests to TorrentClaw.',
    'settings.torrentclaw.url.label': 'Service URL',
    'settings.torrentclaw.url.hint': 'HTTPS only, without credentials in the address. Default: https://torrentclaw.com',
    'settings.apiKey.label': 'API key',
    'settings.apiKey.configured': 'Key saved',
    'settings.apiKey.missing': 'No key saved',
    'settings.apiKey.hint': 'Leave empty to keep the key already saved.',
    'settings.apiKey.placeholder.keep': 'Leave empty to keep the saved key',
    'settings.apiKey.placeholder.new': 'Paste the TorrentClaw API key',
    'settings.timeout.label': 'Timeout (seconds)',
    'settings.retries.label': 'Additional attempts',
    'settings.retries.hint': 'Only for rate limits (429) and server errors (5xx).',
    'settings.test.button': 'Test connection',
    'settings.test.hint': 'Testing saves the current settings first.',
    'settings.qbittorrent.text': 'Client that downloads the releases you choose manually from the search page.',
    'settings.qbittorrent.url.label': 'WebUI URL',
    'settings.qbittorrent.url.hint': 'HTTP or HTTPS, also on a local network. Example: http://127.0.0.1:8080',
    'settings.qbittorrent.username.label': 'Username',
    'settings.qbittorrent.password.label': 'Password',
    'settings.qbittorrent.password.configured': 'Password saved',
    'settings.qbittorrent.password.missing': 'No password saved',
    'settings.qbittorrent.password.hint': 'Leave empty to keep it.',
    'settings.qbittorrent.password.placeholder.keep': 'Leave empty to keep it',
    'settings.qbittorrent.password.placeholder.new': 'WebUI password',
    'settings.qbittorrent.category.label': 'Category',
    'settings.qbittorrent.category.hint': 'Assigned to the torrents added by the plugin.',
    'settings.paths.title': 'Paths',
    'settings.paths.text': 'Directories must exist and be accessible to both qBittorrent and Jellyfin.',
    'settings.paths.movies.label': 'Movies directory',
    'settings.paths.movies.hint': 'Destination of movies; when a download completes, a library refresh is requested.',
    'settings.paths.shows.label': 'TV series directory',
    'settings.paths.shows.hint': 'Destination of TV series.',
    'settings.paths.downloads.label': 'Downloads directory',
    'settings.paths.downloads.hint': 'Informational only: torrents are saved directly in the movies and TV series directories.',
    'settings.preferences.title': 'Preferences',
    'settings.preferences.text': 'Values suggested when the search page opens, and how often downloads are checked.',
    'settings.preferences.resolution': 'Resolution',
    'settings.preferences.codec': 'Codec',
    'settings.preferences.hdr': 'HDR',
    'settings.preferences.audioLanguage': 'Audio language',
    'settings.preferences.subtitleLanguage': 'Subtitles',
    'settings.preferences.maxSize.label': 'Maximum size (GB)',
    'settings.preferences.maxSize.hint': '0 or empty: no limit.',
    'settings.preferences.minSeeders': 'Minimum seeders',
    'settings.preferences.poll.label': 'Download check (seconds)',
    'settings.preferences.poll.hint': 'How often the server queries qBittorrent (10–300).',
    'settings.preferences.remux': 'Prefer REMUX releases',
    'settings.save.loading': 'Loading settings…',
    'settings.save.button': 'Save settings',
    'settings.status.loaded': 'Settings loaded.',
    'settings.status.loadFailed': 'Settings not loaded. {reason}',
    'settings.status.saved': 'Settings saved at {time}.',
    'settings.status.unsaved': 'Unsaved changes',
    'settings.status.fixFields': 'Fix the highlighted fields before saving.',
    'settings.status.testing': 'Saving and testing…',
    'settings.status.testSkipped': 'Test not run: settings not saved',
    'settings.error.validation': 'Some values are not valid. Check the fields and try again.',
    'settings.connection.Connected': 'Connection successful',
    'settings.connection.InvalidApiKey': 'Invalid API key',
    'settings.connection.Unauthorized': 'Credentials not authorised',
    'settings.connection.ServiceUnavailable': 'Service unreachable',
    'settings.connection.Timeout': 'Timed out',
    'settings.connection.ConfigurationError': 'Invalid configuration',
    'settings.connection.ConfigurationErrorWithMessage': 'Invalid configuration: {message}',
    'settings.connection.unrecognised': 'Test result not recognised',

    'downloads.title': 'Downloads',
    'downloads.lead': 'Status of the torrents sent to qBittorrent by this plugin. '
        + 'When a download completes, a Jellyfin library refresh is requested.',
    'downloads.notice.title': 'In-memory monitoring',
    'downloads.notice.text': 'The list only contains downloads started by this plugin since Jellyfin last started. '
        + 'After a restart the torrents stay in qBittorrent but no longer appear here. Removing never deletes downloaded files.',
    'downloads.summary.loading': 'Loading downloads…',
    'downloads.summary.none': 'No monitored downloads',
    'downloads.summary.total': {
        one: '{count} monitored download',
        other: '{count} monitored downloads'
    },
    'downloads.summary.withActive': '{total} · {active} in progress',
    'downloads.toolbar.autoRefresh': 'Automatic refresh every {seconds} seconds while the page is visible.',
    'downloads.toolbar.updated': 'Updated at {time} · automatic refresh every {seconds} seconds.',
    'downloads.toolbar.refresh': 'Refresh',
    'downloads.empty.title': 'No monitored downloads',
    'downloads.empty.text': 'Choose a release on the search page and press Download: it will appear here '
        + 'with progress, speed and estimated time.',
    'downloads.empty.link': 'Go to search',
    'downloads.state.Waiting': 'Waiting for status',
    'downloads.state.Unknown': 'Unknown status',
    'downloads.state.Queued': 'Queued',
    'downloads.state.Downloading': 'Downloading',
    'downloads.state.Paused': 'Paused',
    'downloads.state.Stalled': 'Stalled',
    'downloads.state.Checking': 'Checking',
    'downloads.state.Completed': 'Completed',
    'downloads.state.Error': 'Error',
    'downloads.state.MissingFiles': 'Missing files',
    'downloads.type.movie': 'Movie',
    'downloads.type.show': 'TV series',
    'downloads.type.other': 'Content',
    'downloads.card.meta': '{type} · added {date}',
    'downloads.card.progress': 'Progress',
    'downloads.card.progressText': '{percent} completed',
    'downloads.card.downloaded': 'Downloaded',
    'downloads.card.downloadedOf': '{done} of {total}',
    'downloads.card.speed': 'Speed',
    'downloads.card.eta': 'Estimated time',
    'downloads.card.etaUnknown': 'Cannot be estimated',
    'downloads.card.libraryRefresh': '✓ Jellyfin library refresh requested',
    'downloads.card.clientError': 'qBittorrent reports: {error}',
    'downloads.action.pause': 'Pause',
    'downloads.action.resume': 'Resume',
    'downloads.action.remove': 'Remove',
    'downloads.action.cancel': 'Cancel',
    'downloads.action.confirmRemoval': 'Confirm removal',
    'downloads.action.pauseLabel': 'Pause {name}',
    'downloads.action.resumeLabel': 'Resume {name}',
    'downloads.action.removeLabel': 'Remove {name} from qBittorrent',
    'downloads.action.removalQuestion': 'Remove the torrent from qBittorrent? The downloaded files stay on disk.',
    'downloads.action.pauseDone': 'Pause requested from qBittorrent. The status will update at the next server check.',
    'downloads.action.resumeDone': 'Resume requested from qBittorrent. The status will update at the next server check.',
    'downloads.action.removeDone': 'Torrent removed from qBittorrent. The downloaded files were kept.',
    'downloads.action.unsupported': 'Unsupported action.',
    'downloads.error.notFound': 'The download is no longer monitored. Refresh the list.',
    'downloads.error.listFailed': 'List not updated. {reason}',
    'downloads.duration.seconds': '{n} s',
    'downloads.duration.minutes': '{n} min',
    'downloads.duration.hours': '{h} h {m} min',
    'downloads.duration.days': '{d} d {h} h',

    'search.title': 'Search releases',
    'search.lead': 'Search TorrentClaw, compare quality, languages and availability, '
        + 'then manually send the chosen release to qBittorrent.',
    'search.content.legend': 'Content',
    'search.query.label': 'Title',
    'search.type.label': 'Type',
    'search.type.movie': 'Movie',
    'search.type.show': 'TV series',
    'search.button': 'Search',
    'search.button.busy': 'Searching…',
    'search.filters.title': 'Filters',
    'search.filters.count': {
        one: '{count} active',
        other: '{count} active'
    },
    'search.filters.video': 'Video',
    'search.filters.resolution': 'Resolution',
    'search.filters.codec': 'Codec',
    'search.filters.hdr': 'HDR',
    'search.filters.remux': 'Prefer REMUX',
    'search.filters.audioAndSubtitles': 'Audio and subtitles',
    'search.filters.audioLanguage': 'Audio language',
    'search.filters.subtitleLanguage': 'Subtitles',
    'search.filters.audioFormat': 'Audio format',
    'search.filters.audioFormatPlaceholder': 'Atmos, DTS, AAC…',
    'search.filters.audioHint': 'Audio and subtitles are separate filters: with several languages, all of them must be present.',
    'search.filters.availability': 'Availability',
    'search.filters.maxSize': 'Maximum size (GB)',
    'search.filters.minSeeders': 'Minimum seeders',
    'search.filters.sort': 'Sort by',
    'search.filters.sort.compatibility': 'Compatibility',
    'search.filters.sort.quality': 'Quality',
    'search.filters.sort.seeders': 'Seeders',
    'search.filters.sort.size': 'Size',
    'search.filters.verifiedOnly': 'Only TrueSpec-verified releases',
    'search.active.label': 'Active filters:',
    'search.active.none': 'none',
    'search.active.remove': 'Remove filter {filter}',
    'search.active.field.resolution': 'Resolution',
    'search.active.field.codec': 'Codec',
    'search.active.field.hdr': 'HDR',
    'search.active.field.remux': 'REMUX preferred',
    'search.active.field.audio': 'Audio',
    'search.active.field.subtitles': 'Subtitles',
    'search.active.field.audioFormat': 'Audio format',
    'search.active.field.maxSize': 'Max',
    'search.active.field.minSeeders': 'Seeders ≥',
    'search.active.field.verified': 'TrueSpec only',
    'search.results.title': 'Results',
    'search.results.releases': {
        one: '{count} release',
        other: '{count} releases'
    },
    'search.results.eligible': {
        one: '{count} eligible',
        other: '{count} eligible'
    },
    'search.results.summary': '{releases} · {eligible}',
    'search.intro.title': 'Ready to search',
    'search.intro.text': 'Enter a title: the default filters come from Settings. No download starts without your click.',
    'search.empty.title': 'No releases found',
    'search.empty.text': 'Try checking the title, choosing the correct type or removing some active filters.',
    'search.error.query.required': 'Enter a title to search for.',
    'search.error.query.tooLong': 'The title can contain at most {max} characters.',
    'search.error.number.nonNegative': 'Enter a number greater than or equal to zero.',
    'search.error.number.integer': 'Enter a whole number.',
    'search.error.validation': 'Some submitted values are not valid. Check the fields and try again.',
    'search.error.notFound': 'Resource not found. Repeat the search and try again.',
    'search.error.defaultsFailed': 'Default filters not loaded. {reason}',

    'release.source': 'Source: {source}',
    'release.badges.label': 'Release characteristics',
    'release.badge.trueSpec.label': 'Verified by TrueSpec',
    'release.badge.noVideoMetadata': 'Video metadata not available',
    'release.tracks.audio': 'Audio',
    'release.tracks.subtitles': 'Subtitles',
    'release.tracks.audioEmpty': 'Languages not specified',
    'release.tracks.subtitlesNone': 'No subtitles',
    'release.tracks.subtitlesEmpty': 'Not specified',
    'release.languageSource.Metadata': 'from TorrentClaw metadata',
    'release.languageSource.Inferred': 'inferred from the name',
    'release.languageSource.Unknown': 'not verified',
    'release.stat.declaredSize': 'Size reported by the source',
    'release.stat.actualSize': 'Size (actual torrent)',
    'release.stat.seeders': 'Seeders',
    'release.stat.leechers': 'Leechers',
    'release.stat.score': 'Score',
    'release.details.summary': 'Technical details',
    'release.details.issues': {
        one: '{count} issue',
        other: '{count} issues'
    },
    'release.details.violated': 'Constraints not met',
    'release.details.warnings': 'Warnings',
    'release.details.satisfied': 'Constraints met',
    'release.details.preferences': 'Preferences matched',
    'release.details.audioTracks': 'Audio tracks',
    'release.details.subtitleTracks': 'Subtitle tracks',
    'release.details.scores': 'Scores and format',
    'release.details.compatibility': 'Compatibility: {value}',
    'release.details.torrentClaw': 'TorrentClaw: {value}',
    'release.details.audioCodec': 'Main audio codec: {value}',
    'release.track.default.audio': 'default',
    'release.track.default.subtitle': 'default',
    'release.track.forced': 'forced',
    'release.channels': '{count} channels',
    'release.ineligible.reasons': 'Not eligible: {reasons}.',
    'release.ineligible.generic': 'Not eligible for the requested filters.',
    'release.download': 'Download',
    'release.download.checking': 'Checking…',
    'release.download.sent': 'Sent ✓',
    'release.sent.text': 'Sent to qBittorrent.',
    'release.sent.link': 'Open downloads',
    'release.magnet.title': 'Copy magnet',
    'release.magnet.label': 'Copy magnet for {name}',
    'release.magnet.copied': 'Magnet copied for {name}',
    'release.magnet.unavailable': 'The release magnet is not available.',
    'release.magnet.failed': 'Magnet not copied. {reason}',
    'release.magnet.noClipboard': 'The system clipboard is not available.',

    'rule.requestedAudio': 'requested audio language',
    'rule.requestedAudioNoData': 'requested audio language (metadata unavailable)',
    'rule.requestedSubtitles': 'requested subtitle language',
    'rule.requestedSubtitlesNoData': 'requested subtitle language (metadata unavailable)',
    'rule.noSubtitles': 'no subtitles',
    'rule.noSubtitlesTrueSpec': 'no subtitles (TrueSpec)',
    'rule.noSubtitlesNoData': 'no subtitles (metadata unavailable)',
    'rule.sizeMustBeVerified': 'size to be verified from the torrent',
    'rule.sizeLimitWillBeVerified': 'size limit will be verified before download',
    'rule.sizeExceedsLimit': 'source-reported size exceeds the limit: verify before download',
    'rule.minimumSeeders': 'minimum seeders',
    'rule.magnetUnavailable': 'magnet not available',
    'rule.resolution': 'resolution',
    'rule.codec': 'codec',
    'rule.hdr': 'HDR',
    'rule.remux': 'REMUX',
    'rule.resolutionNoData': 'Resolution not indicated',
    'rule.sizeNoData': 'Size not indicated',
    'rule.threatLevel': 'Risk level: {level}',

    'preflight.title': 'Verify torrent',
    'preflight.loading': 'Retrieving torrent metadata and actual size…',
    'preflight.source': 'Source',
    'preflight.limit': 'Maximum limit',
    'preflight.cancel': 'Cancel',
    'preflight.retry': 'Retry',
    'preflight.confirm': 'Start download',
    'preflight.ready': 'Size verified. Confirm to start the download.',
    'preflight.metadataUnavailable': 'Torrent metadata is not available.',
    'preflight.failed': 'Verification failed. {reason}',
    'preflight.starting': 'Starting download…',
    'preflight.startFailed': 'Download not started. {reason}',
    'preflight.cancelFailed': 'Cancellation failed. {reason}',
    'preflight.alreadyOpen': 'Finish or cancel the verification that is already open.'
};

const ITALIAN = {
    'nav.label': 'Pagine TorrentClaw',
    'nav.search': 'Cerca',
    'nav.downloads': 'Download',
    'nav.settings': 'Impostazioni',

    'language.picker.label': 'Lingua dell\'interfaccia',
    'language.picker.current': 'Lingua dell\'interfaccia: {language}',
    'language.en': 'Inglese',
    'language.it': 'Italiano',
    'language.es': 'Spagnolo',
    'language.fr': 'Francese',
    'language.de': 'Tedesco',
    'language.ja': 'Giapponese',
    'language.pt': 'Portoghese',
    'language.ru': 'Russo',
    'language.itEn': 'Italiano + Inglese',
    'language.noSubtitles': 'Nessun sottotitolo',
    'language.unknown': 'Lingua sconosciuta',
    'language.unknownWithCode': 'Lingua sconosciuta ({code})',

    'common.any': 'Qualsiasi',
    'common.noPreference': 'Nessuna preferenza',
    'common.unknown': 'Sconosciuta',
    'common.notSpecified': 'Non indicata',
    'common.notSet': 'Non impostato',
    'common.text': '{text}',
    'common.reason': '{title}. {detail}',

    'error.network': 'Impossibile contattare il server Jellyfin. Controlla la connessione e riprova.',
    'error.unauthorized': 'Sessione scaduta o permessi insufficienti: accedi di nuovo come amministratore.',
    'error.server': 'Il server ha riscontrato un errore imprevisto. Riprova più tardi.',
    'error.generic': 'La richiesta non è andata a buon fine. Riprova.',

    'validation.required': 'Campo obbligatorio.',
    'validation.url.full': 'Inserisci un URL completo, ad esempio https://esempio.it',
    'validation.url.httpsOnly': 'È consentito solo HTTPS.',
    'validation.url.httpOrHttps': 'Usa un indirizzo HTTP o HTTPS.',
    'validation.url.credentials': 'Non inserire credenziali nell\'URL: usa i campi dedicati.',
    'validation.integer': 'Inserisci un numero intero.',
    'validation.number': 'Inserisci un numero.',
    'validation.min': 'Il valore minimo è {min}.',
    'validation.range': 'Inserisci un valore tra {min} e {max}.',

    'settings.title': 'Impostazioni',
    'settings.lead': 'Collegamenti a TorrentClaw e qBittorrent, directory di destinazione e filtri predefiniti della ricerca.',
    'settings.notice.title': 'Come vengono conservate le credenziali',
    'settings.notice.text': 'API key e password sono salvate nel file di configurazione del plugin sul server Jellyfin, '
        + 'protette dai permessi del filesystem e non cifrate. Non vengono mai restituite al browser: '
        + 'la pagina mostra solo se sono presenti.',
    'settings.torrentclaw.text': 'Servizio di ricerca delle release. La API key viaggia solo nell\'header delle richieste verso TorrentClaw.',
    'settings.torrentclaw.url.label': 'URL del servizio',
    'settings.torrentclaw.url.hint': 'Solo HTTPS, senza credenziali nell\'indirizzo. Predefinito: https://torrentclaw.com',
    'settings.apiKey.label': 'API key',
    'settings.apiKey.configured': 'Chiave salvata',
    'settings.apiKey.missing': 'Nessuna chiave salvata',
    'settings.apiKey.hint': 'Lascia vuoto per mantenere la chiave già salvata.',
    'settings.apiKey.placeholder.keep': 'Lascia vuoto per mantenere la chiave salvata',
    'settings.apiKey.placeholder.new': 'Incolla la API key TorrentClaw',
    'settings.timeout.label': 'Timeout (secondi)',
    'settings.retries.label': 'Tentativi aggiuntivi',
    'settings.retries.hint': 'Solo per limiti di richieste (429) ed errori del server (5xx).',
    'settings.test.button': 'Verifica connessione',
    'settings.test.hint': 'La verifica salva prima le impostazioni correnti.',
    'settings.qbittorrent.text': 'Client che scarica le release scelte manualmente dalla pagina di ricerca.',
    'settings.qbittorrent.url.label': 'URL della WebUI',
    'settings.qbittorrent.url.hint': 'HTTP o HTTPS, anche in rete locale. Esempio: http://127.0.0.1:8080',
    'settings.qbittorrent.username.label': 'Nome utente',
    'settings.qbittorrent.password.label': 'Password',
    'settings.qbittorrent.password.configured': 'Password salvata',
    'settings.qbittorrent.password.missing': 'Nessuna password salvata',
    'settings.qbittorrent.password.hint': 'Lascia vuoto per mantenerla.',
    'settings.qbittorrent.password.placeholder.keep': 'Lascia vuoto per mantenerla',
    'settings.qbittorrent.password.placeholder.new': 'Password della WebUI',
    'settings.qbittorrent.category.label': 'Categoria',
    'settings.qbittorrent.category.hint': 'Assegnata ai torrent aggiunti dal plugin.',
    'settings.paths.title': 'Percorsi',
    'settings.paths.text': 'Le directory devono esistere ed essere accessibili sia a qBittorrent sia a Jellyfin.',
    'settings.paths.movies.label': 'Directory film',
    'settings.paths.movies.hint': 'Destinazione dei film; il completamento avvia l\'aggiornamento della libreria.',
    'settings.paths.shows.label': 'Directory serie TV',
    'settings.paths.shows.hint': 'Destinazione delle serie TV.',
    'settings.paths.downloads.label': 'Directory download',
    'settings.paths.downloads.hint': 'Solo informativa: i torrent vengono salvati direttamente nelle directory film e serie TV.',
    'settings.preferences.title': 'Preferenze',
    'settings.preferences.text': 'Valori proposti all\'apertura della pagina di ricerca e frequenza di controllo dei download.',
    'settings.preferences.resolution': 'Risoluzione',
    'settings.preferences.codec': 'Codec',
    'settings.preferences.hdr': 'HDR',
    'settings.preferences.audioLanguage': 'Lingua audio',
    'settings.preferences.subtitleLanguage': 'Sottotitoli',
    'settings.preferences.maxSize.label': 'Dimensione massima (GB)',
    'settings.preferences.maxSize.hint': '0 o vuoto: nessun limite.',
    'settings.preferences.minSeeders': 'Seeders minimi',
    'settings.preferences.poll.label': 'Controllo download (secondi)',
    'settings.preferences.poll.hint': 'Ogni quanto il server interroga qBittorrent (10–300).',
    'settings.preferences.remux': 'Preferisci release REMUX',
    'settings.save.loading': 'Caricamento delle impostazioni…',
    'settings.save.button': 'Salva impostazioni',
    'settings.status.loaded': 'Impostazioni caricate.',
    'settings.status.loadFailed': 'Impostazioni non caricate. {reason}',
    'settings.status.saved': 'Impostazioni salvate alle {time}.',
    'settings.status.unsaved': 'Modifiche non salvate',
    'settings.status.fixFields': 'Correggi i campi evidenziati prima di salvare.',
    'settings.status.testing': 'Salvataggio e verifica in corso',
    'settings.status.testSkipped': 'Verifica non eseguita: impostazioni non salvate',
    'settings.error.validation': 'Alcuni valori non sono validi. Controlla i campi e riprova.',
    'settings.connection.Connected': 'Connessione riuscita',
    'settings.connection.InvalidApiKey': 'API key non valida',
    'settings.connection.Unauthorized': 'Credenziali non autorizzate',
    'settings.connection.ServiceUnavailable': 'Servizio non raggiungibile',
    'settings.connection.Timeout': 'Tempo scaduto',
    'settings.connection.ConfigurationError': 'Configurazione non valida',
    'settings.connection.ConfigurationErrorWithMessage': 'Configurazione non valida: {message}',
    'settings.connection.unrecognised': 'Risultato della verifica non riconosciuto',

    'downloads.title': 'Download',
    'downloads.lead': 'Stato dei torrent inviati a qBittorrent da questo plugin. '
        + 'Al completamento viene richiesto l\'aggiornamento della libreria Jellyfin.',
    'downloads.notice.title': 'Monitoraggio in memoria',
    'downloads.notice.text': 'L\'elenco contiene solo i download avviati da questo plugin dall\'ultimo avvio di Jellyfin. '
        + 'Dopo un riavvio i torrent restano in qBittorrent ma non compaiono più qui. '
        + 'La rimozione non cancella mai i file scaricati.',
    'downloads.summary.loading': 'Caricamento dei download…',
    'downloads.summary.none': 'Nessun download monitorato',
    'downloads.summary.total': {
        one: '{count} download monitorato',
        other: '{count} download monitorati'
    },
    'downloads.summary.withActive': '{total} · {active} in corso',
    'downloads.toolbar.autoRefresh': 'Aggiornamento automatico ogni {seconds} secondi mentre la pagina è visibile.',
    'downloads.toolbar.updated': 'Aggiornato alle {time} · aggiornamento automatico ogni {seconds} secondi.',
    'downloads.toolbar.refresh': 'Aggiorna',
    'downloads.empty.title': 'Nessun download monitorato',
    'downloads.empty.text': 'Scegli una release dalla pagina di ricerca e premi Download: '
        + 'comparirà qui con avanzamento, velocità e tempo stimato.',
    'downloads.empty.link': 'Vai alla ricerca',
    'downloads.state.Waiting': 'In attesa di stato',
    'downloads.state.Unknown': 'Stato sconosciuto',
    'downloads.state.Queued': 'In coda',
    'downloads.state.Downloading': 'In download',
    'downloads.state.Paused': 'In pausa',
    'downloads.state.Stalled': 'Bloccato',
    'downloads.state.Checking': 'In verifica',
    'downloads.state.Completed': 'Completato',
    'downloads.state.Error': 'Errore',
    'downloads.state.MissingFiles': 'File mancanti',
    'downloads.type.movie': 'Film',
    'downloads.type.show': 'Serie TV',
    'downloads.type.other': 'Contenuto',
    'downloads.card.meta': '{type} · aggiunto {date}',
    'downloads.card.progress': 'Avanzamento',
    'downloads.card.progressText': '{percent} completato',
    'downloads.card.downloaded': 'Scaricato',
    'downloads.card.downloadedOf': '{done} di {total}',
    'downloads.card.speed': 'Velocità',
    'downloads.card.eta': 'Tempo stimato',
    'downloads.card.etaUnknown': 'Non stimabile',
    'downloads.card.libraryRefresh': '✓ Aggiornamento della libreria Jellyfin richiesto',
    'downloads.card.clientError': 'qBittorrent segnala: {error}',
    'downloads.action.pause': 'Pausa',
    'downloads.action.resume': 'Riprendi',
    'downloads.action.remove': 'Rimuovi',
    'downloads.action.cancel': 'Annulla',
    'downloads.action.confirmRemoval': 'Conferma rimozione',
    'downloads.action.pauseLabel': 'Metti in pausa {name}',
    'downloads.action.resumeLabel': 'Riprendi {name}',
    'downloads.action.removeLabel': 'Rimuovi {name} da qBittorrent',
    'downloads.action.removalQuestion': 'Rimuovere il torrent da qBittorrent? I file scaricati restano sul disco.',
    'downloads.action.pauseDone': 'Pausa richiesta a qBittorrent. Lo stato si aggiornerà al prossimo controllo del server.',
    'downloads.action.resumeDone': 'Ripresa richiesta a qBittorrent. Lo stato si aggiornerà al prossimo controllo del server.',
    'downloads.action.removeDone': 'Torrent rimosso da qBittorrent. I file scaricati sono stati conservati.',
    'downloads.action.unsupported': 'Azione non supportata.',
    'downloads.error.notFound': 'Il download non è più monitorato. Aggiorna l\'elenco.',
    'downloads.error.listFailed': 'Elenco non aggiornato. {reason}',
    'downloads.duration.seconds': '{n} s',
    'downloads.duration.minutes': '{n} min',
    'downloads.duration.hours': '{h} h {m} min',
    'downloads.duration.days': '{d} g {h} h',

    'search.title': 'Cerca release',
    'search.lead': 'Cerca su TorrentClaw, confronta qualità, lingue e disponibilità, '
        + 'poi invia manualmente la release scelta a qBittorrent.',
    'search.content.legend': 'Contenuto',
    'search.query.label': 'Titolo',
    'search.type.label': 'Tipo',
    'search.type.movie': 'Film',
    'search.type.show': 'Serie TV',
    'search.button': 'Cerca',
    'search.button.busy': 'Ricerca…',
    'search.filters.title': 'Filtri',
    'search.filters.count': {
        one: '{count} attivo',
        other: '{count} attivi'
    },
    'search.filters.video': 'Video',
    'search.filters.resolution': 'Risoluzione',
    'search.filters.codec': 'Codec',
    'search.filters.hdr': 'HDR',
    'search.filters.remux': 'Preferisci REMUX',
    'search.filters.audioAndSubtitles': 'Audio e sottotitoli',
    'search.filters.audioLanguage': 'Lingua audio',
    'search.filters.subtitleLanguage': 'Sottotitoli',
    'search.filters.audioFormat': 'Formato audio',
    'search.filters.audioFormatPlaceholder': 'Atmos, DTS, AAC…',
    'search.filters.audioHint': 'Audio e sottotitoli sono filtri distinti: con più lingue devono essere presenti tutte.',
    'search.filters.availability': 'Disponibilità',
    'search.filters.maxSize': 'Dimensione massima (GB)',
    'search.filters.minSeeders': 'Seeders minimi',
    'search.filters.sort': 'Ordina per',
    'search.filters.sort.compatibility': 'Compatibilità',
    'search.filters.sort.quality': 'Qualità',
    'search.filters.sort.seeders': 'Seeders',
    'search.filters.sort.size': 'Dimensione',
    'search.filters.verifiedOnly': 'Solo release verificate TrueSpec',
    'search.active.label': 'Filtri attivi:',
    'search.active.none': 'nessuno',
    'search.active.remove': 'Rimuovi filtro {filter}',
    'search.active.field.resolution': 'Risoluzione',
    'search.active.field.codec': 'Codec',
    'search.active.field.hdr': 'HDR',
    'search.active.field.remux': 'REMUX preferito',
    'search.active.field.audio': 'Audio',
    'search.active.field.subtitles': 'Sottotitoli',
    'search.active.field.audioFormat': 'Formato audio',
    'search.active.field.maxSize': 'Max',
    'search.active.field.minSeeders': 'Seeders ≥',
    'search.active.field.verified': 'Solo TrueSpec',
    'search.results.title': 'Risultati',
    'search.results.releases': {
        one: '{count} release',
        other: '{count} release'
    },
    'search.results.eligible': {
        one: '{count} idonea',
        other: '{count} idonee'
    },
    'search.results.summary': '{releases} · {eligible}',
    'search.intro.title': 'Pronto per la ricerca',
    'search.intro.text': 'Inserisci un titolo: i filtri predefiniti arrivano dalle Impostazioni. Nessun download parte senza il tuo clic.',
    'search.empty.title': 'Nessuna release trovata',
    'search.empty.text': 'Prova a controllare il titolo, a scegliere il tipo corretto oppure a rimuovere alcuni filtri attivi.',
    'search.error.query.required': 'Inserisci un titolo da cercare.',
    'search.error.query.tooLong': 'Il titolo può contenere al massimo {max} caratteri.',
    'search.error.number.nonNegative': 'Inserisci un numero maggiore o uguale a zero.',
    'search.error.number.integer': 'Inserisci un numero intero.',
    'search.error.validation': 'Alcuni valori inviati non sono validi. Controlla i campi e riprova.',
    'search.error.notFound': 'Risorsa non trovata. Ripeti la ricerca e riprova.',
    'search.error.defaultsFailed': 'Filtri predefiniti non caricati. {reason}',

    'release.source': 'Fonte: {source}',
    'release.badges.label': 'Caratteristiche della release',
    'release.badge.trueSpec.label': 'Verificata TrueSpec',
    'release.badge.noVideoMetadata': 'Metadati video non disponibili',
    'release.tracks.audio': 'Audio',
    'release.tracks.subtitles': 'Sottotitoli',
    'release.tracks.audioEmpty': 'Lingue non indicate',
    'release.tracks.subtitlesNone': 'Nessun sottotitolo',
    'release.tracks.subtitlesEmpty': 'Non indicati',
    'release.languageSource.Metadata': 'da metadati TorrentClaw',
    'release.languageSource.Inferred': 'dedotto dal nome',
    'release.languageSource.Unknown': 'non verificato',
    'release.stat.declaredSize': 'Dimensione dichiarata dalla fonte',
    'release.stat.actualSize': 'Dimensione (effettiva torrent)',
    'release.stat.seeders': 'Seeders',
    'release.stat.leechers': 'Leechers',
    'release.stat.score': 'Punteggio',
    'release.details.summary': 'Dettagli tecnici',
    'release.details.issues': {
        one: '{count} segnalazione',
        other: '{count} segnalazioni'
    },
    'release.details.violated': 'Vincoli non rispettati',
    'release.details.warnings': 'Avvisi',
    'release.details.satisfied': 'Vincoli rispettati',
    'release.details.preferences': 'Preferenze soddisfatte',
    'release.details.audioTracks': 'Tracce audio',
    'release.details.subtitleTracks': 'Tracce sottotitoli',
    'release.details.scores': 'Punteggi e formato',
    'release.details.compatibility': 'Compatibilità: {value}',
    'release.details.torrentClaw': 'TorrentClaw: {value}',
    'release.details.audioCodec': 'Codec audio principale: {value}',
    'release.track.default.audio': 'predefinita',
    'release.track.default.subtitle': 'predefiniti',
    'release.track.forced': 'forzati',
    'release.channels': '{count} canali',
    'release.ineligible.reasons': 'Non idonea: {reasons}.',
    'release.ineligible.generic': 'Non idonea ai filtri richiesti.',
    'release.download': 'Download',
    'release.download.checking': 'Verifica…',
    'release.download.sent': 'Inviata ✓',
    'release.sent.text': 'Inviata a qBittorrent.',
    'release.sent.link': 'Apri i download',
    'release.magnet.title': 'Copia magnet',
    'release.magnet.label': 'Copia magnet di {name}',
    'release.magnet.copied': 'Magnet copiato per {name}',
    'release.magnet.unavailable': 'Il magnet della release non è disponibile.',
    'release.magnet.failed': 'Magnet non copiato. {reason}',
    'release.magnet.noClipboard': 'La clipboard di sistema non è disponibile.',

    'rule.requestedAudio': 'lingua audio richiesta',
    'rule.requestedAudioNoData': 'lingua audio richiesta (dato assente)',
    'rule.requestedSubtitles': 'sottotitoli richiesti',
    'rule.requestedSubtitlesNoData': 'sottotitoli richiesti (dato assente)',
    'rule.noSubtitles': 'nessun sottotitolo',
    'rule.noSubtitlesTrueSpec': 'nessun sottotitolo (TrueSpec)',
    'rule.noSubtitlesNoData': 'nessun sottotitolo (dato assente)',
    'rule.sizeMustBeVerified': 'dimensione da verificare dal torrent',
    'rule.sizeLimitWillBeVerified': 'limite dimensione da verificare prima del download',
    'rule.sizeExceedsLimit': 'dimensione della fonte oltre limite: verifica prima del download',
    'rule.minimumSeeders': 'seeders minimi',
    'rule.magnetUnavailable': 'magnet non disponibile',
    'rule.resolution': 'risoluzione',
    'rule.codec': 'codec',
    'rule.hdr': 'HDR',
    'rule.remux': 'REMUX',
    'rule.resolutionNoData': 'Risoluzione non indicata',
    'rule.sizeNoData': 'Dimensione non indicata',
    'rule.threatLevel': 'Livello di rischio: {level}',

    'preflight.title': 'Verifica torrent',
    'preflight.loading': 'Recupero dei metadati torrent e della dimensione effettiva…',
    'preflight.source': 'Fonte',
    'preflight.limit': 'Limite massimo',
    'preflight.cancel': 'Annulla',
    'preflight.retry': 'Riprova',
    'preflight.confirm': 'Avvia download',
    'preflight.ready': 'Dimensione verificata. Conferma per avviare il download.',
    'preflight.metadataUnavailable': 'I metadati torrent non sono disponibili.',
    'preflight.failed': 'Verifica non riuscita. {reason}',
    'preflight.starting': 'Avvio del download…',
    'preflight.startFailed': 'Download non avviato. {reason}',
    'preflight.cancelFailed': 'Annullamento non riuscito. {reason}',
    'preflight.alreadyOpen': 'Completa o annulla prima la verifica già aperta.'
};

export const TRANSLATIONS = Object.freeze({ en: Object.freeze(ENGLISH), it: Object.freeze(ITALIAN) });

/* =============================================================================
 * Core translation
 * ========================================================================== */

function isSupportedLanguage(code) {
    return SUPPORTED_LANGUAGES.some(language => language.code === code);
}

function getDefaultStorage() {
    try {
        return globalThis.sessionStorage ?? null;
    } catch {
        // Accessing the storage itself can throw when it is blocked by the browser.
        return null;
    }
}

/** Builds a language-independent message that is turned into text only when it is displayed. */
export function message(key, params = {}) {
    return Object.freeze({ key, params });
}

function isMessageDescriptor(value) {
    return value !== null && typeof value === 'object' && typeof value.key === 'string';
}

/**
 * Creates an independent i18n instance. The pages share one instance (the default one below);
 * tests create their own with a fake storage.
 */
export function createI18n({ getStorage = getDefaultStorage, translations = TRANSLATIONS } = {}) {
    const listeners = new Set();
    let currentLanguage = null;

    function readStoredLanguage() {
        try {
            const stored = getStorage()?.getItem(LANGUAGE_STORAGE_KEY);
            return isSupportedLanguage(stored) ? stored : null;
        } catch {
            return null;
        }
    }

    function getLanguage() {
        currentLanguage ??= readStoredLanguage() ?? DEFAULT_LANGUAGE;
        return currentLanguage;
    }

    function getLocale() {
        return SUPPORTED_LANGUAGES.find(language => language.code === getLanguage()).locale;
    }

    function setLanguage(code) {
        if (!isSupportedLanguage(code)) {
            return false;
        }

        const changed = getLanguage() !== code;
        currentLanguage = code;
        try {
            getStorage()?.setItem(LANGUAGE_STORAGE_KEY, code);
        } catch {
            // The choice still applies to this page load when the storage is not writable.
        }

        if (changed) {
            notify(code);
        }

        return true;
    }

    function notify(code) {
        for (const listener of [...listeners]) {
            listener(code);
        }

        if (typeof globalThis.document?.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
            globalThis.document.dispatchEvent(new globalThis.CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language: code } }));
        }
    }

    function onLanguageChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function lookup(key) {
        return translations[getLanguage()]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key];
    }

    function formatParameter(value) {
        if (typeof value === 'function') {
            return formatParameter(value());
        }

        if (isMessageDescriptor(value)) {
            return t(value.key, value.params);
        }

        if (typeof value === 'number') {
            return Number.isFinite(value) ? formatNumber(value) : '—';
        }

        return String(value ?? '');
    }

    function t(key, parameters = {}) {
        let entry = lookup(key);
        if (entry === undefined) {
            return key;
        }

        if (typeof entry === 'object') {
            const category = new Intl.PluralRules(getLocale()).select(Number(parameters.count));
            entry = entry[category] ?? entry.other;
        }

        return entry.replace(/\{(\w+)\}/g, (placeholder, name) =>
            Object.hasOwn(parameters, name) ? formatParameter(parameters[name]) : placeholder);
    }

    function resolveMessage(descriptor) {
        return isMessageDescriptor(descriptor) ? t(descriptor.key, descriptor.params) : '';
    }

    function formatNumber(value, options) {
        return value.toLocaleString(getLocale(), options);
    }

    function translateTree(root) {
        const selector = '[data-i18n], [data-i18n-attr]';
        const targets = [...root.querySelectorAll(selector)];
        if (root.matches?.(selector)) {
            targets.unshift(root);
        }

        for (const element of targets) {
            const key = element.getAttribute('data-i18n');
            if (key) {
                element.textContent = t(key);
            }

            for (const pair of (element.getAttribute('data-i18n-attr') ?? '').split(';')) {
                const [attributeName, attributeKey] = pair.split(':').map(part => part.trim());
                if (attributeName && attributeKey) {
                    element.setAttribute(attributeName, t(attributeKey));
                }
            }
        }

        root.setAttribute?.('lang', getLanguage());
    }

    return {
        getLanguage,
        setLanguage,
        getLocale,
        onLanguageChange,
        t,
        resolveMessage,
        formatNumber,
        translateTree
    };
}

const defaultInstance = createI18n();

export const getLanguage = defaultInstance.getLanguage;
export const setLanguage = defaultInstance.setLanguage;
export const getLocale = defaultInstance.getLocale;
export const onLanguageChange = defaultInstance.onLanguageChange;
export const t = defaultInstance.t;
export const resolveMessage = defaultInstance.resolveMessage;
export const formatNumber = defaultInstance.formatNumber;

/** Applies data-i18n (text) and data-i18n-attr ("attribute:key;attribute:key") markers below root. */
export const translatePage = defaultInstance.translateTree;

/* =============================================================================
 * Localizer registry
 * ========================================================================== */

/**
 * Keeps track of the dynamically created DOM whose text depends on the language, so it can be refreshed in
 * place when the language changes, without rebuilding elements or losing their state.
 */
export function createLocalizerRegistry() {
    const updaters = new Set();
    const registry = {
        run(update) {
            update();
            updaters.add(update);
        },
        text(element, produce) {
            registry.run(() => {
                element.textContent = produce();
            });
            return element;
        },
        attribute(element, name, produce) {
            registry.run(() => element.setAttribute(name, produce()));
            return element;
        },
        refresh() {
            for (const update of [...updaters]) {
                update();
            }
        },
        clear() {
            updaters.clear();
        }
    };
    return registry;
}

/* =============================================================================
 * Language picker
 * ========================================================================== */

function drawLanguageFlag(svg, code) {
    const create = (tagName, attributes) => {
        const element = svg.ownerDocument.createElementNS(SVG_NAMESPACE, tagName);
        for (const [name, value] of Object.entries(attributes)) {
            element.setAttribute(name, String(value));
        }

        return element;
    };

    svg.replaceChildren();
    if (code === 'it') {
        svg.append(
            create('rect', { x: 0, y: 0, width: 10.1, height: 20, fill: '#009246' }),
            create('rect', { x: 10, y: 0, width: 10.1, height: 20, fill: '#ffffff' }),
            create('rect', { x: 20, y: 0, width: 10, height: 20, fill: '#ce2b37' })
        );
        return;
    }

    svg.append(
        create('rect', { width: 30, height: 20, fill: '#012169' }),
        create('path', { d: 'M0 0L30 20M30 0L0 20', stroke: '#ffffff', 'stroke-width': 4 }),
        create('path', { d: 'M0 0L30 20M30 0L0 20', stroke: '#c8102e', 'stroke-width': 1.5 }),
        create('path', { d: 'M15 0V20M0 10H30', stroke: '#ffffff', 'stroke-width': 6 }),
        create('path', { d: 'M15 0V20M0 10H30', stroke: '#c8102e', 'stroke-width': 3.5 })
    );
}

/**
 * Wires the language picker markup found below root (see [data-language-picker] in the page HTML):
 * a button that opens a listbox with one flag per supported language. Flags are drawn as local SVG
 * because Windows renders regional-indicator emoji as two plain letters.
 * The picker keeps itself in sync with the shared language, whichever page changed it.
 */
export function bindLanguagePicker(root, { i18n = defaultInstance, signal } = {}) {
    const picker = root.querySelector('[data-language-picker]');
    if (!picker) {
        return;
    }

    const button = picker.querySelector('[data-language-button]');
    const list = picker.querySelector('[data-language-list]');
    const currentSlot = picker.querySelector('[data-language-current]');
    const options = [...list.querySelectorAll('[data-language]')];
    for (const flag of picker.querySelectorAll('svg[data-flag]')) {
        drawLanguageFlag(flag, flag.getAttribute('data-flag'));
    }

    function sync() {
        const code = i18n.getLanguage();
        for (const option of options) {
            const isSelected = option.getAttribute('data-language') === code;
            option.setAttribute('aria-selected', String(isSelected));
            if (isSelected) {
                currentSlot.replaceChildren(option.querySelector('svg').cloneNode(true));
            }
        }

        const label = i18n.t('language.picker.current', { language: i18n.t(`language.${code}`) });
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        list.setAttribute('aria-label', i18n.t('language.picker.label'));
    }

    function isOpen() {
        return !list.hidden;
    }

    function open() {
        list.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        (options.find(option => option.getAttribute('aria-selected') === 'true') ?? options[0]).focus();
    }

    function close({ restoreFocus = false } = {}) {
        list.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus) {
            button.focus();
        }
    }

    function choose(option) {
        i18n.setLanguage(option.getAttribute('data-language'));
        close({ restoreFocus: true });
    }

    function moveFocus(fromOption, step) {
        const index = options.indexOf(fromOption);
        options[(index + step + options.length) % options.length].focus();
    }

    const listenerOptions = { signal };
    button.addEventListener('click', () => (isOpen() ? close() : open()), listenerOptions);
    button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open();
        }
    }, listenerOptions);

    for (const option of options) {
        option.addEventListener('click', () => choose(option), listenerOptions);
        option.addEventListener('keydown', event => {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    moveFocus(option, 1);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    moveFocus(option, -1);
                    break;
                case 'Home':
                    event.preventDefault();
                    options[0].focus();
                    break;
                case 'End':
                    event.preventDefault();
                    options[options.length - 1].focus();
                    break;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    choose(option);
                    break;
                case 'Escape':
                    event.preventDefault();
                    close({ restoreFocus: true });
                    break;
                case 'Tab':
                    close();
                    break;
                default:
                    break;
            }
        }, listenerOptions);
    }

    picker.ownerDocument.addEventListener('click', event => {
        if (isOpen() && !picker.contains(event.target)) {
            close();
        }
    }, listenerOptions);

    const unsubscribe = i18n.onLanguageChange(sync);
    signal?.addEventListener('abort', unsubscribe, { once: true });
    sync();
}
