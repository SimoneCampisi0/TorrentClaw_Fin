/*
 * TorrentClaw · Search page
 *
 * Jellyfin imports this file as an ES module (data-controller="__plugin/TorrentClawSearch.js")
 * and creates the default export once for every view instance, passing the page element.
 */

/* =============================================================================
 * Constants
 * ========================================================================== */

// The shared module is served as a plugin asset next to this page, so it is resolved against the page URL
// (and therefore honours a Jellyfin base path). In Node tests it is imported from the source tree.
const I18N_ASSET_PATH = 'configurationpage?name=TorrentClawI18n.js';

async function loadI18n() {
    if (typeof window === 'undefined') {
        return import('../Shared/torrentclaw-i18n.js');
    }

    return import(new URL(I18N_ASSET_PATH, window.location.href).href);
}

// Jellyfin loads a controller through a blob script whose "load" event fires before a module with top-level await
// has finished evaluating, so the module must not await anything at the top level. The page is initialised
// when the shared module is ready instead (tests await i18nReady before calling the exported helpers).
let i18n = null;
export const i18nReady = loadI18n().then(module => {
    i18n = module;
});

const bindLanguagePicker = (...args) => i18n.bindLanguagePicker(...args);
const createLocalizerRegistry = (...args) => i18n.createLocalizerRegistry(...args);
const getLocale = (...args) => i18n.getLocale(...args);
const message = (...args) => i18n.message(...args);
const onLanguageChange = (...args) => i18n.onLanguageChange(...args);
const resolveMessage = (...args) => i18n.resolveMessage(...args);
const t = (...args) => i18n.t(...args);
const translatePage = (...args) => i18n.translatePage(...args);

const ENDPOINTS = Object.freeze({
    configuration: 'TorrentClaw/Configuration',
    search: 'TorrentClaw/Search',
    posterTemplate: 'TorrentClaw/Search/{releaseId}/Poster',
    magnetTemplate: 'TorrentClaw/Search/{releaseId}/Magnet',
    preflight: 'TorrentClaw/Downloads/Preflight',
    preflightConfirmTemplate: 'TorrentClaw/Downloads/Preflight/{releaseId}/Confirm',
    preflightTemplate: 'TorrentClaw/Downloads/Preflight/{releaseId}'
});

const DOWNLOADS_PAGE_URL = '#/configurationpage?name=TorrentClawDownloads';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MAX_QUERY_LENGTH = 200;
const MAX_PARALLEL_POSTER_REQUESTS = 4;
const POSTER_PRELOAD_MARGIN = '400px 0px';
const UNKNOWN_LANGUAGE_SYMBOL = '🌐';

const POSTER_STATE = Object.freeze({
    none: 'none',
    pending: 'pending',
    loading: 'loading',
    loaded: 'loaded',
    failed: 'failed'
});

// Media languages (audio and subtitles of a release). Codes and aliases are data used to normalise what
// TorrentClaw reports; the displayed name is the dictionary entry "language.<code>" in the active UI language.
const LANGUAGES = Object.freeze([
    { code: 'it', aliases: ['it', 'ita', 'italian', 'italiano'] },
    { code: 'en', aliases: ['en', 'eng', 'english', 'inglese'] },
    { code: 'es', aliases: ['es', 'spa', 'spanish', 'espanol', 'español', 'spagnolo'] },
    { code: 'fr', aliases: ['fr', 'fra', 'fre', 'french', 'francais', 'français', 'francese'] },
    { code: 'de', aliases: ['de', 'deu', 'ger', 'german', 'deutsch', 'tedesco'] },
    { code: 'ja', aliases: ['ja', 'jpn', 'japanese', 'giapponese'] },
    { code: 'pt', aliases: ['pt', 'por', 'portuguese', 'portoghese'] },
    { code: 'ru', aliases: ['ru', 'rus', 'russian', 'russo'] }
]);

const LANGUAGE_BY_ALIAS = new Map(
    LANGUAGES.flatMap(language => language.aliases.map(alias => [alias, language]))
);

const UNKNOWN_LANGUAGE_VALUES = new Set(['und', 'unknown', 'unk', 'mis', 'zxx', '?']);

// Flags are drawn as local SVG because Windows shows regional-indicator emoji as two plain letters.
const FLAG_DESIGNS = Object.freeze({
    it: { kind: 'vertical-stripes', colors: ['#009246', '#ffffff', '#ce2b37'] },
    fr: { kind: 'vertical-stripes', colors: ['#002395', '#ffffff', '#ed2939'] },
    de: { kind: 'horizontal-stripes', colors: ['#000000', '#dd0000', '#ffce00'] },
    ru: { kind: 'horizontal-stripes', colors: ['#ffffff', '#0039a6', '#d52b1e'] },
    es: { kind: 'horizontal-stripes', colors: ['#aa151b', '#f1bf00', '#f1bf00', '#aa151b'] },
    ja: { kind: 'disc', background: '#ffffff', disc: '#bc002d' },
    pt: { kind: 'portugal' },
    en: { kind: 'union-jack' }
});

const CHANNEL_LAYOUTS = Object.freeze({
    1: '1.0',
    2: '2.0',
    3: '2.1',
    4: '4.0',
    5: '5.0',
    6: '5.1',
    7: '6.1',
    8: '7.1'
});

const LANGUAGE_SOURCE_LABEL_KEYS = Object.freeze({
    Metadata: 'release.languageSource.Metadata',
    Inferred: 'release.languageSource.Inferred',
    Unknown: 'release.languageSource.Unknown'
});

const CODEC_LABELS = Object.freeze({
    avc: 'H.264',
    h264: 'H.264',
    x264: 'H.264',
    hevc: 'HEVC',
    h265: 'HEVC',
    x265: 'HEVC',
    av1: 'AV1',
    vp9: 'VP9'
});

const HDR_LABELS = Object.freeze({
    sdr: 'SDR',
    hdr: 'HDR',
    hdr10: 'HDR10',
    hdr10plus: 'HDR10+',
    dolbyvision: 'Dolby Vision',
    dv: 'Dolby Vision',
    dovi: 'Dolby Vision',
    hlg: 'HLG'
});

// Rules arrive from the server as English identifiers: they map to dictionary keys shown in the UI language.
const RULE_LABEL_KEYS = Object.freeze({
    'requested audio language': 'rule.requestedAudio',
    'requested audio language (metadata unavailable)': 'rule.requestedAudioNoData',
    'requested subtitle language': 'rule.requestedSubtitles',
    'requested subtitle language (metadata unavailable)': 'rule.requestedSubtitlesNoData',
    'no subtitles': 'rule.noSubtitles',
    'no subtitles (TrueSpec)': 'rule.noSubtitlesTrueSpec',
    'no subtitles (metadata unavailable)': 'rule.noSubtitlesNoData',
    'Size must be verified from torrent metadata': 'rule.sizeMustBeVerified',
    'Size limit will be verified before download': 'rule.sizeLimitWillBeVerified',
    'Source-reported size exceeds the limit; verify before download': 'rule.sizeExceedsLimit',
    'minimum seeders': 'rule.minimumSeeders',
    'magnet unavailable': 'rule.magnetUnavailable',
    resolution: 'rule.resolution',
    codec: 'rule.codec',
    HDR: 'rule.hdr',
    REMUX: 'rule.remux',
    'Resolution metadata unavailable': 'rule.resolutionNoData',
    'Size metadata unavailable': 'rule.sizeNoData'
});

