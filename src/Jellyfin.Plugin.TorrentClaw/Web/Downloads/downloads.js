/*
 * TorrentClaw · Downloads page
 *
 * Jellyfin imports this file as an ES module (data-controller="__plugin/TorrentClawDownloads.js")
 * and creates the default export once for every view instance, passing the page element.
 */

/* =============================================================================
 * Constants
 * ========================================================================== */

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

const DOWNLOAD_STATES = Object.freeze({
    Waiting: { label: 'In attesa di stato', symbol: '…', tone: 'neutral', canPause: false, canResume: false },
    Unknown: { label: 'Stato sconosciuto', symbol: '?', tone: 'neutral', canPause: false, canResume: false },
    Queued: { label: 'In coda', symbol: '⋯', tone: 'info', canPause: true, canResume: false },
    Downloading: { label: 'In download', symbol: '↓', tone: 'active', canPause: true, canResume: false },
    Paused: { label: 'In pausa', symbol: '❚❚', tone: 'neutral', canPause: false, canResume: true },
    Stalled: { label: 'Bloccato', symbol: '!', tone: 'warning', canPause: true, canResume: false },
    Checking: { label: 'In verifica', symbol: '↻', tone: 'info', canPause: false, canResume: false },
    Completed: { label: 'Completato', symbol: '✓', tone: 'success', canPause: false, canResume: false },
    Error: { label: 'Errore', symbol: '✕', tone: 'danger', canPause: false, canResume: true },
    MissingFiles: { label: 'File mancanti', symbol: '✕', tone: 'danger', canPause: false, canResume: true }
});

const CONTENT_TYPE_LABELS = Object.freeze({
    Movie: 'Film',
    Show: 'Serie TV',
    0: 'Film',
    1: 'Serie TV'
});

