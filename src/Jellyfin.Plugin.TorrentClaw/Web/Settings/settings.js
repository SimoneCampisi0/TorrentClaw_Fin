/*
 * TorrentClaw · Settings page
 *
 * Jellyfin imports this file as an ES module (data-controller="__plugin/TorrentClawSettings.js")
 * and creates the default export once for every view instance, passing the page element.
 *
 * Secret values are write-only: the API only reports whether they are configured, the inputs start empty,
 * an empty input keeps the stored value, and the inputs are cleared again whenever the page is hidden.
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
const translatePage = (...args) => i18n.translatePage(...args);

const ENDPOINTS = Object.freeze({
    configuration: 'TorrentClaw/Configuration',
    testTorrentClaw: 'TorrentClaw/Connections/TorrentClaw/Test',
    testQbittorrent: 'TorrentClaw/Connections/Qbittorrent/Test'
});

/*
 * One entry per form control. Limits mirror ConfigurationMapper on the server, so a value accepted here
 * is stored unchanged instead of being silently clamped.
 */
const FIELD_RULES = Object.freeze([
    { id: 'tcTorrentClawUrl', property: 'TorrentClawBaseUrl', type: 'url', required: true, httpsOnly: true },
    { id: 'tcTorrentClawApiKey', property: 'TorrentClawApiKey', type: 'secret' },
    { id: 'tcTorrentClawTimeout', property: 'TorrentClawTimeoutSeconds', type: 'integer', min: 1, max: 120 },
    { id: 'tcTorrentClawRetries', property: 'TorrentClawMaxRetries', type: 'integer', min: 0, max: 3 },
    { id: 'tcQbittorrentUrl', property: 'QbittorrentBaseUrl', type: 'url', required: true, httpsOnly: false },
    { id: 'tcQbittorrentUsername', property: 'QbittorrentUsername', type: 'text' },
    { id: 'tcQbittorrentPassword', property: 'QbittorrentPassword', type: 'secret' },
    { id: 'tcQbittorrentCategory', property: 'QbittorrentCategory', type: 'text' },
    { id: 'tcQbittorrentTimeout', property: 'QbittorrentTimeoutSeconds', type: 'integer', min: 1, max: 120 },
    { id: 'tcMoviePath', property: 'MovieSavePath', type: 'text' },
    { id: 'tcTvPath', property: 'TvSavePath', type: 'text' },
    { id: 'tcDownloadPath', property: 'DownloadDirectory', type: 'text' },
    { id: 'tcPreferredResolution', property: 'PreferredResolution', type: 'select' },
    { id: 'tcPreferredCodec', property: 'PreferredCodec', type: 'select' },
    { id: 'tcPreferredHdr', property: 'PreferredHdr', type: 'select' },
    { id: 'tcPreferredAudioLanguage', property: 'PreferredAudioLanguage', type: 'select' },
    { id: 'tcPreferredSubtitleLanguage', property: 'PreferredSubtitleLanguage', type: 'select' },
    { id: 'tcMaxSize', property: 'MaxSizeGb', type: 'decimal', min: 0 },
    { id: 'tcMinSeeders', property: 'MinimumSeeders', type: 'integer', min: 0 },
    { id: 'tcPollSeconds', property: 'DownloadPollSeconds', type: 'integer', min: 10, max: 300 },
    { id: 'tcPreferRemux', property: 'PreferRemux', type: 'checkbox' }
]);

// Labels are dictionary keys: they are resolved when rendered, so they follow the active UI language.
const SECRET_LABEL_KEYS = Object.freeze({
    apiKey: {
        configured: 'settings.apiKey.configured',
        missing: 'settings.apiKey.missing',
        keepPlaceholder: 'settings.apiKey.placeholder.keep',
        newPlaceholder: 'settings.apiKey.placeholder.new'
    },
    password: {
        configured: 'settings.qbittorrent.password.configured',
        missing: 'settings.qbittorrent.password.missing',
        keepPlaceholder: 'settings.qbittorrent.password.placeholder.keep',
        newPlaceholder: 'settings.qbittorrent.password.placeholder.new'
    }
});

