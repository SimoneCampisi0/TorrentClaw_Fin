/*
 * TorrentClaw · Downloads page
 *
 * Jellyfin imports this file as an ES module (data-controller="__plugin/TorrentClawDownloads.js")
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
const getLocale = (...args) => i18n.getLocale(...args);
const message = (...args) => i18n.message(...args);
const onLanguageChange = (...args) => i18n.onLanguageChange(...args);
const resolveMessage = (...args) => i18n.resolveMessage(...args);
const t = (...args) => i18n.t(...args);
const translatePage = (...args) => i18n.translatePage(...args);

const ENDPOINTS = Object.freeze({
    downloads: 'TorrentClaw/Downloads',
    pauseTemplate: 'TorrentClaw/Downloads/{id}/Pause',
    resumeTemplate: 'TorrentClaw/Downloads/{id}/Resume',
    // The plugin never asks qBittorrent to delete downloaded files.
    removeTemplate: 'TorrentClaw/Downloads/{id}?deleteFiles=false'
});

const REFRESH_INTERVAL_MS = 10000;

// qBittorrent reports 8640000 seconds (100 days) when the remaining time cannot be estimated.
const UNKNOWN_ETA_SECONDS = 8640000;

const STATE_NAMES_BY_INDEX = Object.freeze([
    'Unknown',
    'Queued',
    'Downloading',
    'Paused',
    'Stalled',
    'Checking',
    'Completed',
    'Error',
    'MissingFiles'
]);

// States are stable data; their labels ("downloads.state.<name>") are resolved when rendered.
const DOWNLOAD_STATES = Object.freeze({
    Waiting: { symbol: '…', tone: 'neutral', canPause: false, canResume: false },
    Unknown: { symbol: '?', tone: 'neutral', canPause: false, canResume: false },
    Queued: { symbol: '⋯', tone: 'info', canPause: true, canResume: false },
    Downloading: { symbol: '↓', tone: 'active', canPause: true, canResume: false },
    Paused: { symbol: '❚❚', tone: 'neutral', canPause: false, canResume: true },
    Stalled: { symbol: '!', tone: 'warning', canPause: true, canResume: false },
    Checking: { symbol: '↻', tone: 'info', canPause: false, canResume: false },
    Completed: { symbol: '✓', tone: 'success', canPause: false, canResume: false },
    Error: { symbol: '✕', tone: 'danger', canPause: false, canResume: true },
    MissingFiles: { symbol: '✕', tone: 'danger', canPause: false, canResume: true }
});

const CONTENT_TYPE_LABEL_KEYS = Object.freeze({
    Movie: 'downloads.type.movie',
    Show: 'downloads.type.show',
    0: 'downloads.type.movie',
    1: 'downloads.type.show'
});

const ACTION_SUCCESS_KEYS = Object.freeze({
    pause: 'downloads.action.pauseDone',
    resume: 'downloads.action.resumeDone',
    remove: 'downloads.action.removeDone'
});

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

    for (const [name, key] of Object.entries(options.i18nAttributes ?? {})) {
        element.setAttribute(name, t(key));
        element.setAttribute('data-i18n-attr', `${name}:${key}`);
    }

    for (const [name, value] of Object.entries(options.attributes ?? {})) {
        element.setAttribute(name, String(value));
    }

    return element;
}

function renderStatus(page) {
    const { elements, state } = page;
    if (!state.status) {
        elements.status.hidden = true;
        elements.status.textContent = '';
        return;
    }

    elements.status.textContent = resolveMessage(state.status.descriptor);
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

/* =============================================================================
 * Formatting
 * ========================================================================== */

export function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
        return '—';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const decimals = unitIndex === 0 ? 0 : unitIndex >= 3 ? 2 : 1;
    const formatted = value.toLocaleString(getLocale(), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    return `${formatted} ${units[unitIndex]}`;
}