const ACTIVE_FILTER_FIELDS = Object.freeze([
    { id: 'tcResolution', labelKey: 'search.active.field.resolution', kind: 'select' },
    { id: 'tcCodec', labelKey: 'search.active.field.codec', kind: 'select' },
    { id: 'tcHdr', labelKey: 'search.active.field.hdr', kind: 'select' },
    { id: 'tcPreferRemux', labelKey: 'search.active.field.remux', kind: 'checkbox' },
    { id: 'tcAudioLanguage', labelKey: 'search.active.field.audio', kind: 'select' },
    { id: 'tcSubtitleLanguage', labelKey: 'search.active.field.subtitles', kind: 'select' },
    { id: 'tcAudioFormat', labelKey: 'search.active.field.audioFormat', kind: 'text' },
    { id: 'tcMaxSize', labelKey: 'search.active.field.maxSize', kind: 'text', suffix: ' GB' },
    { id: 'tcMinSeeders', labelKey: 'search.active.field.minSeeders', kind: 'text' },
    { id: 'tcVerifiedOnly', labelKey: 'search.active.field.verified', kind: 'checkbox' }
]);

const DOWNLOAD_BUTTON_KEYS = Object.freeze({
    idle: 'release.download',
    checking: 'release.download.checking',
    sent: 'release.download.sent'
});

const COPY_BUTTON_SYMBOLS = Object.freeze({ idle: '⧉', busy: '…', copied: '✓' });

/* =============================================================================
 * DOM helpers
 * ========================================================================== */

function getApiClient() {
    return window.ApiClient;
}

function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) {
        element.className = options.className;
    }

    if (options.text !== undefined && options.text !== null) {
        element.textContent = String(options.text);
    }

    // Static texts are marked with data-i18n, so translatePage() keeps them in the active language.
    if (options.i18n) {
        element.setAttribute('data-i18n', options.i18n);
        element.textContent = t(options.i18n);
    }

    for (const [name, value] of Object.entries(options.attributes ?? {})) {
        element.setAttribute(name, String(value));
    }

    return element;
}

function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }

    return element;
}

function renderStatus(page) {
    const { elements, state } = page;
    if (!state.status) {
        elements.status.hidden = true;
        elements.status.replaceChildren();
        return;
    }

    elements.status.replaceChildren(createElement('span', { text: resolveMessage(state.status.descriptor) }));
    elements.status.dataset.tone = state.status.tone;
    elements.status.hidden = false;
}

/** Shows a message that is kept as a descriptor, so it can be shown again in another language. */
function showStatus(page, descriptor, tone = 'info') {
    page.state.status = { descriptor, tone };
    renderStatus(page);
}

function hideStatus(page) {
    page.state.status = null;
    renderStatus(page);
}

/** Message shown for a failed request; anything that is not a RequestError gets a generic text. */
function describeError(error) {
    return error?.descriptor ?? message('error.generic');
}

function setFieldError(page, input, errorElement, problem) {
    if (problem) {
        page.state.fieldErrors.set(errorElement, problem);
        errorElement.textContent = resolveMessage(problem);
        errorElement.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        return;
    }

    page.state.fieldErrors.delete(errorElement);
    errorElement.textContent = '';
    errorElement.hidden = true;
    input.removeAttribute('aria-invalid');
}

function setSelectValueIfAvailable(select, value) {
    const hasOption = Array.from(select.options).some(option => option.value === value);
    if (hasOption) {
        select.value = value;
    }
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

/* =============================================================================
 * Formatting and language normalisation
 * ========================================================================== */

export function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
        return t('common.unknown');
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const decimals = unitIndex >= 3 ? 2 : 1;
    const formatted = value.toLocaleString(getLocale(), {
        minimumFractionDigits: unitIndex === 0 ? 0 : decimals,
        maximumFractionDigits: unitIndex === 0 ? 0 : decimals
    });
    return `${formatted} ${units[unitIndex]}`;
}

function formatCount(value) {
    return Number.isFinite(value) ? value.toLocaleString(getLocale()) : '—';
}

function toTechnicalKey(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\+/g, 'plus')
        .replace(/[\s._\-/]/g, '');
}

function formatCodec(codec) {
    if (!codec) {
        return null;
    }

    return CODEC_LABELS[toTechnicalKey(codec)] ?? String(codec).toUpperCase();
}

function formatHdr(hdr) {
    if (!hdr) {
        return null;
    }

    return HDR_LABELS[toTechnicalKey(hdr)] ?? String(hdr);
}

export function translateRule(rule) {
    const text = String(rule);
    if (text.startsWith('Threat level:')) {
        return t('rule.threatLevel', { level: text.slice('Threat level:'.length).trim() });
    }

    return Object.hasOwn(RULE_LABEL_KEYS, text) ? t(RULE_LABEL_KEYS[text]) : text;
}

/**
 * The single place where language codes and aliases coming from TorrentClaw or TrueSpec are interpreted.
 * Audio and subtitle rendering both rely on it.
 */
export function normalizeLanguage(value) {
    const key = String(value ?? '').trim().toLowerCase();
    // "name" is a getter: the display name always follows the active UI language, even for a stored result.
    if (key === '' || UNKNOWN_LANGUAGE_VALUES.has(key)) {
        return {
            key: 'unknown',
            code: null,
            get name() { return t('language.unknown'); },
            recognized: false,
            displayCode: null
        };
    }

    const primarySubtag = key.split(/[-_]/)[0];
    const language = LANGUAGE_BY_ALIAS.get(key) ?? LANGUAGE_BY_ALIAS.get(primarySubtag);
    if (language) {
        return {
            key: language.code,
            code: language.code,
            get name() { return t(`language.${language.code}`); },
            recognized: true,
            displayCode: null
        };
    }

    const displayCode = key.toUpperCase();
    return {
        key: `other:${key}`,
        code: null,
        get name() { return t('language.unknownWithCode', { code: displayCode }); },
        recognized: false,
        displayCode
    };
}

export function formatChannelLayout(channels) {
    const count = Number(channels);
    if (!Number.isInteger(count) || count <= 0) {
        return null;
    }

    return CHANNEL_LAYOUTS[count] ?? t('release.channels', { count });
}

export function parsePreferredLanguageKeys(...values) {
    const keys = values
        .flatMap(value => String(value ?? '').split(/[,;+\s]+/))
        .map(value => normalizeLanguage(value))
        .filter(language => language.recognized)
        .map(language => language.key);
    return [...new Set(keys)];
}

function readTrackValue(track, propertyName) {
    const pascalCaseName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
    return track?.[propertyName] ?? track?.[pascalCaseName];
}

