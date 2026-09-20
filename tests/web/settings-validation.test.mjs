import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getNumberError, getUrlError, i18nReady } from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Settings/settings.js';
import { resolveMessage, setLanguage } from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Shared/torrentclaw-i18n.js';

await i18nReady;

test('TorrentClaw URL validation matches the server: HTTPS only, no credentials', () => {
    const rule = { required: true, httpsOnly: true };

    assert.equal(getUrlError('https://torrentclaw.com', rule), null);
    assert.notEqual(getUrlError('http://torrentclaw.com', rule), null);
    assert.notEqual(getUrlError('https://user:secret@torrentclaw.com', rule), null);
    assert.notEqual(getUrlError('torrentclaw.com', rule), null);
    assert.notEqual(getUrlError('   ', rule), null);
});

test('qBittorrent URL validation accepts HTTP and HTTPS in local networks', () => {
    const rule = { required: true, httpsOnly: false };

    assert.equal(getUrlError('http://192.168.1.10:8080', rule), null);
    assert.equal(getUrlError('https://qbittorrent.example', rule), null);
    assert.notEqual(getUrlError('ftp://192.168.1.10', rule), null);
});

test('numeric validation uses the server ranges', () => {
    const timeout = { min: 1, max: 120, integerOnly: true, allowEmpty: false };
    const poll = { min: 10, max: 300, integerOnly: true, allowEmpty: false };
    const maxSize = { min: 0, integerOnly: false, allowEmpty: true };

    assert.equal(getNumberError('15', timeout), null);
    assert.notEqual(getNumberError('0', timeout), null);
    assert.notEqual(getNumberError('121', timeout), null);
    assert.notEqual(getNumberError('1.5', timeout), null);
    assert.notEqual(getNumberError('', timeout), null);
    assert.notEqual(getNumberError('9', poll), null);
    assert.equal(getNumberError('', maxSize), null);
    assert.equal(getNumberError('12.5', maxSize), null);
    assert.notEqual(getNumberError('-1', maxSize), null);
});

test('validation messages are rendered in the active UI language', () => {
    const httpsOnly = { required: true, httpsOnly: true };
    const timeout = { min: 1, max: 120, integerOnly: true, allowEmpty: false };
    const problems = () => [
        getUrlError('', httpsOnly),
        getUrlError('http://torrentclaw.com', httpsOnly),
        getNumberError('500', timeout),
        getNumberError('1.5', timeout)
    ];

    setLanguage('en');
    assert.deepEqual(problems().map(resolveMessage), [
        'This field is required.',
        'Only HTTPS is allowed.',
        'Enter a value between 1 and 120.',
        'Enter a whole number.'
    ]);

    // The same descriptors, kept from before the change, are shown in the new language.
    const kept = problems();
    setLanguage('it');
    assert.deepEqual(kept.map(resolveMessage), [
        'Campo obbligatorio.',
        'È consentito solo HTTPS.',
        'Inserisci un valore tra 1 e 120.',
        'Inserisci un numero intero.'
    ]);
    setLanguage('en');
});