const ACTION_SUCCESS_MESSAGES = Object.freeze({
    pause: 'Pausa richiesta a qBittorrent. Lo stato si aggiornerà al prossimo controllo del server.',
    resume: 'Ripresa richiesta a qBittorrent. Lo stato si aggiornerà al prossimo controllo del server.',
    remove: 'Torrent rimosso da qBittorrent. I file scaricati sono stati conservati.'
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

    for (const [name, value] of Object.entries(options.attributes ?? {})) {
        element.setAttribute(name, String(value));
    }

    return element;
}

function showStatus(statusElement, message, tone = 'info') {
    statusElement.textContent = message;
    statusElement.dataset.tone = tone;
    statusElement.hidden = false;
}

function hideStatus(statusElement) {
    statusElement.hidden = true;
    statusElement.textContent = '';
}

/* =============================================================================
 * Formatting
 * ========================================================================== */

function formatBytes(bytes) {
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
    const formatted = value.toLocaleString('it-IT', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    return `${formatted} ${units[unitIndex]}`;
}

function formatSpeed(bytesPerSecond) {
    return `${formatBytes(bytesPerSecond)}/s`;
}

function formatPercent(percent) {
    return `${percent.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDuration(totalSeconds) {
    if (totalSeconds < 60) {
        return `${Math.max(1, Math.round(totalSeconds))} s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) {
        return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} h ${minutes % 60} min`;
    }

    return `${Math.floor(hours / 24)} g ${hours % 24} h`;
}

function formatEta(status, stateName) {
    if (!status || stateName !== 'Downloading') {
        return '—';
    }

    const seconds = Number(status.EtaSeconds);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= UNKNOWN_ETA_SECONDS) {
        return 'Non stimabile';
    }

    return formatDuration(seconds);
}

function formatTime(date) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return date.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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

function describeSummary(items) {
    if (items.length === 0) {
        return 'Nessun download monitorato';
    }

    const activeCount = items.filter(item => resolveStateName(item.Status) === 'Downloading').length;
    const totalText = items.length === 1 ? '1 download monitorato' : `${items.length} download monitorati`;
    return `${totalText} · ${activeCount} in corso`;
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
    if (problem?.title && problem?.detail) {
        return `${problem.title}. ${problem.detail}`;
    }

    if (status === 401 || status === 403) {
        return 'Sessione scaduta o permessi insufficienti: accedi di nuovo come amministratore.';
    }

    if (status === 404) {
        return 'Il download non è più monitorato. Aggiorna l\'elenco.';
    }

    if (status >= 500) {
        return 'Il server ha riscontrato un errore imprevisto. Riprova più tardi.';
    }

    return 'La richiesta non è andata a buon fine. Riprova.';
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
            return Promise.reject(new RequestError('Azione non supportata.', 0));
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
        hasLoadError: false
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
    elements.summary.textContent = describeSummary(items);
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
        attributes: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Avanzamento' }
    });
    const progressFill = createElement('div', { className: 'tc-progress-fill' });
    const progressValue = createElement('span', { className: 'tc-progress-value', attributes: { 'aria-hidden': 'true' } });
    progressTrack.append(progressFill);
    progress.append(progressTrack, progressValue);

    const stats = createElement('dl', { className: 'tc-download-stats' });
    const downloadedValue = appendStat(stats, 'Scaricato');
    const speedValue = appendStat(stats, 'Velocità');
    const etaValue = appendStat(stats, 'Tempo stimato');

    const libraryNote = createElement('p', {
        className: 'tc-download-note',
        text: '✓ Aggiornamento della libreria Jellyfin richiesto',
        attributes: { 'data-tone': 'success' }
    });
    const errorNote = createElement('p', { className: 'tc-download-note', attributes: { 'data-tone': 'danger' } });

    const actions = createElement('div', { className: 'tc-download-actions' });
    const pauseButton = createActionButton('Pausa');
    const resumeButton = createActionButton('Riprendi');
    const removeButton = createActionButton('Rimuovi', 'tc-action-danger');
    actions.append(pauseButton, resumeButton, removeButton);

    const confirmation = createElement('div', { className: 'tc-removal-confirmation' });
    const cancelButton = createActionButton('Annulla');
    const confirmButton = createActionButton('Conferma rimozione', 'tc-action-danger-solid');
    confirmation.append(
        createElement('p', {
            className: 'tc-removal-question',
            text: 'Rimuovere il torrent da qBittorrent? I file scaricati restano sul disco.'
        }),
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

function createActionButton(label, extraClassName = '') {
    return createElement('button', {
        className: `emby-button raised tc-action-button ${extraClassName}`.trim(),
        text: label,
        attributes: { type: 'button' }
    });
}

function appendStat(list, label) {
    const stat = createElement('div', { className: 'tc-download-stat' });
    const value = createElement('dd', { text: '—' });
    stat.append(createElement('dt', { text: label }), value);
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
    refs.meta.textContent = `${CONTENT_TYPE_LABELS[item.ContentType] ?? 'Contenuto'} · aggiunto ${formatDateTime(item.CreatedAt)}`;
    refs.badgeSymbol.textContent = descriptor.symbol;
    refs.badgeText.textContent = descriptor.label;

    refs.progressTrack.setAttribute('aria-valuenow', progressPercent.toFixed(1));
    refs.progressTrack.setAttribute('aria-valuetext', `${formatPercent(progressPercent)} completato`);
    refs.progressFill.style.setProperty('--tc-progress', `${progressPercent}%`);
    refs.progressValue.textContent = formatPercent(progressPercent);

    refs.downloadedValue.textContent = status
        ? `${formatBytes(status.DownloadedBytes)} di ${formatBytes(status.TotalBytes)}`
        : '—';
    refs.speedValue.textContent = status ? formatSpeed(status.DownloadSpeed) : '—';
    refs.etaValue.textContent = formatEta(status, stateName);

    refs.libraryNote.hidden = !item.LibraryRefreshRequested;
    refs.errorNote.hidden = !status?.Error;
    refs.errorNote.textContent = status?.Error ? `qBittorrent segnala: ${status.Error}` : '';

    refs.pauseButton.setAttribute('aria-label', `Metti in pausa ${item.ReleaseName}`);
    refs.resumeButton.setAttribute('aria-label', `Riprendi ${item.ReleaseName}`);
    refs.removeButton.setAttribute('aria-label', `Rimuovi ${item.ReleaseName} da qBittorrent`);
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
        elements.lastUpdated.textContent = `Aggiornato alle ${formatTime(new Date())} · aggiornamento automatico ogni ${REFRESH_INTERVAL_MS / 1000} secondi.`;
        if (state.hasLoadError) {
            state.hasLoadError = false;
            hideStatus(elements.status);
        }
    } catch (error) {
        state.hasLoadError = true;
        showStatus(elements.status, `Elenco non aggiornato. ${error.message}`, 'error');
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
    const { elements, state } = page;
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

        showStatus(elements.status, ACTION_SUCCESS_MESSAGES[action], 'success');
    } catch (error) {
        showStatus(elements.status, error.message, 'error');
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
    page.state.lifetime.abort();
    page.state.cards.clear();
}

export default function DownloadsPageController(view) {
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
    page.elements.refreshButton.addEventListener('click', () => handleRefreshClick(page), listenerOptions);
    view.addEventListener('viewshow', () => handleViewShow(page), listenerOptions);
    view.addEventListener('viewhide', () => handleViewHide(page), listenerOptions);
    view.addEventListener('viewdestroy', () => handleViewDestroy(page), { once: true });
}
