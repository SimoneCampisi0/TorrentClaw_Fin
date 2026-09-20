import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    DEFAULT_LANGUAGE,
    LANGUAGE_STORAGE_KEY,
    SUPPORTED_LANGUAGES,
    TRANSLATIONS,
    createI18n,
    createLocalizerRegistry,
    message
} from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Shared/torrentclaw-i18n.js';

function createFakeStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value)),
        values
    };
}

function createInstance(initial) {
    const storage = createFakeStorage(initial);
    return { storage, i18n: createI18n({ getStorage: () => storage }) };
}

test('exactly two languages are supported, with their flag and formatting locale', () => {
    assert.deepEqual(
        SUPPORTED_LANGUAGES.map(language => [language.code, language.locale, language.flag]),
        [['en', 'en-GB', '🇬🇧'], ['it', 'it-IT', '🇮🇹']]
    );
    assert.ok(Object.isFrozen(SUPPORTED_LANGUAGES));
    assert.ok(SUPPORTED_LANGUAGES.every(language => Object.isFrozen(language)));
    assert.equal(DEFAULT_LANGUAGE, 'en');
    assert.deepEqual(Object.keys(TRANSLATIONS), ['en', 'it']);
});

test('English is the language when nothing is stored', () => {
    const { i18n } = createInstance();

    assert.equal(i18n.getLanguage(), 'en');
    assert.equal(i18n.getLocale(), 'en-GB');
    assert.equal(i18n.t('nav.search'), 'Search');
});

test('a stored language is used, with the matching locale', () => {
    const { i18n } = createInstance({ [LANGUAGE_STORAGE_KEY]: 'it' });

    assert.equal(i18n.getLanguage(), 'it');
    assert.equal(i18n.getLocale(), 'it-IT');
    assert.equal(i18n.t('nav.search'), 'Cerca');
});

test('an unknown stored language falls back to English', () => {
    for (const stored of ['fr', '', 'IT', 'it-IT', '{}']) {
        const { i18n } = createInstance({ [LANGUAGE_STORAGE_KEY]: stored });
        assert.equal(i18n.getLanguage(), 'en', stored);
    }
});

test('an unavailable or failing storage falls back to English and still lets the user choose', () => {
    const throwingStorage = {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('blocked'); }
    };
    for (const getStorage of [() => null, () => throwingStorage, () => { throw new Error('SecurityError'); }]) {
        const i18n = createI18n({ getStorage });
        assert.equal(i18n.getLanguage(), 'en');
        assert.equal(i18n.setLanguage('it'), true);
        assert.equal(i18n.getLanguage(), 'it');
        assert.equal(i18n.getLocale(), 'it-IT');
    }
});

test('the explicit choice is stored under the namespaced key and survives a new instance', () => {
    const { storage, i18n } = createInstance();

    i18n.setLanguage('it');

    assert.equal(LANGUAGE_STORAGE_KEY, 'torrentclaw.ui-language');
    assert.equal(storage.values.get(LANGUAGE_STORAGE_KEY), 'it');
    assert.equal(createI18n({ getStorage: () => storage }).getLanguage(), 'it');
});

test('unsupported codes are rejected without changing the language', () => {
    const { storage, i18n } = createInstance();

    assert.equal(i18n.setLanguage('fr'), false);
    assert.equal(i18n.setLanguage(undefined), false);
    assert.equal(i18n.getLanguage(), 'en');
    assert.equal(storage.values.size, 0);
});

test('listeners are notified only when the language really changes, and can unsubscribe', () => {
    const { i18n } = createInstance();
    const received = [];
    const unsubscribe = i18n.onLanguageChange(code => received.push(code));

    i18n.setLanguage('en');
    i18n.setLanguage('it');
    i18n.setLanguage('it');
    unsubscribe();
    i18n.setLanguage('en');

    assert.deepEqual(received, ['it']);
});

test('lookup interpolates parameters and formats numbers with the active locale', () => {
    const { i18n } = createInstance();

    assert.equal(i18n.t('validation.range', { min: 1, max: 120 }), 'Enter a value between 1 and 120.');
    assert.equal(i18n.t('search.error.query.tooLong', { max: 12000 }), 'The title can contain at most 12,000 characters.');
    i18n.setLanguage('it');
    assert.equal(i18n.t('validation.range', { min: 1, max: 120 }), 'Inserisci un valore tra 1 e 120.');
    assert.equal(i18n.t('search.error.query.tooLong', { max: 12000 }), 'Il titolo può contenere al massimo 12.000 caratteri.');
});