const CONNECTION_RESULTS = Object.freeze({
    Connected: { key: 'settings.connection.Connected', tone: 'success' },
    InvalidApiKey: { key: 'settings.connection.InvalidApiKey', tone: 'error' },
    Unauthorized: { key: 'settings.connection.Unauthorized', tone: 'error' },
    ServiceUnavailable: { key: 'settings.connection.ServiceUnavailable', tone: 'error' },
    Timeout: { key: 'settings.connection.Timeout', tone: 'error' },
    ConfigurationError: { key: 'settings.connection.ConfigurationError', tone: 'error' }
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

function renderStatus(statusElement, status) {
    statusElement.textContent = resolveMessage(status.descriptor);
    if (status.tone) {
        statusElement.dataset.tone = status.tone;
        statusElement.hidden = false;
    }
}

/** Shows a message that is kept as a descriptor, so it can be shown again in another language. */
function showStatus(page, statusElement, descriptor, tone) {
    const status = { descriptor, tone };
    page.state.statuses.set(statusElement, status);
    renderStatus(statusElement, status);
}

/** Message shown for a failed request; anything that is not a RequestError gets a generic text. */
function describeError(error) {
    return error?.descriptor ?? message('error.generic');
}

function getControl(page, rule) {
    return page.view.querySelector(`#${rule.id}`);
}

function getErrorElement(page, rule) {
    return page.view.querySelector(`#${rule.id}Error`);
}

function setFieldError(page, rule, problem) {
    const control = getControl(page, rule);
    const errorElement = getErrorElement(page, rule);
    if (problem) {
        page.state.fieldErrors.set(rule.id, problem);
        control.setAttribute('aria-invalid', 'true');
    } else {
        page.state.fieldErrors.delete(rule.id);
        control.removeAttribute('aria-invalid');
    }

    if (errorElement) {
        errorElement.textContent = resolveMessage(problem);
        errorElement.hidden = !problem;
    }
}

/** Keeps values saved by older versions selectable even when they are not in the predefined list. */
function setSelectValue(select, value) {
    const normalizedValue = value ?? '';
    const hasOption = Array.from(select.options).some(option => option.value === normalizedValue);
    if (!hasOption) {
        select.append(createElement('option', { text: normalizedValue, attributes: { value: normalizedValue } }));
    }

    select.value = normalizedValue;
}

function formatTime(date) {
    return date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
}

/* =============================================================================
 * Validation
 * ========================================================================== */

/** Validation results are message descriptors (or null when the value is valid), resolved when displayed. */
export function getUrlError(rawValue, { required, httpsOnly }) {
    const value = rawValue.trim();
    if (value === '') {
        return required ? message('validation.required') : null;
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        return message('validation.url.full');
    }

    const allowedProtocols = httpsOnly ? ['https:'] : ['http:', 'https:'];
    if (!allowedProtocols.includes(url.protocol)) {
        return message(httpsOnly ? 'validation.url.httpsOnly' : 'validation.url.httpOrHttps');
    }

    if (url.username || url.password) {
        return message('validation.url.credentials');
    }

    return null;
}

export function getNumberError(rawValue, { min, max, integerOnly, allowEmpty }) {
    const value = rawValue.trim();
    if (value === '') {
        return allowEmpty ? null : message('validation.required');
    }

    const number = Number(value);
    if (!Number.isFinite(number) || (integerOnly && !Number.isInteger(number))) {
        return message(integerOnly ? 'validation.integer' : 'validation.number');
    }

    if (min !== undefined && number < min) {
        return max === undefined ? message('validation.min', { min }) : message('validation.range', { min, max });
    }

    if (max !== undefined && number > max) {
        return message('validation.range', { min, max });
    }

    return null;
}

function validateField(page, rule) {
    const control = getControl(page, rule);
    switch (rule.type) {
        case 'url':
            return getUrlError(control.value, rule);
        case 'integer':
            return getNumberError(control.value, { ...rule, integerOnly: true, allowEmpty: false });
        case 'decimal':
            return getNumberError(control.value, { ...rule, integerOnly: false, allowEmpty: true });
        default:
            return null;
    }
}

function validateForm(page) {
    let firstInvalidControl = null;
    for (const rule of FIELD_RULES) {
        const problem = validateField(page, rule);
        setFieldError(page, rule, problem);
        if (problem && !firstInvalidControl) {
            firstInvalidControl = getControl(page, rule);
        }
    }

    firstInvalidControl?.focus();
    return firstInvalidControl === null;
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

async function requestWithoutContent(path, { method, body }) {
    const apiClient = getApiClient();
    try {
        await apiClient.ajax({
            type: method,
            url: apiClient.getUrl(path),
            contentType: 'application/json',
            data: JSON.stringify(body)
        });
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
        return message('settings.error.validation');
    }

    if (problem?.title && problem?.detail) {
        return message('common.reason', { title: problem.title, detail: problem.detail });
    }

    if (status === 401 || status === 403) {
        return message('error.unauthorized');
    }

    if (status >= 500) {
        return message('error.server');
    }

    return message('error.generic');
}

function fetchConfiguration() {
    return requestJson(ENDPOINTS.configuration);
}

function saveConfiguration(configurationUpdate) {
    return requestWithoutContent(ENDPOINTS.configuration, { method: 'POST', body: configurationUpdate });
}

function testConnection(endpoint) {
    return requestJson(endpoint, { method: 'POST' });
}

/* =============================================================================
 * Page state
 * ========================================================================== */

function queryPageElements(view) {
    const find = id => view.querySelector(`#${id}`);
    return {
        form: find('tcSettingsForm'),
        apiKeyInput: find('tcTorrentClawApiKey'),
        apiKeyState: find('tcApiKeyState'),
        passwordInput: find('tcQbittorrentPassword'),
        passwordState: find('tcPasswordState'),
        testTorrentClawButton: find('tcTestTorrentClaw'),
        torrentClawResult: find('tcTorrentClawResult'),
        testQbittorrentButton: find('tcTestQbittorrent'),
        qbittorrentResult: find('tcQbittorrentResult'),
        saveButton: find('tcSaveButton'),
        saveState: find('tcSaveState')
    };
}

function createPageState() {
    return {
        lifetime: new AbortController(),
        isBusy: false,
        hasUnsavedChanges: false,
        // Language-independent state, kept so the visible texts can be rendered again when the language changes.
        fieldErrors: new Map(),
        statuses: new Map(),
        secretStates: { apiKey: false, password: false },
        unsubscribeLanguage: null
    };
}

function readConfigurationUpdate(page) {
    const update = {};
    for (const rule of FIELD_RULES) {
        const control = getControl(page, rule);
        switch (rule.type) {
            case 'checkbox':
                update[rule.property] = control.checked;
                break;
            case 'secret':
                // null tells the server to keep the stored secret.
                update[rule.property] = control.value.trim() === '' ? null : control.value;
                break;
            case 'integer':
                update[rule.property] = Number.parseInt(control.value, 10);
                break;
            case 'decimal':
                update[rule.property] = control.value.trim() === '' ? 0 : Number(control.value);
                break;
            default:
                update[rule.property] = control.value.trim();
                break;
        }
    }

    return update;
}

/* =============================================================================
 * Rendering functions
 * ========================================================================== */

function fillForm(page, configuration) {
    for (const rule of FIELD_RULES) {
        const control = getControl(page, rule);
        switch (rule.type) {
            case 'checkbox':
                control.checked = Boolean(configuration[rule.property]);
                break;
            case 'secret':
                control.value = '';
                break;
            case 'select':
                setSelectValue(control, configuration[rule.property]);
                break;
            default:
                control.value = configuration[rule.property] ?? '';
                break;
        }

        setFieldError(page, rule, null);
    }

    page.state.secretStates.apiKey = Boolean(configuration.TorrentClawApiKeyConfigured);
    page.state.secretStates.password = Boolean(configuration.QbittorrentPasswordConfigured);
    renderSecretStates(page);
}

function renderSecretStates(page) {
    const { elements, state } = page;
    renderSecretState(elements.apiKeyState, elements.apiKeyInput, state.secretStates.apiKey, SECRET_LABEL_KEYS.apiKey);
    renderSecretState(elements.passwordState, elements.passwordInput, state.secretStates.password, SECRET_LABEL_KEYS.password);
}

function renderSecretState(stateElement, input, isConfigured, labelKeys) {
    stateElement.dataset.configured = String(isConfigured);
    stateElement.textContent = resolveMessage(message(isConfigured ? labelKeys.configured : labelKeys.missing));
    input.placeholder = resolveMessage(message(isConfigured ? labelKeys.keepPlaceholder : labelKeys.newPlaceholder));
}

function renderSaveState(page, descriptor, tone) {
    showStatus(page, page.elements.saveState, descriptor, tone);
}

/** Refreshes every text that is not covered by the data-i18n markers of the HTML. */
function renderLanguage(page) {
    translatePage(page.view);
    renderSecretStates(page);
    for (const rule of FIELD_RULES) {
        const errorElement = getErrorElement(page, rule);
        if (errorElement) {
            errorElement.textContent = resolveMessage(page.state.fieldErrors.get(rule.id));
        }
    }

    for (const [statusElement, status] of page.state.statuses) {
        renderStatus(statusElement, status);
    }
}

function setBusy(page, isBusy) {
    const { elements, state } = page;
    state.isBusy = isBusy;
    elements.saveButton.disabled = isBusy;
    elements.testTorrentClawButton.disabled = isBusy;
    elements.testQbittorrentButton.disabled = isBusy;
    elements.form.setAttribute('aria-busy', String(isBusy));
}

function clearSecretInputs(page) {
    page.elements.apiKeyInput.value = '';
    page.elements.passwordInput.value = '';
}

function describeConnectionResult(result) {
    const knownResult = CONNECTION_RESULTS[result?.Status];
    if (!knownResult) {
        return { descriptor: message('settings.connection.unrecognised'), tone: 'error' };
    }

    if (result.Status === 'ConfigurationError' && result.Message) {
        return {
            descriptor: message('settings.connection.ConfigurationErrorWithMessage', { message: String(result.Message) }),
            tone: knownResult.tone
        };
    }

    return { descriptor: message(knownResult.key), tone: knownResult.tone };
}

/* =============================================================================
 * Event handlers
 * ========================================================================== */

async function loadSettings(page) {
    setBusy(page, true);
    try {
        const configuration = await fetchConfiguration();
        fillForm(page, configuration);
        page.state.hasUnsavedChanges = false;
        renderSaveState(page, message('settings.status.loaded'), 'info');
    } catch (error) {
        renderSaveState(page, message('settings.status.loadFailed', { reason: describeError(error) }), 'error');
    } finally {
        setBusy(page, false);
    }
}

async function saveSettings(page) {
    if (!validateForm(page)) {
        renderSaveState(page, message('settings.status.fixFields'), 'error');
        return false;
    }

    try {
        await saveConfiguration(readConfigurationUpdate(page));
        fillForm(page, await fetchConfiguration());
        page.state.hasUnsavedChanges = false;
        const savedAt = new Date();
        renderSaveState(page, message('settings.status.saved', { time: () => formatTime(savedAt) }), 'success');
        return true;
    } catch (error) {
        renderSaveState(page, describeError(error), 'error');
        return false;
    }
}

async function handleSubmit(page, event) {
    event.preventDefault();
    if (page.state.isBusy) {
        return;
    }

    setBusy(page, true);
    try {
        await saveSettings(page);
    } finally {
        setBusy(page, false);
    }
}

async function handleConnectionTest(page, { endpoint, resultElement }) {
    if (page.state.isBusy) {
        return;
    }

    setBusy(page, true);
    showStatus(page, resultElement, message('settings.status.testing'), 'loading');
    try {
        const saved = await saveSettings(page);
        if (!saved) {
            showStatus(page, resultElement, message('settings.status.testSkipped'), 'error');
            return;
        }

        const outcome = describeConnectionResult(await testConnection(endpoint));
        showStatus(page, resultElement, outcome.descriptor, outcome.tone);
    } catch (error) {
        showStatus(page, resultElement, describeError(error), 'error');
    } finally {
        setBusy(page, false);
    }
}

function handleFormEdit(page, event) {
    const rule = FIELD_RULES.find(candidate => candidate.id === event.target.id);
    if (rule) {
        setFieldError(page, rule, null);
    }

    if (!page.state.hasUnsavedChanges) {
        page.state.hasUnsavedChanges = true;
        renderSaveState(page, message('settings.status.unsaved'), 'pending');
    }
}

function bindEventHandlers(page) {
    const { elements } = page;
    const listenerOptions = { signal: page.state.lifetime.signal };
    elements.form.addEventListener('submit', event => handleSubmit(page, event), listenerOptions);
    elements.form.addEventListener('input', event => handleFormEdit(page, event), listenerOptions);
    elements.form.addEventListener('change', event => handleFormEdit(page, event), listenerOptions);
    elements.testTorrentClawButton.addEventListener('click', () => handleConnectionTest(page, {
        endpoint: ENDPOINTS.testTorrentClaw,
        resultElement: elements.torrentClawResult
    }), listenerOptions);
    elements.testQbittorrentButton.addEventListener('click', () => handleConnectionTest(page, {
        endpoint: ENDPOINTS.testQbittorrent,
        resultElement: elements.qbittorrentResult
    }), listenerOptions);
}

/* =============================================================================
 * Page lifecycle
 * ========================================================================== */

function handleViewShow(page) {
    if (!page.state.hasUnsavedChanges) {
        loadSettings(page);
    }
}

function handleViewHide(page) {
    clearSecretInputs(page);
}

function handleViewDestroy(page) {
    clearSecretInputs(page);
    page.state.unsubscribeLanguage?.();
    page.state.lifetime.abort();
}

function initializePage(view) {
    const page = { view, elements: queryPageElements(view), state: createPageState() };
    const listenerOptions = { signal: page.state.lifetime.signal };

    // Translation runs before any asynchronous rendering. Later language changes only update texts in place.
    page.state.statuses.set(page.elements.saveState, { descriptor: message('settings.save.loading') });
    renderLanguage(page);
    bindLanguagePicker(view, { signal: page.state.lifetime.signal });
    page.state.unsubscribeLanguage = onLanguageChange(() => renderLanguage(page));
    bindEventHandlers(page);
    view.addEventListener('viewshow', () => handleViewShow(page), listenerOptions);
    view.addEventListener('viewhide', () => handleViewHide(page), listenerOptions);
    view.addEventListener('viewdestroy', () => handleViewDestroy(page), { once: true });

    // The view may already be on screen: its "viewshow" event can have fired while the module was loading.
    if (!view.classList.contains('hide')) {
        handleViewShow(page);
    }
}

export default function SettingsPageController(view) {
    i18nReady.then(() => initializePage(view));
}