function uniqueBy(items, getKey) {
    const seen = new Set();
    return items.filter(item => {
        const key = getKey(item);
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function orderByLanguagePreference(entries, preferredLanguageKeys) {
    const rankOf = entry => {
        if (!entry.language.recognized) {
            return preferredLanguageKeys.length + 1;
        }

        const index = preferredLanguageKeys.indexOf(entry.language.key);
        return index === -1 ? preferredLanguageKeys.length : index;
    };

    return entries
        .map((entry, position) => ({ entry, position }))
        .sort((first, second) => rankOf(first.entry) - rankOf(second.entry) || first.position - second.position)
        .map(item => item.entry);
}

export function collectAudioEntries(release, preferredLanguageKeys = []) {
    const tracks = asArray(release.AudioTracks);
    const entries = tracks.length > 0
        ? tracks.map(track => ({
            language: normalizeLanguage(readTrackValue(track, 'lang')),
            channelCount: readTrackValue(track, 'channels'),
            channelLayout: formatChannelLayout(readTrackValue(track, 'channels'))
        }))
        : asArray(release.AudioLanguages).map(code => ({
            language: normalizeLanguage(code),
            channelCount: null,
            channelLayout: null
        }));

    const uniqueEntries = uniqueBy(entries, entry => `${entry.language.key}|${entry.channelLayout ?? ''}`);
    return orderByLanguagePreference(uniqueEntries, preferredLanguageKeys);
}

export function collectSubtitleEntries(release, preferredLanguageKeys = []) {
    const tracks = asArray(release.SubtitleTracks);
    const rawLanguages = tracks.length > 0
        ? tracks.map(track => readTrackValue(track, 'lang'))
        : asArray(release.SubtitleLanguages);

    const entries = rawLanguages.map(rawLanguage => ({ language: normalizeLanguage(rawLanguage) }));
    const uniqueEntries = uniqueBy(entries, entry => entry.language.key);
    return orderByLanguagePreference(uniqueEntries, preferredLanguageKeys);
}

export function describeAudioTrack(track) {
    const parts = [normalizeLanguage(readTrackValue(track, 'lang')).name];
    const codec = readTrackValue(track, 'codec');
    const channelLayout = formatChannelLayout(readTrackValue(track, 'channels'));
    const title = readTrackValue(track, 'title');
    if (codec) {
        parts.push(String(codec).toUpperCase());
    }

    if (channelLayout) {
        parts.push(channelLayout);
    }

    if (readTrackValue(track, 'default')) {
        parts.push(t('release.track.default.audio'));
    }

    if (title) {
        parts.push(`“${title}”`);
    }

    return parts.join(' · ');
}

export function describeSubtitleTrack(track) {
    const parts = [normalizeLanguage(readTrackValue(track, 'lang')).name];
    const codec = readTrackValue(track, 'codec');
    const title = readTrackValue(track, 'title');
    if (codec) {
        parts.push(String(codec));
    }

    if (readTrackValue(track, 'forced')) {
        parts.push(t('release.track.forced'));
    }

    if (readTrackValue(track, 'default')) {
        parts.push(t('release.track.default.subtitle'));
    }

    if (title) {
        parts.push(`“${title}”`);
    }

    return parts.join(' · ');
}

function getTitleInitials(title) {
    return String(title ?? '')
        .split(/\s+/)
        .map(word => word.match(/[\p{L}\p{N}]/u)?.[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

/* =============================================================================
 * API functions
 * ========================================================================== */

class RequestError extends Error {
    constructor(descriptor, status) {
        super(descriptor.key);
        this.name = 'RequestError';
        this.descriptor = descriptor;
        this.status = status;
    }
}

async function requestJson(path, { method = 'GET', body } = {}) {
    const apiClient = getApiClient();
    const request = { type: method, url: apiClient.getUrl(path), dataType: 'json' };
    if (body !== undefined) {
        request.contentType = 'application/json';
        request.data = JSON.stringify(body);
    }

    try {
        return await apiClient.ajax(request);
    } catch (failure) {
        throw await toRequestError(failure);
    }
}

async function toRequestError(failure) {
    if (failure instanceof RequestError) {
        return failure;
    }

    if (!failure || typeof failure.status !== 'number') {
        return new RequestError(message('error.network'), 0);
    }

    const problem = await readProblemDetails(failure);
    return new RequestError(describeFailure(failure.status, problem), failure.status);
}

async function readProblemDetails(response) {
    try {
        const parsed = JSON.parse(await response.text());
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function describeFailure(status, problem) {
    if (problem?.errors) {
        return message('search.error.validation');
    }

    if (problem?.title && problem?.detail) {
        return message('common.reason', { title: problem.title, detail: problem.detail });
    }

    if (status === 401 || status === 403) {
        return message('error.unauthorized');
    }

    if (status === 404) {
        return message('search.error.notFound');
    }

    if (status >= 500) {
        return message('error.server');
    }

    return message('error.generic');
}

function fetchConfiguration() {
    return requestJson(ENDPOINTS.configuration);
}

function searchReleases(searchRequest) {
    return requestJson(ENDPOINTS.search, { method: 'POST', body: searchRequest });
}

function startPreflight(releaseId) {
    return requestJson(ENDPOINTS.preflight, { method: 'POST', body: { ReleaseId: releaseId } });
}

function confirmPreflight(releaseId) {
    const path = ENDPOINTS.preflightConfirmTemplate.replace('{releaseId}', encodeURIComponent(releaseId));
    return requestJson(path, { method: 'POST' });
}

async function cancelPreflight(releaseId) {
    const apiClient = getApiClient();
    const path = ENDPOINTS.preflightTemplate.replace('{releaseId}', encodeURIComponent(releaseId));
    try {
        await apiClient.ajax({ type: 'DELETE', url: apiClient.getUrl(path) });
    } catch (failure) {
        throw await toRequestError(failure);
    }
}

function fetchReleaseMagnet(releaseId) {
    const path = ENDPOINTS.magnetTemplate.replace('{releaseId}', encodeURIComponent(releaseId));
    return requestJson(path);
}

async function fetchPosterBlob(releaseId) {
    const apiClient = getApiClient();
    const path = ENDPOINTS.posterTemplate.replace('{releaseId}', encodeURIComponent(releaseId));

    // Without a dataType, ApiClient.ajax resolves with the raw Response, which keeps the Jellyfin auth header.
    const response = await apiClient.ajax({ type: 'GET', url: apiClient.getUrl(path) });
    if (!response || typeof response.blob !== 'function') {
        return null;
    }

    const blob = await response.blob();
    return blob.type.startsWith('image/') ? blob : null;
}

/* =============================================================================
 * Page state
 * ========================================================================== */

function queryPageElements(view) {
    const find = id => view.querySelector(`#${id}`);
    const searchButton = find('tcSearchButton');
    return {
        form: find('tcSearchForm'),
        query: find('tcQuery'),
        queryError: find('tcQueryError'),
        type: find('tcType'),
        searchButton,
        searchButtonLabel: searchButton.querySelector('span'),
        filters: find('tcFilters'),
        filterCount: find('tcFilterCount'),
        resolution: find('tcResolution'),
        codec: find('tcCodec'),
        hdr: find('tcHdr'),
        preferRemux: find('tcPreferRemux'),
        audioLanguage: find('tcAudioLanguage'),
        subtitleLanguage: find('tcSubtitleLanguage'),
        audioFormat: find('tcAudioFormat'),
        maxSize: find('tcMaxSize'),
        maxSizeError: find('tcMaxSizeError'),
        minSeeders: find('tcMinSeeders'),
        minSeedersError: find('tcMinSeedersError'),
        sort: find('tcSort'),
        verifiedOnly: find('tcVerifiedOnly'),
        activeFilterList: find('tcActiveFilterList'),
        noActiveFilters: find('tcNoActiveFilters'),
        status: find('tcSearchStatus'),
        resultsHeader: find('tcResultsHeader'),
        resultsCount: find('tcResultsCount'),
        skeletonList: find('tcSkeletonList'),
        resultList: find('tcResultList'),
        introState: find('tcIntroState'),
        emptyState: find('tcEmptyState')
    };
}

function createPageState() {
    return {
        lifetime: new AbortController(),
        defaultsRequested: false,
        configuredAudioLanguage: '',
        configuredSubtitleLanguage: '',
        preferredAudioKeys: [],
        preferredSubtitleKeys: [],
        searchGeneration: 0,
        posterObserver: null,
        posterQueue: [],
        activePosterRequests: 0,
        posterObjectUrls: new Set(),
        releaseRefs: new Map(),
        activePreflight: null,
        // Language-independent state, kept so the visible texts can be rendered again when the language changes.
        isSearching: false,
        status: null,
        fieldErrors: new Map(),
        resultSummary: null,
        resultLocalizers: createLocalizerRegistry(),
        modalLocalizers: createLocalizerRegistry(),
        unsubscribeLanguage: null
    };
}

function readSearchRequest(elements) {
    return {
        Query: elements.query.value.trim(),
        Type: Number(elements.type.value),
        Resolution: elements.resolution.value || null,
        Codec: elements.codec.value || null,
        Hdr: elements.hdr.value || null,
        AudioLanguage: elements.audioLanguage.value || null,
        SubtitleLanguage: elements.subtitleLanguage.value || null,
        Audio: elements.audioFormat.value.trim() || null,
        MaxSizeGb: readPositiveNumber(elements.maxSize.value),
        MinimumSeeders: readPositiveNumber(elements.minSeeders.value),
        PreferRemux: elements.preferRemux.checked,
        VerifiedOnly: elements.verifiedOnly.checked,
        Sort: Number(elements.sort.value)
    };
}

function readPositiveNumber(rawValue) {
    const value = Number(rawValue);
    return rawValue.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
}

function getQueryError(query) {
    if (query === '') {
        return message('search.error.query.required');
    }

    if (query.length > MAX_QUERY_LENGTH) {
        return message('search.error.query.tooLong', { max: MAX_QUERY_LENGTH });
    }

    return null;
}

function getNonNegativeNumberError(rawValue, { integerOnly }) {
    if (rawValue.trim() === '') {
        return null;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
        return message('search.error.number.nonNegative');
    }

    if (integerOnly && !Number.isInteger(value)) {
        return message('search.error.number.integer');
    }

    return null;
}

function validateSearchForm(page) {
    const { elements } = page;
    const checks = [
        { input: elements.query, error: elements.queryError, problem: getQueryError(elements.query.value.trim()) },
        {
            input: elements.maxSize,
            error: elements.maxSizeError,
            problem: getNonNegativeNumberError(elements.maxSize.value, { integerOnly: false })
        },
        {
            input: elements.minSeeders,
            error: elements.minSeedersError,
            problem: getNonNegativeNumberError(elements.minSeeders.value, { integerOnly: true })
        }
    ];

    for (const check of checks) {
        setFieldError(page, check.input, check.error, check.problem);
    }

    const firstInvalid = checks.find(check => check.problem);
    if (!firstInvalid) {
        return true;
    }

    if (elements.filters.contains(firstInvalid.input)) {
        elements.filters.open = true;
    }

    firstInvalid.input.focus();
    return false;
}

/* =============================================================================
 * Rendering functions
 * ========================================================================== */

function setSearchBusy(page, isBusy) {
    const { elements } = page;
    page.state.isSearching = isBusy;
    elements.searchButton.disabled = isBusy;
    renderSearchButton(page);
    elements.form.setAttribute('aria-busy', String(isBusy));
    elements.skeletonList.hidden = !isBusy;
}

function renderSearchButton(page) {
    page.elements.searchButtonLabel.textContent = t(page.state.isSearching ? 'search.button.busy' : 'search.button');
}

function clearResults(page) {
    const { elements } = page;
    resetPosterLoading(page);
    page.state.releaseRefs.clear();
    page.state.resultLocalizers.clear();
    elements.resultList.replaceChildren();
    elements.resultsHeader.hidden = true;
    elements.emptyState.hidden = true;
    elements.introState.hidden = true;
}

function renderResults(page, releases) {
    const { elements } = page;
    clearResults(page);
    elements.resultList.replaceChildren(...releases.map(release => createReleaseCard(page, release)));

    const hasResults = releases.length > 0;
    elements.resultsHeader.hidden = !hasResults;
    elements.emptyState.hidden = hasResults;
    page.state.resultSummary = { total: releases.length, eligible: releases.filter(release => release.Eligible).length };
    renderResultsCount(page);
    observePendingPosters(page);
}

function renderResultsCount(page) {
    const summary = page.state.resultSummary;
    page.elements.resultsCount.textContent = summary
        ? t('search.results.summary', {
            releases: message('search.results.releases', { count: summary.total }),
            eligible: message('search.results.eligible', { count: summary.eligible })
        })
        : '';
}

/**
 * Refreshes every text that is not covered by data-i18n markers: chips, status, errors and the localised parts
 * of the cards and dialog already on screen. Nothing is rebuilt, so inputs, results and downloads are kept.
 */
function renderLanguage(page) {
    translatePage(page.view);
    renderSearchButton(page);
    renderActiveFilters(page);
    renderStatus(page);
    renderResultsCount(page);
    for (const [errorElement, problem] of page.state.fieldErrors) {
        errorElement.textContent = resolveMessage(problem);
    }

    page.state.resultLocalizers.refresh();
    page.state.modalLocalizers.refresh();
}

function renderActiveFilters(page) {
    const { elements, view } = page;
    const activeFilters = ACTIVE_FILTER_FIELDS
        .map(field => describeActiveFilter(view, field))
        .filter(Boolean);

    elements.activeFilterList.replaceChildren(...activeFilters.map(filter => createFilterChip(page, filter)));
    elements.noActiveFilters.hidden = activeFilters.length > 0;
    elements.filterCount.hidden = activeFilters.length === 0;
    elements.filterCount.textContent = t('search.filters.count', { count: activeFilters.length });
}

function describeActiveFilter(view, field) {
    const control = view.querySelector(`#${field.id}`);
    const label = t(field.labelKey);
    if (field.kind === 'checkbox') {
        return control.checked ? { control, text: label } : null;
    }

    const value = control.value.trim();
    if (value === '') {
        return null;
    }

    const displayValue = field.kind === 'select'
        ? control.selectedOptions[0]?.textContent.trim() ?? value
        : value;
    return { control, text: `${label}: ${displayValue}${field.suffix ?? ''}` };
}

function createFilterChip(page, filter) {
    const chip = createElement('li', { className: 'tc-chip' });
    const removeButton = createElement('button', {
        className: 'tc-chip-remove',
        text: '×',
        attributes: { type: 'button', 'aria-label': t('search.active.remove', { filter: filter.text }) }
    });
    removeButton.addEventListener('click', () => handleRemoveFilter(page, filter.control));
    chip.append(createElement('span', { text: filter.text }), removeButton);
    return chip;
}

function createReleaseCard(page, release) {
    const headingId = `tcRelease-${release.ReleaseId}`;
    const card = createElement('article', {
        className: 'tc-release',
        attributes: { 'aria-labelledby': headingId, 'data-eligible': String(Boolean(release.Eligible)) }
    });

    // refs keeps the language-independent state of the card; render() draws it in the active language.
    const registry = page.state.resultLocalizers;
    const refs = {
        actualSize: null,
        actualSizeBytes: null,
        downloadButton: null,
        feedback: null,
        ui: { feedback: null, downloadState: 'idle', copyState: 'idle' },
        render: null
    };

    const body = createElement('div', { className: 'tc-release-body' });
    const stats = createStatsList(registry, release, refs);
    const footer = createReleaseFooter(page, release, refs);
    const copyButton = createCopyMagnetButton(page, release, refs);
    body.append(
        createReleaseHeading(registry, release, headingId),
        createBadgeList(registry, release),
        createTrackSummary(page, release),
        stats,
        createDetailsPanel(registry, release),
        footer
    );

    refs.render = () => renderReleaseState(refs, release, copyButton);
    registry.run(refs.render);
    page.state.releaseRefs.set(release.ReleaseId, refs);
    card.append(createPosterFrame(release), body, copyButton);
    return card;
}

function createPosterFrame(release) {
    const frame = createElement('div', { className: 'tc-poster' });
    frame.dataset.releaseId = release.ReleaseId;
    frame.dataset.posterState = release.HasPoster ? POSTER_STATE.pending : POSTER_STATE.none;

    const placeholder = createElement('div', { className: 'tc-poster-placeholder', attributes: { 'aria-hidden': 'true' } });
    placeholder.append(createFilmIcon(), createElement('span', {
        className: 'tc-poster-initials',
        text: getTitleInitials(release.Title)
    }));
    frame.append(placeholder);
    return frame;
}

function createFilmIcon() {
    const icon = createSvgElement('svg', {
        class: 'tc-poster-icon',
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false'
    });
    icon.append(
        createSvgElement('rect', {
            x: 3, y: 4, width: 18, height: 16, rx: 2,
            fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5
        }),
        createSvgElement('path', {
            d: 'M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
            fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5
        })
    );
    return icon;
}

function createReleaseHeading(registry, release, headingId) {
    const heading = createElement('header', { className: 'tc-release-heading' });
    const title = createElement('h3', { className: 'tc-release-title', text: release.Title, attributes: { id: headingId } });
    if (Number.isInteger(release.Year)) {
        title.append(' ', createElement('span', { className: 'tc-release-year', text: `(${release.Year})` }));
    }

    heading.append(title);
    if (release.ReleaseName && release.ReleaseName !== release.Title) {
        heading.append(createElement('p', {
            className: 'tc-release-name',
            text: release.ReleaseName,
            attributes: { title: release.ReleaseName }
        }));
    }

    if (release.Source) {
        heading.append(registry.text(
            createElement('p', { className: 'tc-release-source' }),
            () => t('release.source', { source: release.Source })
        ));
    }

    return heading;
}

function createBadgeList(registry, release) {
    const badges = [];
    if (release.Resolution) {
        badges.push({ text: release.Resolution, variant: 'resolution' });
    }

    const codec = formatCodec(release.Codec);
    if (codec) {
        badges.push({ text: codec, variant: 'plain' });
    }

    const hdr = formatHdr(release.Hdr);
    if (hdr) {
        badges.push({ text: hdr, variant: hdr === 'SDR' ? 'plain' : 'hdr' });
    }

    if (release.DolbyVision && hdr !== 'Dolby Vision') {
        badges.push({ text: 'Dolby Vision', variant: 'hdr' });
    }

    if (/\bremux\b/i.test(release.ReleaseName ?? '')) {
        badges.push({ text: 'REMUX', variant: 'plain' });
    }

    if (release.TrueSpec) {
        badges.push({ text: 'TrueSpec ✓', variant: 'verified', labelKey: 'release.badge.trueSpec.label' });
    }

    if (badges.length === 0) {
        badges.push({ textKey: 'release.badge.noVideoMetadata', variant: 'muted' });
    }

    const list = createElement('ul', { className: 'tc-badges' });
    registry.attribute(list, 'aria-label', () => t('release.badges.label'));
    for (const badge of badges) {
        const item = createElement('li', { className: `tc-badge tc-badge-${badge.variant}`, text: badge.text });
        if (badge.textKey) {
            registry.text(item, () => t(badge.textKey));
        }

        if (badge.labelKey) {
            registry.attribute(item, 'aria-label', () => t(badge.labelKey));
        }

        list.append(item);
    }

    return list;
}

function createTrackSummary(page, release) {
    const registry = page.state.resultLocalizers;
    const container = createElement('div', { className: 'tc-tracks' });
    container.append(
        createTrackGroup(registry, {
            titleKey: 'release.tracks.audio',
            entries: collectAudioEntries(release, page.state.preferredAudioKeys),
            sourceKey: LANGUAGE_SOURCE_LABEL_KEYS[release.AudioLanguageSource],
            emptyKey: 'release.tracks.audioEmpty'
        }),
        createTrackGroup(registry, {
            titleKey: 'release.tracks.subtitles',
            entries: collectSubtitleEntries(release, page.state.preferredSubtitleKeys),
            sourceKey: LANGUAGE_SOURCE_LABEL_KEYS[release.SubtitleLanguageSource],
            emptyKey: release.SubtitleLanguageSource === 'TrueSpec' ? 'release.tracks.subtitlesNone' : 'release.tracks.subtitlesEmpty'
        })
    );
    return container;
}

function createTrackGroup(registry, { titleKey, entries, sourceKey, emptyKey }) {
    const group = createElement('div', { className: 'tc-track-group' });
    const heading = createElement('h4', { className: 'tc-track-heading' });
    const titleText = document.createTextNode('');
    registry.run(() => {
        titleText.data = t(titleKey);
    });
    heading.append(titleText);
    if (sourceKey) {
        heading.append(registry.text(createElement('span', { className: 'tc-track-source' }), () => t(sourceKey)));
    }

    group.append(heading);
    if (entries.length === 0) {
        group.append(registry.text(createElement('p', { className: 'tc-track-empty' }), () => t(emptyKey)));
        return group;
    }

    const list = createElement('ul', { className: 'tc-language-list' });
    registry.attribute(list, 'aria-label', () => t(titleKey));
    for (const entry of entries) {
        list.append(createLanguageItem(registry, entry));
    }

    group.append(list);
    return group;
}

function createLanguageItem(registry, entry) {
    const item = createElement('li', { className: 'tc-language-item' });
    item.append(createLanguageIcon(registry, entry.language));
    if (entry.language.displayCode) {
        item.append(createElement('span', {
            className: 'tc-language-code',
            text: entry.language.displayCode,
            attributes: { 'aria-hidden': 'true' }
        }));
    }

    if (entry.channelLayout) {
        item.append(registry.text(
            createElement('span', { className: 'tc-channel-layout' }),
            () => formatChannelLayout(entry.channelCount)
        ));
    }

    return item;
}

function createLanguageIcon(registry, language) {
    const design = language.recognized ? FLAG_DESIGNS[language.code] : null;
    if (!design) {
        const unknown = createElement('span', {
            className: 'tc-language-unknown',
            text: UNKNOWN_LANGUAGE_SYMBOL,
            attributes: { role: 'img' }
        });
        registry.attribute(unknown, 'aria-label', () => language.name);
        registry.attribute(unknown, 'title', () => language.name);
        return unknown;
    }

    const flag = createFlagSvg(design);
    flag.setAttribute('role', 'img');
    registry.attribute(flag, 'aria-label', () => language.name);

    const title = createSvgElement('title');
    registry.text(title, () => language.name);
    flag.prepend(title);
    return flag;
}

function createFlagSvg(design) {
    const flag = createSvgElement('svg', { class: 'tc-flag', viewBox: '0 0 30 20', width: 30, height: 20 });
    switch (design.kind) {
        case 'vertical-stripes':
            appendFlagStripes(flag, design.colors, 'vertical');
            break;
        case 'horizontal-stripes':
            appendFlagStripes(flag, design.colors, 'horizontal');
            break;
        case 'disc':
            flag.append(
                createSvgElement('rect', { width: 30, height: 20, fill: design.background }),
                createSvgElement('circle', { cx: 15, cy: 10, r: 6, fill: design.disc })
            );
            break;
        case 'portugal':
            flag.append(
                createSvgElement('rect', { width: 30, height: 20, fill: '#ff0000' }),
                createSvgElement('rect', { width: 12, height: 20, fill: '#006600' }),
                createSvgElement('circle', { cx: 12, cy: 10, r: 4, fill: '#ffcc00' }),
                createSvgElement('rect', { x: 10.6, y: 8.2, width: 2.8, height: 3.4, rx: 0.6, fill: '#ffffff' })
            );
            break;
        case 'union-jack':
            flag.append(
                createSvgElement('rect', { width: 30, height: 20, fill: '#012169' }),
                createSvgElement('path', { d: 'M0 0L30 20M30 0L0 20', stroke: '#ffffff', 'stroke-width': 4 }),
                createSvgElement('path', { d: 'M0 0L30 20M30 0L0 20', stroke: '#c8102e', 'stroke-width': 1.5 }),
                createSvgElement('path', { d: 'M15 0V20M0 10H30', stroke: '#ffffff', 'stroke-width': 6 }),
                createSvgElement('path', { d: 'M15 0V20M0 10H30', stroke: '#c8102e', 'stroke-width': 3.5 })
            );
            break;
        default:
            break;
    }

    return flag;
}

function appendFlagStripes(flag, colors, direction) {
    const isVertical = direction === 'vertical';
    const stripeSize = (isVertical ? 30 : 20) / colors.length;
    colors.forEach((color, index) => {
        const offset = index * stripeSize;
        // The small overlap hides anti-aliasing seams between stripes.
        const attributes = isVertical
            ? { x: offset, y: 0, width: stripeSize + 0.1, height: 20, fill: color }
            : { x: 0, y: offset, width: 30, height: stripeSize + 0.1, fill: color };
        flag.append(createSvgElement('rect', attributes));
    });
}

function createStatsList(registry, release, refs) {
    const stats = [
        ['release.stat.declaredSize', () => formatBytes(release.SizeBytes)],
        ['release.stat.actualSize', () => (refs.actualSizeBytes > 0 ? formatBytes(refs.actualSizeBytes) : '—')],
        ['release.stat.seeders', () => formatCount(release.Seeders)],
        ['release.stat.leechers', () => formatCount(release.Leechers)],
        ['release.stat.score', () => formatCount(release.CompatibilityScore)]
    ];

    const list = createElement('dl', { className: 'tc-stats' });
    for (const [labelKey, produceValue] of stats) {
        const stat = createElement('div', { className: 'tc-stat' });
        const displayedValue = registry.text(createElement('dd'), produceValue);
        if (labelKey === 'release.stat.actualSize') {
            displayedValue.classList.add('tc-actual-size');
            refs.actualSize = displayedValue;
        }

        stat.append(createElement('dt', { i18n: labelKey }), displayedValue);
        list.append(stat);
    }

    return list;
}

function createDetailsPanel(registry, release) {
    const violations = asArray(release.ConstraintsViolated);
    const warnings = asArray(release.Warnings);
    const issueCount = violations.length + warnings.length;

    const details = createElement('details', { className: 'tc-details' });
    const summary = createElement('summary', { className: 'tc-details-summary' });
    const summaryText = document.createTextNode('');
    registry.run(() => {
        summaryText.data = t('release.details.summary');
    });
    summary.append(summaryText);
    if (issueCount > 0) {
        summary.append(registry.text(
            createElement('span', { className: 'tc-issue-count' }),
            () => t('release.details.issues', { count: issueCount })
        ));
    }

    const content = createElement('div', { className: 'tc-details-content' });
    const addList = (titleKey, produceItems, tone) => appendDetailList(registry, content, titleKey, produceItems, tone);
    addList('release.details.violated', () => violations.map(translateRule), 'danger');
    addList('release.details.warnings', () => warnings.map(translateRule), 'warning');
    addList('release.details.satisfied', () => asArray(release.ConstraintsSatisfied).map(translateRule), 'success');
    addList('release.details.preferences', () => asArray(release.PreferenceMatches).map(translateRule), 'neutral');
    addList('release.details.audioTracks', () => asArray(release.AudioTracks).map(describeAudioTrack), 'neutral');
    addList('release.details.subtitleTracks', () => asArray(release.SubtitleTracks).map(describeSubtitleTrack), 'neutral');
    addList('release.details.scores', () => {
        const scores = [
            t('release.details.compatibility', { value: formatCount(release.CompatibilityScore) }),
            t('release.details.torrentClaw', { value: String(release.TorrentClawScore ?? '—') })
        ];
        if (release.Audio) {
            scores.push(t('release.details.audioCodec', { value: release.Audio }));
        }

        return scores;
    }, 'neutral');
    details.append(summary, content);
    return details;
}

/** The items of a list keep their count in every language, so each one is refreshed in place by position. */
function appendDetailList(registry, container, titleKey, produceItems, tone) {
    const itemCount = produceItems().length;
    if (itemCount === 0) {
        return;
    }

    const section = createElement('div');
    const list = createElement('ul', { className: 'tc-detail-list', attributes: { 'data-tone': tone } });
    for (let index = 0; index < itemCount; index += 1) {
        list.append(createElement('li'));
    }

    registry.run(() => {
        produceItems().forEach((text, index) => {
            list.children[index].textContent = text;
        });
    });
    section.append(createElement('p', { className: 'tc-detail-title', i18n: titleKey }), list);
    container.append(section);
}

function createReleaseFooter(page, release, refs) {
    const footer = createElement('div', { className: 'tc-release-footer' });
    const feedbackId = `tcReleaseFeedback-${release.ReleaseId}`;
    const feedback = createElement('p', {
        className: 'tc-release-feedback',
        attributes: { id: feedbackId, role: 'status', 'aria-live': 'polite' }
    });

    if (!release.Eligible) {
        const violations = asArray(release.ConstraintsViolated);
        refs.ui.feedback = {
            tone: 'danger',
            descriptor: violations.length > 0
                ? message('release.ineligible.reasons', { reasons: () => violations.map(translateRule).join(', ') })
                : message('release.ineligible.generic')
        };
    }

    const button = createElement('button', {
        className: 'emby-button raised button-submit tc-download-button',
        attributes: { type: 'button', 'aria-describedby': feedbackId }
    });
    button.disabled = !release.Eligible;
    button.addEventListener('click', () => openPreflightModal(page, release, refs));

    footer.append(feedback, button);
    refs.feedback = feedback;
    refs.downloadButton = button;
    return footer;
}

function createCopyMagnetButton(page, release, refs) {
    const button = createElement('button', { className: 'tc-copy-magnet-button', attributes: { type: 'button' } });
    button.addEventListener('click', () => handleCopyMagnet(release, button, refs));
    return button;
}

/** Draws the per-release state (feedback, download and copy buttons) in the active language. */
function renderReleaseState(refs, release, copyButton) {
    const { ui } = refs;
    const { feedback } = refs;
    if (ui.feedback) {
        feedback.dataset.tone = ui.feedback.tone;
        const text = resolveMessage(ui.feedback.descriptor);
        if (ui.feedback.link) {
            feedback.replaceChildren(
                createElement('span', { text: `${text} ` }),
                createElement('a', {
                    className: 'tc-feedback-link',
                    text: t(ui.feedback.link.key),
                    attributes: { href: ui.feedback.link.href }
                })
            );
        } else {
            feedback.textContent = text;
        }
    } else {
        feedback.replaceChildren();
        delete feedback.dataset.tone;
    }

    refs.downloadButton.textContent = t(DOWNLOAD_BUTTON_KEYS[ui.downloadState]);
    copyButton.textContent = COPY_BUTTON_SYMBOLS[ui.copyState];
    copyButton.setAttribute('aria-label', t(
        ui.copyState === 'copied' ? 'release.magnet.copied' : 'release.magnet.label',
        { name: release.ReleaseName }
    ));
    copyButton.setAttribute('title', t('release.magnet.title'));
}

/* =============================================================================
 * Poster loading
 * ========================================================================== */

function ensurePosterObserver(page) {
    if (page.state.posterObserver || typeof IntersectionObserver === 'undefined') {
        return;
    }

    page.state.posterObserver = new IntersectionObserver(
        entries => handlePosterVisibility(page, entries),
        { rootMargin: POSTER_PRELOAD_MARGIN }
    );
}

function observePendingPosters(page) {
    const selector = `.tc-poster[data-poster-state="${POSTER_STATE.pending}"]`;
    for (const frame of page.elements.resultList.querySelectorAll(selector)) {
        if (page.state.posterObserver) {
            page.state.posterObserver.observe(frame);
        } else {
            queuePosterLoad(page, frame);
        }
    }
}

function queuePosterLoad(page, frame) {
    frame.dataset.posterState = POSTER_STATE.loading;
    page.state.posterQueue.push(frame);
    drainPosterQueue(page);
}

function drainPosterQueue(page) {
    const { state } = page;
    while (state.activePosterRequests < MAX_PARALLEL_POSTER_REQUESTS && state.posterQueue.length > 0) {
        const frame = state.posterQueue.shift();
        state.activePosterRequests += 1;
        loadPoster(page, frame, state.searchGeneration).finally(() => {
            state.activePosterRequests -= 1;
            drainPosterQueue(page);
        });
    }
}

async function loadPoster(page, frame, searchGeneration) {
    try {
        const blob = await fetchPosterBlob(frame.dataset.releaseId);
        const isStillDisplayed = searchGeneration === page.state.searchGeneration && frame.isConnected;
        if (!isStillDisplayed) {
            return;
        }

        if (!blob) {
            frame.dataset.posterState = POSTER_STATE.failed;
            return;
        }

        const objectUrl = URL.createObjectURL(blob);
        page.state.posterObjectUrls.add(objectUrl);
        showPosterImage(frame, objectUrl);
    } catch {
        // A missing or rejected poster simply keeps the local placeholder.
        frame.dataset.posterState = POSTER_STATE.failed;
    }
}

function showPosterImage(frame, objectUrl) {
    const image = createElement('img', {
        className: 'tc-poster-image',
        attributes: { alt: '', decoding: 'async', loading: 'lazy', width: 300, height: 450 }
    });
    image.addEventListener('load', () => {
        frame.dataset.posterState = POSTER_STATE.loaded;
    }, { once: true });
    image.addEventListener('error', () => {
        image.remove();
        frame.dataset.posterState = POSTER_STATE.failed;
    }, { once: true });
    image.src = objectUrl;
    frame.append(image);
}

function resetPosterLoading(page) {
    const { state } = page;
    state.posterQueue = [];
    state.posterObserver?.disconnect();
    for (const objectUrl of state.posterObjectUrls) {
        URL.revokeObjectURL(objectUrl);
    }

    state.posterObjectUrls.clear();
}

/* =============================================================================
 * Event handlers
 * ========================================================================== */

async function handleSearchSubmit(page, event) {
    event.preventDefault();
    const { elements, state } = page;
    if (!validateSearchForm(page)) {
        return;
    }

    const searchRequest = readSearchRequest(elements);
    state.searchGeneration += 1;
    const searchGeneration = state.searchGeneration;
    state.preferredAudioKeys = parsePreferredLanguageKeys(searchRequest.AudioLanguage, state.configuredAudioLanguage);
    state.preferredSubtitleKeys = parsePreferredLanguageKeys(searchRequest.SubtitleLanguage, state.configuredSubtitleLanguage);

    hideStatus(page);
    clearResults(page);
    setSearchBusy(page, true);
    try {
        const releases = await searchReleases(searchRequest);
        if (searchGeneration === state.searchGeneration) {
            renderResults(page, asArray(releases));
        }
    } catch (error) {
        if (searchGeneration === state.searchGeneration) {
            showStatus(page, describeError(error), 'error');
        }
    } finally {
        if (searchGeneration === state.searchGeneration) {
            setSearchBusy(page, false);
        }
    }
}

async function handleCopyMagnet(release, button, refs) {
    button.disabled = true;
    refs.ui.copyState = 'busy';
    refs.render();
    try {
        const result = await fetchReleaseMagnet(release.ReleaseId);
        const url = typeof result?.Url === 'string' ? result.Url : '';
        if (url === '') {
            throw new RequestError(message('release.magnet.unavailable'), 404);
        }

        await copyToClipboard(url);
        refs.ui.copyState = 'copied';
    } catch (error) {
        refs.ui.copyState = 'idle';
        refs.ui.feedback = { tone: 'danger', descriptor: message('release.magnet.failed', { reason: describeError(error) }) };
    } finally {
        button.disabled = false;
        refs.render();
        window.setTimeout(() => {
            if (button.isConnected) {
                refs.ui.copyState = 'idle';
                refs.render();
            }
        }, 1500);
    }
}

async function copyToClipboard(value) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const fallback = createElement('textarea', {
        className: 'tc-clipboard-fallback',
        attributes: { readonly: 'readonly', 'aria-hidden': 'true' }
    });
    fallback.value = value;
    document.body.append(fallback);
    fallback.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    fallback.remove();
    if (!copied) {
        throw new RequestError(message('release.magnet.noClipboard'), 0);
    }
}

async function openPreflightModal(page, release, refs) {
    if (page.state.activePreflight) {
        showStatus(page, message('preflight.alreadyOpen'), 'warning');
        return;
    }

    const active = {
        release,
        refs,
        modal: null,
        ready: false,
        completed: false,
        result: null,
        status: { descriptor: message('preflight.loading'), tone: 'info' }
    };
    active.modal = createPreflightModal(page, active);
    page.state.activePreflight = active;
    refs.downloadButton.disabled = true;
    refs.downloadButton.setAttribute('aria-busy', 'true');
    refs.ui.downloadState = 'checking';
    refs.ui.feedback = null;
    refs.render();
    page.view.append(active.modal.overlay);
    active.modal.dialog.focus();

    active.modal.cancelButton.addEventListener('click', () => handlePreflightCancel(page, active));
    active.modal.retryButton.addEventListener('click', () => handlePreflightRetry(page, active));
    active.modal.confirmButton.addEventListener('click', () => handlePreflightConfirm(page, active));

    await runPreflight(page, active);
}

function setPreflightStatus(page, active, descriptor, tone) {
    active.status = { descriptor, tone };
    page.state.modalLocalizers.refresh();
}

async function runPreflight(page, active) {
    const { modal, release } = active;
    active.ready = false;
    setPreflightStatus(page, active, message('preflight.loading'), 'info');
    modal.retryButton.hidden = true;
    modal.retryButton.disabled = true;
    modal.cancelButton.disabled = true;
    modal.confirmButton.disabled = true;

    try {
        const result = await startPreflight(release.ReleaseId);
        if (page.state.activePreflight !== active) {
            return;
        }

        renderPreflightResult(page, active, result);
    } catch (error) {
        if (page.state.activePreflight !== active) {
            return;
        }

        setPreflightStatus(page, active, message('preflight.failed', { reason: describeError(error) }), 'danger');
        modal.cancelButton.disabled = false;
        modal.retryButton.hidden = false;
        modal.retryButton.disabled = false;
    }
}

function createPreflightModal(page, active) {
    const { release } = active;
    const registry = page.state.modalLocalizers;
    const titleId = `tcPreflight-${release.ReleaseId}`;
    const overlay = createElement('div', { className: 'tc-preflight-overlay' });
    const dialog = createElement('section', {
        className: 'tc-preflight-modal',
        attributes: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' }
    });
    const title = createElement('h2', { className: 'tc-preflight-title', i18n: 'preflight.title', attributes: { id: titleId } });
    const releaseName = createElement('p', { className: 'tc-preflight-release', text: release.ReleaseName });
    const status = createElement('p', {
        className: 'tc-preflight-status',
        attributes: { role: 'status', 'aria-live': 'polite' }
    });
    registry.run(() => {
        status.textContent = resolveMessage(active.status.descriptor);
        status.dataset.tone = active.status.tone;
    });

    const details = createElement('dl', { className: 'tc-preflight-details' });
    const addDetail = (labelKey, produceValue) => appendPreflightDetail(registry, details, labelKey, produceValue);
    addDetail('preflight.source', () => release.Source || t('common.notSpecified'));
    addDetail('release.stat.seeders', () => formatCount(release.Seeders));
    addDetail('release.stat.leechers', () => formatCount(release.Leechers));
    addDetail('release.stat.declaredSize', () => formatBytes(release.SizeBytes));
    addDetail('release.stat.actualSize', () => (active.result ? formatBytes(active.result.ActualSizeBytes) : '—'));
    addDetail('preflight.limit', () => {
        if (!active.result) {
            return '—';
        }

        return active.result.MaximumSizeBytes ? formatBytes(active.result.MaximumSizeBytes) : t('common.notSet');
    });

    const actions = createElement('div', { className: 'tc-preflight-actions' });
    const cancelButton = createElement('button', {
        className: 'emby-button raised',
        i18n: 'preflight.cancel',
        attributes: { type: 'button', disabled: 'disabled' }
    });
    const retryButton = createElement('button', {
        className: 'emby-button raised',
        i18n: 'preflight.retry',
        attributes: { type: 'button', disabled: 'disabled', hidden: 'hidden' }
    });
    const confirmButton = createElement('button', {
        className: 'emby-button raised button-submit',
        i18n: 'preflight.confirm',
        attributes: { type: 'button', disabled: 'disabled' }
    });
    actions.append(cancelButton, retryButton, confirmButton);
    dialog.append(title, releaseName, status, details, actions);
    overlay.append(dialog);
    return { overlay, dialog, status, cancelButton, retryButton, confirmButton };
}

function appendPreflightDetail(registry, details, labelKey, produceValue) {
    const item = createElement('div', { className: 'tc-preflight-detail' });
    item.append(createElement('dt', { i18n: labelKey }), registry.text(createElement('dd'), produceValue));
    details.append(item);
}

function renderPreflightResult(page, active, result) {
    const { modal } = active;
    active.result = result ?? {};
    updateActualSize(page, active.release.ReleaseId, result?.ActualSizeBytes);

    if (isPreflightReady(result)) {
        active.ready = true;
        setPreflightStatus(page, active, message('preflight.ready'), 'success');
        modal.confirmButton.disabled = false;
        modal.cancelButton.disabled = false;
        return;
    }

    const problem = result?.Message
        ? message('common.text', { text: String(result.Message) })
        : message('preflight.metadataUnavailable');
    setPreflightStatus(page, active, problem, 'danger');
    modal.cancelButton.disabled = false;
    if (isMetadataUnavailable(result)) {
        modal.retryButton.hidden = false;
        modal.retryButton.disabled = false;
    }
}

export function isPreflightReady(result) {
    return result?.Status === 0 || result?.Status === 'Ready';
}

function isMetadataUnavailable(result) {
    return result?.Status === 2 || result?.Status === 'MetadataUnavailable';
}

function updateActualSize(page, releaseId, sizeBytes) {
    const refs = page.state.releaseRefs.get(releaseId);
    if (refs?.actualSize && typeof sizeBytes === 'number' && sizeBytes > 0) {
        refs.actualSizeBytes = sizeBytes;
        refs.actualSize.textContent = formatBytes(sizeBytes);
    }
}

async function handlePreflightConfirm(page, active) {
    if (!active.ready || page.state.activePreflight !== active) {
        return;
    }

    const { modal, refs } = active;
    modal.confirmButton.disabled = true;
    modal.cancelButton.disabled = true;
    setPreflightStatus(page, active, message('preflight.starting'), 'info');
    try {
        await confirmPreflight(active.release.ReleaseId);
        active.completed = true;
        refs.ui.downloadState = 'sent';
        refs.ui.feedback = {
            tone: 'success',
            descriptor: message('release.sent.text'),
            link: { key: 'release.sent.link', href: DOWNLOADS_PAGE_URL }
        };
        refs.render();
        closePreflightModal(page, active, { restoreButton: false });
    } catch (error) {
        setPreflightStatus(page, active, message('preflight.startFailed', { reason: describeError(error) }), 'danger');
        modal.confirmButton.disabled = false;
        modal.cancelButton.disabled = false;
    }
}

async function handlePreflightRetry(page, active) {
    if (page.state.activePreflight !== active || active.ready) {
        return;
    }

    await runPreflight(page, active);
}

async function handlePreflightCancel(page, active) {
    if (page.state.activePreflight !== active) {
        return;
    }

    const { modal } = active;
    modal.cancelButton.disabled = true;
    modal.confirmButton.disabled = true;
    try {
        if (!active.completed) {
            await cancelPreflight(active.release.ReleaseId);
        }

        closePreflightModal(page, active, { restoreButton: true });
    } catch (error) {
        setPreflightStatus(page, active, message('preflight.cancelFailed', { reason: describeError(error) }), 'danger');
        modal.cancelButton.disabled = false;
    }
}

function closePreflightModal(page, active, { restoreButton }) {
    if (page.state.activePreflight !== active) {
        return;
    }

    active.modal.overlay.remove();
    page.state.activePreflight = null;
    page.state.modalLocalizers.clear();
    active.refs.downloadButton.removeAttribute('aria-busy');
    if (restoreButton) {
        active.refs.ui.downloadState = 'idle';
        active.refs.render();
        active.refs.downloadButton.disabled = false;
        active.refs.downloadButton.focus();
    }
}

function handleFormInput(page, event) {
    const { elements } = page;
    const errorByInput = new Map([
        [elements.query, elements.queryError],
        [elements.maxSize, elements.maxSizeError],
        [elements.minSeeders, elements.minSeedersError]
    ]);
    const errorElement = errorByInput.get(event.target);
    if (errorElement) {
        setFieldError(page, event.target, errorElement, null);
    }

    renderActiveFilters(page);
}

function handleRemoveFilter(page, control) {
    if (control.type === 'checkbox') {
        control.checked = false;
    } else {
        control.value = '';
    }

    renderActiveFilters(page);
    page.elements.query.focus();
}

function handlePosterVisibility(page, entries) {
    for (const entry of entries) {
        if (!entry.isIntersecting) {
            continue;
        }

        page.state.posterObserver.unobserve(entry.target);
        queuePosterLoad(page, entry.target);
    }
}

async function loadSearchDefaults(page) {
    const { elements, state } = page;
    try {
        const configuration = await fetchConfiguration();
        state.configuredAudioLanguage = configuration.PreferredAudioLanguage ?? '';
        state.configuredSubtitleLanguage = configuration.PreferredSubtitleLanguage ?? '';
        setSelectValueIfAvailable(elements.resolution, configuration.PreferredResolution ?? '');
        setSelectValueIfAvailable(elements.codec, configuration.PreferredCodec ?? '');
        setSelectValueIfAvailable(elements.hdr, configuration.PreferredHdr ?? '');
        setSelectValueIfAvailable(elements.audioLanguage, state.configuredAudioLanguage);
        setSelectValueIfAvailable(elements.subtitleLanguage, state.configuredSubtitleLanguage);
        elements.maxSize.value = configuration.MaxSizeGb > 0 ? String(configuration.MaxSizeGb) : '';
        elements.minSeeders.value = configuration.MinimumSeeders > 0 ? String(configuration.MinimumSeeders) : '';
        elements.preferRemux.checked = Boolean(configuration.PreferRemux);
        renderActiveFilters(page);
    } catch (error) {
        showStatus(page, message('search.error.defaultsFailed', { reason: describeError(error) }), 'warning');
    }
}

function bindEventHandlers(page) {
    const listenerOptions = { signal: page.state.lifetime.signal };
    page.elements.form.addEventListener('submit', event => handleSearchSubmit(page, event), listenerOptions);
    page.elements.form.addEventListener('input', event => handleFormInput(page, event), listenerOptions);
    page.elements.form.addEventListener('change', () => renderActiveFilters(page), listenerOptions);
}

/* =============================================================================
 * Page lifecycle
 * ========================================================================== */

function handleViewShow(page) {
    ensurePosterObserver(page);
    observePendingPosters(page);
    if (!page.state.defaultsRequested) {
        page.state.defaultsRequested = true;
        loadSearchDefaults(page);
    }
}

function handleViewHide(page) {
    // Posters not yet visible stay "pending" and are observed again on the next viewshow.
    page.state.posterObserver?.disconnect();
}

function handleViewDestroy(page) {
    const active = page.state.activePreflight;
    if (active && !active.completed) {
        active.modal.overlay.remove();
        page.state.activePreflight = null;
        page.state.modalLocalizers.clear();
        void cancelPreflight(active.release.ReleaseId).catch(() => {});
    }

    page.state.searchGeneration += 1;
    resetPosterLoading(page);
    page.state.posterObserver = null;
    page.state.unsubscribeLanguage?.();
    page.state.resultLocalizers.clear();
    page.state.lifetime.abort();
}

function initializePage(view) {
    const page = { view, elements: queryPageElements(view), state: createPageState() };
    const listenerOptions = { signal: page.state.lifetime.signal };

    // Translation runs before any asynchronous rendering. Later language changes only update texts in place.
    translatePage(view);
    bindLanguagePicker(view, { signal: page.state.lifetime.signal });
    page.state.unsubscribeLanguage = onLanguageChange(() => renderLanguage(page));
    bindEventHandlers(page);
    renderActiveFilters(page);
    view.addEventListener('viewshow', () => handleViewShow(page), listenerOptions);
    view.addEventListener('viewhide', () => handleViewHide(page), listenerOptions);
    view.addEventListener('viewdestroy', () => handleViewDestroy(page), { once: true });

    // The view may already be on screen: its "viewshow" event can have fired while the module was loading.
    if (!view.classList.contains('hide')) {
        handleViewShow(page);
    }
}

export default function SearchPageController(view) {
    i18nReady.then(() => initializePage(view));
}
