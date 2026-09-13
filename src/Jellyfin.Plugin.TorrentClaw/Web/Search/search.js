/*
 * TorrentClaw · Search page
 *
 * Jellyfin imports this file as an ES module (data-controller="__plugin/TorrentClawSearch.js")
 * and creates the default export once for every view instance, passing the page element.
 */

/* =============================================================================
 * Constants
 * ========================================================================== */

const ENDPOINTS = Object.freeze({
    configuration: 'TorrentClaw/Configuration',
    search: 'TorrentClaw/Search',
    downloads: 'TorrentClaw/Downloads',
    posterTemplate: 'TorrentClaw/Search/{releaseId}/Poster'
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

const LANGUAGES = Object.freeze([
    { code: 'it', name: 'Italiano', aliases: ['it', 'ita', 'italian', 'italiano'] },
    { code: 'en', name: 'Inglese', aliases: ['en', 'eng', 'english', 'inglese'] },
    { code: 'es', name: 'Spagnolo', aliases: ['es', 'spa', 'spanish', 'espanol', 'español', 'spagnolo'] },
    { code: 'fr', name: 'Francese', aliases: ['fr', 'fra', 'fre', 'french', 'francais', 'français', 'francese'] },
    { code: 'de', name: 'Tedesco', aliases: ['de', 'deu', 'ger', 'german', 'deutsch', 'tedesco'] },
    { code: 'ja', name: 'Giapponese', aliases: ['ja', 'jpn', 'japanese', 'giapponese'] },
    { code: 'pt', name: 'Portoghese', aliases: ['pt', 'por', 'portuguese', 'portoghese'] },
    { code: 'ru', name: 'Russo', aliases: ['ru', 'rus', 'russian', 'russo'] }
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

const LANGUAGE_SOURCE_LABELS = Object.freeze({
    Metadata: 'da metadati TorrentClaw',
    Inferred: 'dedotto dal nome',
    Unknown: 'non verificato'
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

const RULE_LABELS = Object.freeze({
    'requested audio language': 'lingua audio richiesta',
    'requested audio language (metadata unavailable)': 'lingua audio richiesta (dato assente)',
    'requested subtitle language': 'sottotitoli richiesti',
    'requested subtitle language (metadata unavailable)': 'sottotitoli richiesti (dato assente)',
    'no subtitles': 'nessun sottotitolo',
    'no subtitles (TrueSpec)': 'nessun sottotitolo (TrueSpec)',
    'no subtitles (metadata unavailable)': 'nessun sottotitolo (dato assente)',
    'maximum size': 'dimensione massima',
    'maximum size (metadata unavailable)': 'dimensione massima (dato assente)',
    'minimum seeders': 'seeders minimi',
    'magnet unavailable': 'magnet non disponibile',
    resolution: 'risoluzione',
    codec: 'codec',
    HDR: 'HDR',
    REMUX: 'REMUX',
    'Resolution metadata unavailable': 'Risoluzione non indicata',
    'Size metadata unavailable': 'Dimensione non indicata'
});

const ACTIVE_FILTER_FIELDS = Object.freeze([
    { id: 'tcResolution', label: 'Risoluzione', kind: 'select' },
    { id: 'tcCodec', label: 'Codec', kind: 'select' },
    { id: 'tcHdr', label: 'HDR', kind: 'select' },
    { id: 'tcPreferRemux', label: 'REMUX preferito', kind: 'checkbox' },
    { id: 'tcAudioLanguage', label: 'Audio', kind: 'select' },
    { id: 'tcSubtitleLanguage', label: 'Sottotitoli', kind: 'select' },
    { id: 'tcAudioFormat', label: 'Formato audio', kind: 'text' },
    { id: 'tcMaxSize', label: 'Max', kind: 'text', suffix: ' GB' },
    { id: 'tcMinSeeders', label: 'Seeders ≥', kind: 'text' },
    { id: 'tcVerifiedOnly', label: 'Solo TrueSpec', kind: 'checkbox' }
]);

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

function showStatus(statusElement, message, tone = 'info', link = null) {
    statusElement.replaceChildren(createElement('span', { text: message }));
    if (link) {
        statusElement.append(createElement('a', {
            className: 'tc-status-link',
            text: link.text,
            attributes: { href: link.href }
        }));
    }

    statusElement.dataset.tone = tone;
    statusElement.hidden = false;
}

function hideStatus(statusElement) {
    statusElement.hidden = true;
    statusElement.replaceChildren();
}

function setFieldError(input, errorElement, message) {
    if (message) {
        errorElement.textContent = message;
        errorElement.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        return;
    }

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

function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
        return 'Sconosciuta';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const decimals = unitIndex >= 3 ? 2 : 1;
    const formatted = value.toLocaleString('it-IT', {
        minimumFractionDigits: unitIndex === 0 ? 0 : decimals,
        maximumFractionDigits: unitIndex === 0 ? 0 : decimals
    });
    return `${formatted} ${units[unitIndex]}`;
}

function formatCount(value) {
    return Number.isFinite(value) ? value.toLocaleString('it-IT') : '—';
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

function translateRule(rule) {
    const text = String(rule);
    if (text.startsWith('Threat level:')) {
        return `Livello di rischio: ${text.slice('Threat level:'.length).trim()}`;
    }

    return RULE_LABELS[text] ?? text;
}

/**
 * The single place where language codes and aliases coming from TorrentClaw or TrueSpec are interpreted.
 * Audio and subtitle rendering both rely on it.
 */
export function normalizeLanguage(value) {
    const key = String(value ?? '').trim().toLowerCase();
    if (key === '' || UNKNOWN_LANGUAGE_VALUES.has(key)) {
        return { key: 'unknown', code: null, name: 'Lingua sconosciuta', recognized: false, displayCode: null };
    }

    const primarySubtag = key.split(/[-_]/)[0];
    const language = LANGUAGE_BY_ALIAS.get(key) ?? LANGUAGE_BY_ALIAS.get(primarySubtag);
    if (language) {
        return { key: language.code, code: language.code, name: language.name, recognized: true, displayCode: null };
    }

    const displayCode = key.toUpperCase();
    return {
        key: `other:${key}`,
        code: null,
        name: `Lingua sconosciuta (${displayCode})`,
        recognized: false,
        displayCode
    };
}

export function formatChannelLayout(channels) {
    const count = Number(channels);
    if (!Number.isInteger(count) || count <= 0) {
        return null;
    }

    return CHANNEL_LAYOUTS[count] ?? `${count} canali`;
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
            channelLayout: formatChannelLayout(readTrackValue(track, 'channels'))
        }))
        : asArray(release.AudioLanguages).map(code => ({
            language: normalizeLanguage(code),
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

function describeAudioTrack(track) {
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
        parts.push('predefinita');
    }

    if (title) {
        parts.push(`“${title}”`);
    }

    return parts.join(' · ');
}

function describeSubtitleTrack(track) {
    const parts = [normalizeLanguage(readTrackValue(track, 'lang')).name];
    const codec = readTrackValue(track, 'codec');
    const title = readTrackValue(track, 'title');
    if (codec) {
        parts.push(String(codec));
    }

    if (readTrackValue(track, 'forced')) {
        parts.push('forzati');
    }

    if (readTrackValue(track, 'default')) {
        parts.push('predefiniti');
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
    constructor(message, status) {
        super(message);
        this.name = 'RequestError';
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
        return new RequestError('Impossibile contattare il server Jellyfin. Controlla la connessione e riprova.', 0);
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
        return 'Alcuni valori inviati non sono validi. Controlla i campi e riprova.';
    }

    if (problem?.title && problem?.detail) {
        return `${problem.title}. ${problem.detail}`;
    }

    if (status === 401 || status === 403) {
        return 'Sessione scaduta o permessi insufficienti: accedi di nuovo come amministratore.';
    }

    if (status === 404) {
        return 'Risorsa non trovata. Ripeti la ricerca e riprova.';
    }

    if (status >= 500) {
        return 'Il server ha riscontrato un errore imprevisto. Riprova più tardi.';
    }

    return 'La richiesta non è andata a buon fine. Riprova.';
}

function fetchConfiguration() {
    return requestJson(ENDPOINTS.configuration);
}

function searchReleases(searchRequest) {
    return requestJson(ENDPOINTS.search, { method: 'POST', body: searchRequest });
}

function startDownload(releaseId) {
    return requestJson(ENDPOINTS.downloads, { method: 'POST', body: { ReleaseId: releaseId } });
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
        posterObjectUrls: new Set()
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
        return 'Inserisci un titolo da cercare.';
    }

    if (query.length > MAX_QUERY_LENGTH) {
        return `Il titolo può contenere al massimo ${MAX_QUERY_LENGTH} caratteri.`;
    }

    return null;
}

function getNonNegativeNumberError(rawValue, { integerOnly }) {
    if (rawValue.trim() === '') {
        return null;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
        return 'Inserisci un numero maggiore o uguale a zero.';
    }

    if (integerOnly && !Number.isInteger(value)) {
        return 'Inserisci un numero intero.';
    }

    return null;
}

function validateSearchForm(page) {
    const { elements } = page;
    const checks = [
        { input: elements.query, error: elements.queryError, message: getQueryError(elements.query.value.trim()) },
        {
            input: elements.maxSize,
            error: elements.maxSizeError,
            message: getNonNegativeNumberError(elements.maxSize.value, { integerOnly: false })
        },
        {
            input: elements.minSeeders,
            error: elements.minSeedersError,
            message: getNonNegativeNumberError(elements.minSeeders.value, { integerOnly: true })
        }
    ];

    for (const check of checks) {
        setFieldError(check.input, check.error, check.message);
    }

    const firstInvalid = checks.find(check => check.message);
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
    elements.searchButton.disabled = isBusy;
    elements.searchButtonLabel.textContent = isBusy ? 'Ricerca…' : 'Cerca';
    elements.form.setAttribute('aria-busy', String(isBusy));
    elements.skeletonList.hidden = !isBusy;
}

function clearResults(page) {
    const { elements } = page;
    resetPosterLoading(page);
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
    elements.resultsCount.textContent = describeResultCount(releases);
    observePendingPosters(page);
}

function describeResultCount(releases) {
    const eligibleCount = releases.filter(release => release.Eligible).length;
    const releaseText = releases.length === 1 ? '1 release' : `${releases.length} release`;
    const eligibleText = eligibleCount === 1 ? '1 idonea' : `${eligibleCount} idonee`;
    return `${releaseText} · ${eligibleText}`;
}

function renderActiveFilters(page) {
    const { elements, view } = page;
    const activeFilters = ACTIVE_FILTER_FIELDS
        .map(field => describeActiveFilter(view, field))
        .filter(Boolean);

    elements.activeFilterList.replaceChildren(...activeFilters.map(filter => createFilterChip(page, filter)));
    elements.noActiveFilters.hidden = activeFilters.length > 0;
    elements.filterCount.hidden = activeFilters.length === 0;
    elements.filterCount.textContent = activeFilters.length === 1 ? '1 attivo' : `${activeFilters.length} attivi`;
}

function describeActiveFilter(view, field) {
    const control = view.querySelector(`#${field.id}`);
    if (field.kind === 'checkbox') {
        return control.checked ? { control, text: field.label } : null;
    }

    const value = control.value.trim();
    if (value === '') {
        return null;
    }

    const displayValue = field.kind === 'select'
        ? control.selectedOptions[0]?.textContent.trim() ?? value
        : value;
    return { control, text: `${field.label}: ${displayValue}${field.suffix ?? ''}` };
}

function createFilterChip(page, filter) {
    const chip = createElement('li', { className: 'tc-chip' });
    const removeButton = createElement('button', {
        className: 'tc-chip-remove',
        text: '×',
        attributes: { type: 'button', 'aria-label': `Rimuovi filtro ${filter.text}` }
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

    const body = createElement('div', { className: 'tc-release-body' });
    body.append(
        createReleaseHeading(release, headingId),
        createBadgeList(release),
        createTrackSummary(page, release),
        createStatsList(release),
        createDetailsPanel(release),
        createReleaseFooter(page, release)
    );

    card.append(createPosterFrame(release), body);
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

function createReleaseHeading(release, headingId) {
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
        heading.append(createElement('p', { className: 'tc-release-source', text: `Fonte: ${release.Source}` }));
    }

    return heading;
}

function createBadgeList(release) {
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
        badges.push({ text: 'TrueSpec ✓', variant: 'verified', label: 'Verificata TrueSpec' });
    }

    if (badges.length === 0) {
        badges.push({ text: 'Metadati video non disponibili', variant: 'muted' });
    }

    const list = createElement('ul', { className: 'tc-badges', attributes: { 'aria-label': 'Caratteristiche della release' } });
    for (const badge of badges) {
        const item = createElement('li', { className: `tc-badge tc-badge-${badge.variant}`, text: badge.text });
        if (badge.label) {
            item.setAttribute('aria-label', badge.label);
        }

        list.append(item);
    }

    return list;
}

function createTrackSummary(page, release) {
    const container = createElement('div', { className: 'tc-tracks' });
    container.append(
        createTrackGroup({
            title: 'Audio',
            entries: collectAudioEntries(release, page.state.preferredAudioKeys),
            sourceLabel: LANGUAGE_SOURCE_LABELS[release.AudioLanguageSource],
            emptyText: 'Lingue non indicate'
        }),
        createTrackGroup({
            title: 'Sottotitoli',
            entries: collectSubtitleEntries(release, page.state.preferredSubtitleKeys),
            sourceLabel: LANGUAGE_SOURCE_LABELS[release.SubtitleLanguageSource],
            emptyText: release.SubtitleLanguageSource === 'TrueSpec' ? 'Nessun sottotitolo' : 'Non indicati'
        })
    );
    return container;
}

function createTrackGroup({ title, entries, sourceLabel, emptyText }) {
    const group = createElement('div', { className: 'tc-track-group' });
    const heading = createElement('h4', { className: 'tc-track-heading', text: title });
    if (sourceLabel) {
        heading.append(createElement('span', { className: 'tc-track-source', text: sourceLabel }));
    }

    group.append(heading);
    if (entries.length === 0) {
        group.append(createElement('p', { className: 'tc-track-empty', text: emptyText }));
        return group;
    }

    const list = createElement('ul', { className: 'tc-language-list', attributes: { 'aria-label': title } });
    for (const entry of entries) {
        list.append(createLanguageItem(entry));
    }

    group.append(list);
    return group;
}

function createLanguageItem(entry) {
    const item = createElement('li', { className: 'tc-language-item' });
    item.append(createLanguageIcon(entry.language));
    if (entry.language.displayCode) {
        item.append(createElement('span', {
            className: 'tc-language-code',
            text: entry.language.displayCode,
            attributes: { 'aria-hidden': 'true' }
        }));
    }

    if (entry.channelLayout) {
        item.append(createElement('span', { className: 'tc-channel-layout', text: entry.channelLayout }));
    }

    return item;
}

function createLanguageIcon(language) {
    const design = language.recognized ? FLAG_DESIGNS[language.code] : null;
    if (!design) {
        return createElement('span', {
            className: 'tc-language-unknown',
            text: UNKNOWN_LANGUAGE_SYMBOL,
            attributes: { role: 'img', 'aria-label': language.name, title: language.name }
        });
    }

    const flag = createFlagSvg(design);
    flag.setAttribute('role', 'img');
    flag.setAttribute('aria-label', language.name);

    const title = createSvgElement('title');
    title.textContent = language.name;
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

function createStatsList(release) {
    const stats = [
        ['Dimensione', formatBytes(release.SizeBytes)],
        ['Seeders', formatCount(release.Seeders)],
        ['Leechers', formatCount(release.Leechers)],
        ['Punteggio', formatCount(release.CompatibilityScore)]
    ];

    const list = createElement('dl', { className: 'tc-stats' });
    for (const [label, value] of stats) {
        const stat = createElement('div', { className: 'tc-stat' });
        stat.append(createElement('dt', { text: label }), createElement('dd', { text: value }));
        list.append(stat);
    }

    return list;
}

function createDetailsPanel(release) {
    const violations = asArray(release.ConstraintsViolated);
    const warnings = asArray(release.Warnings);
    const issueCount = violations.length + warnings.length;

    const details = createElement('details', { className: 'tc-details' });
    const summary = createElement('summary', { className: 'tc-details-summary', text: 'Dettagli tecnici' });
    if (issueCount > 0) {
        summary.append(createElement('span', {
            className: 'tc-issue-count',
            text: issueCount === 1 ? '1 segnalazione' : `${issueCount} segnalazioni`
        }));
    }

    const content = createElement('div', { className: 'tc-details-content' });
    appendDetailList(content, 'Vincoli non rispettati', violations.map(translateRule), 'danger');
    appendDetailList(content, 'Avvisi', warnings.map(translateRule), 'warning');
    appendDetailList(content, 'Vincoli rispettati', asArray(release.ConstraintsSatisfied).map(translateRule), 'success');
    appendDetailList(content, 'Preferenze soddisfatte', asArray(release.PreferenceMatches).map(translateRule), 'neutral');
    appendDetailList(content, 'Tracce audio', asArray(release.AudioTracks).map(describeAudioTrack), 'neutral');
    appendDetailList(content, 'Tracce sottotitoli', asArray(release.SubtitleTracks).map(describeSubtitleTrack), 'neutral');

    const scores = [
        `Compatibilità: ${formatCount(release.CompatibilityScore)}`,
        `TorrentClaw: ${release.TorrentClawScore ?? '—'}`
    ];
    if (release.Audio) {
        scores.push(`Codec audio principale: ${release.Audio}`);
    }

    appendDetailList(content, 'Punteggi e formato', scores, 'neutral');
    details.append(summary, content);
    return details;
}

function appendDetailList(container, title, items, tone) {
    if (items.length === 0) {
        return;
    }

    const section = createElement('div');
    const list = createElement('ul', { className: 'tc-detail-list', attributes: { 'data-tone': tone } });
    for (const item of items) {
        list.append(createElement('li', { text: item }));
    }

    section.append(createElement('p', { className: 'tc-detail-title', text: title }), list);
    container.append(section);
}

function createReleaseFooter(page, release) {
    const footer = createElement('div', { className: 'tc-release-footer' });
    const feedbackId = `tcReleaseFeedback-${release.ReleaseId}`;
    const feedback = createElement('p', {
        className: 'tc-release-feedback',
        attributes: { id: feedbackId, role: 'status', 'aria-live': 'polite' }
    });

    if (!release.Eligible) {
        const reasons = asArray(release.ConstraintsViolated).map(translateRule).join(', ');
        feedback.dataset.tone = 'danger';
        feedback.textContent = reasons ? `Non idonea: ${reasons}.` : 'Non idonea ai filtri richiesti.';
    }

    const button = createElement('button', {
        className: 'emby-button raised button-submit tc-download-button',
        text: 'Download',
        attributes: { type: 'button', 'aria-describedby': feedbackId }
    });
    button.disabled = !release.Eligible;
    button.addEventListener('click', () => handleDownloadClick(page, release, button, feedback));

    footer.append(feedback, button);
    return footer;
}

function renderDownloadSent(feedback) {
    feedback.dataset.tone = 'success';
    feedback.replaceChildren(
        createElement('span', { text: 'Inviata a qBittorrent. ' }),
        createElement('a', { className: 'tc-feedback-link', text: 'Apri i download', attributes: { href: DOWNLOADS_PAGE_URL } })
    );
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

    hideStatus(elements.status);
    clearResults(page);
    setSearchBusy(page, true);
    try {
        const releases = await searchReleases(searchRequest);
        if (searchGeneration === state.searchGeneration) {
            renderResults(page, asArray(releases));
        }
    } catch (error) {
        if (searchGeneration === state.searchGeneration) {
            showStatus(elements.status, error.message, 'error');
        }
    } finally {
        if (searchGeneration === state.searchGeneration) {
            setSearchBusy(page, false);
        }
    }
}

async function handleDownloadClick(page, release, button, feedback) {
    button.disabled = true;
    button.textContent = 'Invio…';
    button.setAttribute('aria-busy', 'true');
    delete feedback.dataset.tone;
    feedback.replaceChildren();

    try {
        await startDownload(release.ReleaseId);
        button.textContent = 'Inviata ✓';
        renderDownloadSent(feedback);
    } catch (error) {
        button.disabled = false;
        button.textContent = 'Download';
        feedback.dataset.tone = 'danger';
        feedback.textContent = error.message;
    } finally {
        button.removeAttribute('aria-busy');
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
        setFieldError(event.target, errorElement, null);
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
        showStatus(elements.status, `Filtri predefiniti non caricati. ${error.message}`, 'warning');
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
    page.state.searchGeneration += 1;
    resetPosterLoading(page);
    page.state.posterObserver = null;
    page.state.lifetime.abort();
}

export default function SearchPageController(view) {
    const page = { view, elements: queryPageElements(view), state: createPageState() };
    const listenerOptions = { signal: page.state.lifetime.signal };

    bindEventHandlers(page);
    renderActiveFilters(page);
    view.addEventListener('viewshow', () => handleViewShow(page), listenerOptions);
    view.addEventListener('viewhide', () => handleViewHide(page), listenerOptions);
    view.addEventListener('viewdestroy', () => handleViewDestroy(page), { once: true });
}