function formatSpeed(bytesPerSecond) {
    return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatPercent(percent) {
    return `${percent.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function formatDuration(totalSeconds) {
    if (totalSeconds < 60) {
        return t('downloads.duration.seconds', { n: Math.max(1, Math.round(totalSeconds)) });
    }

    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) {
        return t('downloads.duration.minutes', { n: minutes });
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return t('downloads.duration.hours', { h: hours, m: minutes % 60 });
    }

    return t('downloads.duration.days', { d: Math.floor(hours / 24), h: hours % 24 });
}

function formatEta(status, stateName) {
    if (!status || stateName !== 'Downloading') {
        return '—';
    }

    const seconds = Number(status.EtaSeconds);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= UNKNOWN_ETA_SECONDS) {
        return t('downloads.card.etaUnknown');
    }

    return formatDuration(seconds);
}

function formatTime(date) {
    return date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return date.toLocaleString(getLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function resolveStateName(status) {
    if (!status) {
        return 'Waiting';
    }

    const rawState = status.State;
    if (typeof rawState === 'number') {
        return STATE_NAMES_BY_INDEX[rawState] ?? 'Unknown';
    }

    return Object.hasOwn(DOWNLOAD_STATES, rawState) ? rawState : 'Unknown';
}

/** Label of a download state in the active UI language. */
export function getStateLabel(stateName) {
    return t(`downloads.state.${Object.hasOwn(DOWNLOAD_STATES, stateName) ? stateName : 'Unknown'}`);
}

function describeSummary(items) {
    if (items === null) {
        return message('downloads.summary.loading');
    }

    if (items.length === 0) {
        return message('downloads.summary.none');
    }

    const activeCount = items.filter(item => resolveStateName(item.Status) === 'Downloading').length;
    return message('downloads.summary.withActive', {
        total: message('downloads.summary.total', { count: items.length }),
        active: activeCount
    });
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

async function requestJson(path, { method = 'GET' } = {}) {
    const apiClient = getApiClient();
    try {
        return await apiClient.ajax({ type: method, url: apiClient.getUrl(path), dataType: 'json' });
    } catch (failure) {
        throw await toRequestError(failure);
    }
}

async function requestWithoutContent(path, { method }) {
    const apiClient = getApiClient();
    try {
        await apiClient.ajax({ type: method, url: apiClient.getUrl(path) });
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
    if (problem?.title && problem?.detail) {
        return message('common.reason', { title: problem.title, detail: problem.detail });
    }

    if (status === 401 || status === 403) {
        return message('error.unauthorized');
    }

    if (status === 404) {
        return message('downloads.error.notFound');
    }

    if (status >= 500) {
        return message('error.server');
    }

    return message('error.generic');
}

function fetchDownloads() {
    return requestJson(ENDPOINTS.downloads);
}

function sendDownloadAction(downloadId, action) {
    const encodedId = encodeURIComponent(downloadId);
    switch (action) {
        case 'pause':
            return requestWithoutContent(ENDPOINTS.pauseTemplate.replace('{id}', encodedId), { method: 'POST' });
        case 'resume':
            return requestWithoutContent(ENDPOINTS.resumeTemplate.replace('{id}', encodedId), { method: 'POST' });
        case 'remove':
            return requestWithoutContent(ENDPOINTS.removeTemplate.replace('{id}', encodedId), { method: 'DELETE' });
        default:
            return Promise.reject(new RequestError(message('downloads.action.unsupported'), 0));
    }
}

/* =============================================================================
 * Polling
 * ========================================================================== */

/**
 * Runs onTick immediately and then every intervalMs, never overlapping two ticks and never keeping more
 * than one timer. Ticks pause while the browser tab is hidden and stop completely after stop().
 */
export function createPollingController({ intervalMs, onTick, timers = globalThis, visibility = globalThis.document }) {
    let running = false;
    let tickInProgress = false;
    let timerId = null;

    function isDocumentVisible() {
        return !visibility || visibility.visibilityState !== 'hidden';
    }

    function clearScheduledTick() {
        if (timerId !== null) {
            timers.clearTimeout(timerId);
            timerId = null;
        }
    }

    function scheduleNextTick() {
        clearScheduledTick();
        if (running && isDocumentVisible()) {
            timerId = timers.setTimeout(runTick, intervalMs);
        }
    }

    // The first load and manual refreshes ignore visibility, so data is ready when the tab is shown;
    // only the periodic timer is suspended while the document is hidden.
    async function runTick({ ignoreVisibility = false } = {}) {
        clearScheduledTick();
        if (!running || tickInProgress || (!ignoreVisibility && !isDocumentVisible())) {
            return;
        }

        tickInProgress = true;
        try {
            await onTick();
        } catch {
            // onTick reports its own errors; polling must survive a failed refresh.
        } finally {
            tickInProgress = false;
            scheduleNextTick();
        }
    }

    function handleVisibilityChange() {
        if (!running) {
            return;
        }

        if (isDocumentVisible()) {
            runTick();
        } else {
            clearScheduledTick();
        }
    }

    return {
        start() {
            if (running) {
                return;
            }

            running = true;
            visibility?.addEventListener('visibilitychange', handleVisibilityChange);
            runTick({ ignoreVisibility: true });
        },

        stop() {
            running = false;
            clearScheduledTick();
            visibility?.removeEventListener('visibilitychange', handleVisibilityChange);
        },

        refreshNow() {
            return runTick({ ignoreVisibility: true });
        },

        get isRunning() {
            return running;
        },

        get hasScheduledTick() {
            return timerId !== null;
        }
    };
}

/* =============================================================================
 * Page state
 * ========================================================================== */

function queryPageElements(view) {
    const find = id => view.querySelector(`#${id}`);
    return {
        summary: find('tcDownloadSummary'),
        lastUpdated: find('tcLastUpdated'),
        refreshButton: find('tcRefreshButton'),
        status: find('tcDownloadStatus'),
        loadingState: find('tcLoadingState'),
        downloadList: find('tcDownloadList'),
        emptyState: find('tcEmptyState')
    };
}

function createPageState() {
    return {
        lifetime: new AbortController(),
        cards: new Map(),
        busyDownloadIds: new Set(),
        pendingRemovalId: null,
        hasLoadError: false,
        // Language-independent state, kept so the visible texts can be rendered again when the language changes.
        items: null,
        lastUpdatedAt: null,
        status: null,
        unsubscribeLanguage: null
    };
}

/* =============================================================================
 * Rendering functions
 * ========================================================================== */

function renderDownloads(page, items) {
    const { elements, state } = page;
    const currentIds = new Set(items.map(item => item.Id));

    for (const [downloadId, card] of state.cards) {
        if (!currentIds.has(downloadId)) {
            card.root.remove();
            state.cards.delete(downloadId);
            state.busyDownloadIds.delete(downloadId);
            if (state.pendingRemovalId === downloadId) {
                state.pendingRemovalId = null;
            }
        }
    }

    items.forEach((item, index) => {
        let card = state.cards.get(item.Id);
        if (!card) {
            card = createDownloadCard(page, item.Id);
            state.cards.set(item.Id, card);
        }

        card.item = item;
        updateDownloadCard(page, card);

        // Existing cards are only moved when the order changes, so focus and open confirmations survive refreshes.
        const nodeAtPosition = elements.downloadList.children[index] ?? null;
        if (nodeAtPosition !== card.root) {
            elements.downloadList.insertBefore(card.root, nodeAtPosition);
        }
    });

    elements.emptyState.hidden = items.length > 0;
    state.items = items;
    renderSummary(page);
}

function renderSummary(page) {
    page.elements.summary.textContent = resolveMessage(describeSummary(page.state.items));
}

function renderLastUpdated(page) {
    const { lastUpdatedAt } = page.state;
    const seconds = REFRESH_INTERVAL_MS / 1000;
    page.elements.lastUpdated.textContent = lastUpdatedAt
        ? t('downloads.toolbar.updated', { time: formatTime(lastUpdatedAt), seconds })
        : t('downloads.toolbar.autoRefresh', { seconds });
}

/** Refreshes every text that is not covered by data-i18n markers, without rebuilding any card. */
function renderLanguage(page) {
    translatePage(page.view);
    renderSummary(page);
    renderLastUpdated(page);
    renderStatus(page);
    for (const card of page.state.cards.values()) {
        if (card.item) {
            updateDownloadCard(page, card);
        }
    }
}

function createDownloadCard(page, downloadId) {
    const titleId = `tcDownload-${downloadId}`;
    const root = createElement('article', { className: 'tc-download', attributes: { 'aria-labelledby': titleId } });

    const header = createElement('header', { className: 'tc-download-header' });
    const heading = createElement('div', { className: 'tc-download-heading' });
    const title = createElement('h3', { className: 'tc-download-title', attributes: { id: titleId } });
    const meta = createElement('p', { className: 'tc-download-meta' });
    heading.append(title, meta);

    const badge = createElement('span', { className: 'tc-state-badge' });
    const badgeSymbol = createElement('span', { attributes: { 'aria-hidden': 'true' } });
    const badgeText = createElement('span');
    badge.append(badgeSymbol, badgeText);
    header.append(heading, badge);

    const progress = createElement('div', { className: 'tc-progress' });
    const progressTrack = createElement('div', {
        className: 'tc-progress-track',
        i18nAttributes: { 'aria-label': 'downloads.card.progress' },
        attributes: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }
    });
    const progressFill = createElement('div', { className: 'tc-progress-fill' });
    const progressValue = createElement('span', { className: 'tc-progress-value', attributes: { 'aria-hidden': 'true' } });
    progressTrack.append(progressFill);
    progress.append(progressTrack, progressValue);

    const stats = createElement('dl', { className: 'tc-download-stats' });
    const downloadedValue = appendStat(stats, 'downloads.card.downloaded');
    const speedValue = appendStat(stats, 'downloads.card.speed');
    const etaValue = appendStat(stats, 'downloads.card.eta');

    const libraryNote = createElement('p', {
        className: 'tc-download-note',
        i18n: 'downloads.card.libraryRefresh',
        attributes: { 'data-tone': 'success' }
    });
    const errorNote = createElement('p', { className: 'tc-download-note', attributes: { 'data-tone': 'danger' } });

    const actions = createElement('div', { className: 'tc-download-actions' });
    const pauseButton = createActionButton('downloads.action.pause');
    const resumeButton = createActionButton('downloads.action.resume');
    const removeButton = createActionButton('downloads.action.remove', 'tc-action-danger');
    actions.append(pauseButton, resumeButton, removeButton);

    const confirmation = createElement('div', { className: 'tc-removal-confirmation' });
    const cancelButton = createActionButton('downloads.action.cancel');
    const confirmButton = createActionButton('downloads.action.confirmRemoval', 'tc-action-danger-solid');
    confirmation.append(
        createElement('p', { className: 'tc-removal-question', i18n: 'downloads.action.removalQuestion' }),
        cancelButton,
        confirmButton
    );

    const listenerOptions = { signal: page.state.lifetime.signal };
    pauseButton.addEventListener('click', () => handleDownloadAction(page, downloadId, 'pause'), listenerOptions);
    resumeButton.addEventListener('click', () => handleDownloadAction(page, downloadId, 'resume'), listenerOptions);
    removeButton.addEventListener('click', () => handleRemoveRequest(page, downloadId), listenerOptions);
    cancelButton.addEventListener('click', () => handleRemoveCancel(page, downloadId), listenerOptions);
    confirmButton.addEventListener('click', () => handleDownloadAction(page, downloadId, 'remove'), listenerOptions);

    root.append(header, progress, stats, libraryNote, errorNote, actions, confirmation);
    return {
        root,
        item: null,
        refs: {
            title,
            meta,
            badgeSymbol,
            badgeText,
            progressTrack,
            progressFill,
            progressValue,
            downloadedValue,
            speedValue,
            etaValue,
            libraryNote,
            errorNote,
            actions,
            pauseButton,
            resumeButton,
            removeButton,
            confirmation,
            confirmButton
        }
    };
}