test('missing parameters keep their placeholder, and functions or nested messages are resolved lazily', () => {
    const { i18n } = createInstance();

    assert.equal(i18n.t('validation.min'), 'The minimum value is {min}.');
    const nested = message('downloads.summary.total', { count: 2 });
    assert.equal(i18n.t('downloads.summary.withActive', { total: nested, active: () => 1 }), '2 monitored downloads · 1 in progress');
    i18n.setLanguage('it');
    assert.equal(i18n.t('downloads.summary.withActive', { total: nested, active: () => 1 }), '2 download monitorati · 1 in corso');
});

test('plural forms follow the count in both languages', () => {
    const { i18n } = createInstance();

    assert.equal(i18n.t('search.results.releases', { count: 1 }), '1 release');
    assert.equal(i18n.t('search.results.releases', { count: 3 }), '3 releases');
    assert.equal(i18n.t('search.results.eligible', { count: 0 }), '0 eligible');
    i18n.setLanguage('it');
    assert.equal(i18n.t('search.results.eligible', { count: 1 }), '1 idonea');
    assert.equal(i18n.t('search.results.eligible', { count: 2 }), '2 idonee');
});

test('a key missing in the selected language falls back to English, and a key missing everywhere to itself', () => {
    const translations = { en: { 'only.english': 'English text', 'both': 'Both' }, it: { both: 'Entrambi' } };
    const i18n = createI18n({ getStorage: () => createFakeStorage({ [LANGUAGE_STORAGE_KEY]: 'it' }), translations });

    assert.equal(i18n.t('both'), 'Entrambi');
    assert.equal(i18n.t('only.english'), 'English text');
    assert.equal(i18n.t('does.not.exist'), 'does.not.exist');
});

test('resolveMessage renders a descriptor in the active language and ignores anything else', () => {
    const { i18n } = createInstance();
    const descriptor = message('validation.required');

    assert.equal(i18n.resolveMessage(descriptor), 'This field is required.');
    i18n.setLanguage('it');
    assert.equal(i18n.resolveMessage(descriptor), 'Campo obbligatorio.');
    assert.equal(i18n.resolveMessage(null), '');
});

test('both dictionaries define exactly the same keys and placeholders', () => {
    const placeholdersOf = value => [...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

    assert.deepEqual(Object.keys(TRANSLATIONS.it).sort(), Object.keys(TRANSLATIONS.en).sort());
    for (const [key, english] of Object.entries(TRANSLATIONS.en)) {
        const italian = TRANSLATIONS.it[key];
        assert.equal(typeof italian, typeof english, key);
        assert.deepEqual(placeholdersOf(italian), placeholdersOf(english), key);
        if (typeof english === 'object') {
            assert.deepEqual(Object.keys(italian).sort(), Object.keys(english).sort(), key);
        }
    }
});

test('translateTree updates marked text and attributes without touching anything else', () => {
    const element = (attributes, extra = {}) => ({
        textContent: 'untouched',
        attributes: { ...attributes },
        getAttribute(name) { return this.attributes[name] ?? null; },
        setAttribute(name, value) { this.attributes[name] = value; },
        ...extra
    });
    const heading = element({ 'data-i18n': 'settings.title' });
    const input = element({ 'data-i18n-attr': 'placeholder:search.filters.audioFormatPlaceholder;title:language.it' });
    const plain = element({});
    const root = element({}, { querySelectorAll: () => [heading, input] });
    const { i18n } = createInstance();

    i18n.translateTree(root);
    assert.equal(heading.textContent, 'Settings');
    assert.equal(input.attributes.title, 'Italian');
    assert.equal(plain.textContent, 'untouched');
    assert.equal(root.attributes.lang, 'en');

    i18n.setLanguage('it');
    i18n.translateTree(root);
    assert.equal(heading.textContent, 'Impostazioni');
    assert.equal(input.attributes.title, 'Italiano');
    assert.equal(root.attributes.lang, 'it');
});

test('the localizer registry refreshes registered texts and attributes in place', () => {
    const { i18n } = createInstance();
    const element = { textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    const registry = createLocalizerRegistry();

    registry.text(element, () => i18n.t('nav.settings'));
    registry.attribute(element, 'aria-label', () => i18n.t('nav.label'));
    assert.equal(element.textContent, 'Settings');
    assert.equal(element.attributes['aria-label'], 'TorrentClaw pages');

    i18n.setLanguage('it');
    registry.refresh();
    assert.equal(element.textContent, 'Impostazioni');
    assert.equal(element.attributes['aria-label'], 'Pagine TorrentClaw');

    registry.clear();
    i18n.setLanguage('en');
    registry.refresh();
    assert.equal(element.textContent, 'Impostazioni');
});
