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

const SECRET_LABELS = Object.freeze({
    apiKey: {
        configured: 'Chiave salvata',
        missing: 'Nessuna chiave salvata',
        keepPlaceholder: 'Lascia vuoto per mantenere la chiave salvata',
        newPlaceholder: 'Incolla la API key TorrentClaw'
    },
    password: {
        configured: 'Password salvata',
        missing: 'Nessuna password salvata',
        keepPlaceholder: 'Lascia vuoto per mantenerla',
        newPlaceholder: 'Password della WebUI'
    }
});

const CONNECTION_RESULTS = Object.freeze({
    Connected: { text: 'Connessione riuscita', tone: 'success' },
    InvalidApiKey: { text: 'API key non valida', tone: 'error' },
    Unauthorized: { text: 'Credenziali non autorizzate', tone: 'error' },
    ServiceUnavailable: { text: 'Servizio non raggiungibile', tone: 'error' },
    Timeout: { text: 'Tempo scaduto', tone: 'error' },
    ConfigurationError: { text: 'Configurazione non valida', tone: 'error' }
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

function showStatus(statusElement, message, tone) {
    statusElement.textContent = message;
    statusElement.dataset.tone = tone;
    statusElement.hidden = false;
}

function getControl(page, rule) {
    return page.view.querySelector(`#${rule.id}`);
}

function getErrorElement(page, rule) {
    return page.view.querySelector(`#${rule.id}Error`);
}

function setFieldError(page, rule, message) {
    const control = getControl(page, rule);
    const errorElement = getErrorElement(page, rule);
    if (message) {
        control.setAttribute('aria-invalid', 'true');
    } else {
        control.removeAttribute('aria-invalid');
    }

    if (errorElement) {
        errorElement.textContent = message ?? '';
        errorElement.hidden = !message;
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
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* =============================================================================
 * Validation
 * ========================================================================== */

export function getUrlError(rawValue, { required, httpsOnly }) {
    const value = rawValue.trim();
    if (value === '') {
        return required ? 'Campo obbligatorio.' : null;
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        return 'Inserisci un URL completo, ad esempio https://esempio.it';
    }

    const allowedProtocols = httpsOnly ? ['https:'] : ['http:', 'https:'];
    if (!allowedProtocols.includes(url.protocol)) {
        return httpsOnly ? 'È consentito solo HTTPS.' : 'Usa un indirizzo HTTP o HTTPS.';
    }

    if (url.username || url.password) {
        return 'Non inserire credenziali nell\'URL: usa i campi dedicati.';
    }

    return null;
}

export function getNumberError(rawValue, { min, max, integerOnly, allowEmpty }) {
    const value = rawValue.trim();
    if (value === '') {
        return allowEmpty ? null : 'Campo obbligatorio.';
    }

    const number = Number(value);
    if (!Number.isFinite(number) || (integerOnly && !Number.isInteger(number))) {
        return integerOnly ? 'Inserisci un numero intero.' : 'Inserisci un numero.';
    }

    if (min !== undefined && number < min) {
        return max === undefined ? `Il valore minimo è ${min}.` : `Inserisci un valore tra ${min} e ${max}.`;
    }

    if (max !== undefined && number > max) {
        return `Inserisci un valore tra ${min} e ${max}.`;
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
        const message = validateField(page, rule);
        setFieldError(page, rule, message);
        if (message && !firstInvalidControl) {
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
        return 'Alcuni valori non sono validi. Controlla i campi e riprova.';
    }

    if (problem?.title && problem?.detail) {
        return `${problem.title}. ${problem.detail}`;
    }

    if (status === 401 || status === 403) {
        return 'Sessione scaduta o permessi insufficienti: accedi di nuovo come amministratore.';
    }

    if (status >= 500) {
        return 'Il server ha riscontrato un errore imprevisto. Riprova più tardi.';
    }

    return 'La richiesta non è andata a buon fine. Riprova.';
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
        hasUnsavedChanges: false
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

    renderSecretState(page.elements.apiKeyState, page.elements.apiKeyInput, configuration.TorrentClawApiKeyConfigured, SECRET_LABELS.apiKey);
    renderSecretState(page.elements.passwordState, page.elements.passwordInput, configuration.QbittorrentPasswordConfigured, SECRET_LABELS.password);
}

function renderSecretState(stateElement, input, isConfigured, labels) {
    stateElement.dataset.configured = String(Boolean(isConfigured));
    stateElement.textContent = isConfigured ? labels.configured : labels.missing;
    input.placeholder = isConfigured ? labels.keepPlaceholder : labels.newPlaceholder;
}

function renderSaveState(page, message, tone) {
    showStatus(page.elements.saveState, message, tone);
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
        return { text: 'Risultato della verifica non riconosciuto', tone: 'error' };
    }

    if (result.Status === 'ConfigurationError' && result.Message) {
        return { text: `${knownResult.text}: ${result.Message}`, tone: knownResult.tone };
    }

    return knownResult;
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
        renderSaveState(page, 'Impostazioni caricate.', 'info');
    } catch (error) {
        renderSaveState(page, `Impostazioni non caricate. ${error.message}`, 'error');
    } finally {
        setBusy(page, false);
    }
}

async function saveSettings(page) {
    if (!validateForm(page)) {
        renderSaveState(page, 'Correggi i campi evidenziati prima di salvare.', 'error');
        return false;
    }

    try {
        await saveConfiguration(readConfigurationUpdate(page));
        fillForm(page, await fetchConfiguration());
        page.state.hasUnsavedChanges = false;
        renderSaveState(page, `Impostazioni salvate alle ${formatTime(new Date())}.`, 'success');
        return true;
    } catch (error) {
        renderSaveState(page, error.message, 'error');
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
    showStatus(resultElement, 'Salvataggio e verifica in corso', 'loading');
    try {
        const saved = await saveSettings(page);
        if (!saved) {
            showStatus(resultElement, 'Verifica non eseguita: impostazioni non salvate', 'error');
            return;
        }

        const outcome = describeConnectionResult(await testConnection(endpoint));
        showStatus(resultElement, outcome.text, outcome.tone);
    } catch (error) {
        showStatus(resultElement, error.message, 'error');
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
        renderSaveState(page, 'Modifiche non salvate', 'pending');
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
    page.state.lifetime.abort();
}

export default function SettingsPageController(view) {
    const page = { view, elements: queryPageElements(view), state: createPageState() };
    const listenerOptions = { signal: page.state.lifetime.signal };

    bindEventHandlers(page);
    view.addEventListener('viewshow', () => handleViewShow(page), listenerOptions);
    view.addEventListener('viewhide', () => handleViewHide(page), listenerOptions);
    view.addEventListener('viewdestroy', () => handleViewDestroy(page), { once: true });
}