function createActionButton(labelKey, extraClassName = '') {
    return createElement('button', {
        className: `emby-button raised tc-action-button ${extraClassName}`.trim(),
        i18n: labelKey,
        attributes: { type: 'button' }
    });
}

function appendStat(list, labelKey) {
    const stat = createElement('div', { className: 'tc-download-stat' });
    const value = createElement('dd', { text: '—' });
    stat.append(createElement('dt', { i18n: labelKey }), value);
    list.append(stat);
    return value;
}

function updateDownloadCard(page, card) {
    const { item, refs } = card;
    const status = item.Status ?? null;
    const stateName = resolveStateName(status);
    const descriptor = DOWNLOAD_STATES[stateName];
    const progressPercent = Math.min(100, Math.max(0, Number(status?.Progress ?? 0) * 100));

    card.root.dataset.state = stateName;
    card.root.dataset.tone = descriptor.tone;
    refs.title.textContent = item.ReleaseName;
    refs.meta.textContent = t('downloads.card.meta', {
        type: t(CONTENT_TYPE_LABEL_KEYS[item.ContentType] ?? 'downloads.type.other'),
        date: formatDateTime(item.CreatedAt)
    });
    refs.badgeSymbol.textContent = descriptor.symbol;
    refs.badgeText.textContent = getStateLabel(stateName);

    refs.progressTrack.setAttribute('aria-valuenow', progressPercent.toFixed(1));
    refs.progressTrack.setAttribute('aria-valuetext', t('downloads.card.progressText', { percent: formatPercent(progressPercent) }));
    refs.progressFill.style.setProperty('--tc-progress', `${progressPercent}%`);
    refs.progressValue.textContent = formatPercent(progressPercent);

    refs.downloadedValue.textContent = status
        ? t('downloads.card.downloadedOf', { done: formatBytes(status.DownloadedBytes), total: formatBytes(status.TotalBytes) })
        : '—';
    refs.speedValue.textContent = status ? formatSpeed(status.DownloadSpeed) : '—';
    refs.etaValue.textContent = formatEta(status, stateName);

    refs.libraryNote.hidden = !item.LibraryRefreshRequested;
    refs.errorNote.hidden = !status?.Error;
    refs.errorNote.textContent = status?.Error ? t('downloads.card.clientError', { error: status.Error }) : '';

    refs.pauseButton.setAttribute('aria-label', t('downloads.action.pauseLabel', { name: item.ReleaseName }));
    refs.resumeButton.setAttribute('aria-label', t('downloads.action.resumeLabel', { name: item.ReleaseName }));
    refs.removeButton.setAttribute('aria-label', t('downloads.action.removeLabel', { name: item.ReleaseName }));
    updateCardActions(page, card);
}

function updateCardActions(page, card) {
    const { state } = page;
    const downloadId = card.item.Id;
    const descriptor = DOWNLOAD_STATES[resolveStateName(card.item.Status)];
    const isBusy = state.busyDownloadIds.has(downloadId);
    const isConfirmingRemoval = state.pendingRemovalId === downloadId;

    card.refs.pauseButton.disabled = isBusy || !descriptor.canPause;
    card.refs.resumeButton.disabled = isBusy || !descriptor.canResume;
    card.refs.removeButton.disabled = isBusy;
    card.refs.confirmButton.disabled = isBusy;
    card.refs.actions.hidden = isConfirmingRemoval;
    card.refs.confirmation.hidden = !isConfirmingRemoval;
}

function refreshCardActions(page, downloadId) {
    const card = page.state.cards.get(downloadId);
    if (card?.item) {
        updateCardActions(page, card);
    }
}

/* =============================================================================
 * Event handlers
 * ========================================================================== */

async function refreshDownloads(page) {
    const { elements, state } = page;
    try {
        const items = await fetchDownloads();
        renderDownloads(page, Array.isArray(items) ? items : []);
        state.lastUpdatedAt = new Date();
        renderLastUpdated(page);
        if (state.hasLoadError) {
            state.hasLoadError = false;
            hideStatus(page);
        }
    } catch (error) {
        state.hasLoadError = true;
        showStatus(page, message('downloads.error.listFailed', { reason: describeError(error) }), 'error');
    } finally {
        elements.loadingState.hidden = true;
    }
}

async function handleRefreshClick(page) {
    const { refreshButton } = page.elements;
    refreshButton.disabled = true;
    try {
        await page.poller.refreshNow();
    } finally {
        refreshButton.disabled = false;
    }
}

async function handleDownloadAction(page, downloadId, action) {
    const { state } = page;
    if (state.busyDownloadIds.has(downloadId)) {
        return;
    }

    state.busyDownloadIds.add(downloadId);
    refreshCardActions(page, downloadId);
    try {
        await sendDownloadAction(downloadId, action);
        if (action === 'remove') {
            state.pendingRemovalId = null;
        }

        showStatus(page, message(ACTION_SUCCESS_KEYS[action]), 'success');
    } catch (error) {
        showStatus(page, describeError(error), 'error');
    } finally {
        state.busyDownloadIds.delete(downloadId);
        refreshCardActions(page, downloadId);
    }

    await page.poller.refreshNow();
}

function handleRemoveRequest(page, downloadId) {
    const { state } = page;
    const previousId = state.pendingRemovalId;
    state.pendingRemovalId = downloadId;
    if (previousId !== null && previousId !== downloadId) {
        refreshCardActions(page, previousId);
    }

    refreshCardActions(page, downloadId);
    state.cards.get(downloadId)?.refs.confirmButton.focus();
}

function handleRemoveCancel(page, downloadId) {
    page.state.pendingRemovalId = null;
    refreshCardActions(page, downloadId);
    page.state.cards.get(downloadId)?.refs.removeButton.focus();
}

/* =============================================================================
 * Page lifecycle
 * ========================================================================== */

function handleViewShow(page) {
    page.poller.start();
}

function handleViewHide(page) {
    page.poller.stop();
    if (page.state.pendingRemovalId !== null) {
        const pendingId = page.state.pendingRemovalId;
        page.state.pendingRemovalId = null;
        refreshCardActions(page, pendingId);
    }
}

function handleViewDestroy(page) {
    page.poller.stop();
    page.state.unsubscribeLanguage?.();
    page.state.lifetime.abort();
    page.state.cards.clear();
}

function initializePage(view) {
    const page = {
        view,
        elements: queryPageElements(view),
        state: createPageState(),
        poller: null
    };
    page.poller = createPollingController({
        intervalMs: REFRESH_INTERVAL_MS,
        onTick: () => refreshDownloads(page)
    });

    const listenerOptions = { signal: page.state.lifetime.signal };
    // Translation runs before the first (asynchronous) render; later changes only update texts in place.
    renderLanguage(page);
    bindLanguagePicker(view, { signal: page.state.lifetime.signal });
    page.state.unsubscribeLanguage = onLanguageChange(() => renderLanguage(page));
    page.elements.refreshButton.addEventListener('click', () => handleRefreshClick(page), listenerOptions);
    view.addEventListener('viewshow', () => handleViewShow(page), listenerOptions);
    view.addEventListener('viewhide', () => handleViewHide(page), listenerOptions);
    view.addEventListener('viewdestroy', () => handleViewDestroy(page), { once: true });

    // The view may already be on screen: its "viewshow" event can have fired while the module was loading.
    if (!view.classList.contains('hide')) {
        handleViewShow(page);
    }
}

export default function DownloadsPageController(view) {
    i18nReady.then(() => initializePage(view));
}
