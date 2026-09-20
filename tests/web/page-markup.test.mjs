import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { TRANSLATIONS } from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Shared/torrentclaw-i18n.js';

const webRoot = new URL('../../src/Jellyfin.Plugin.TorrentClaw/Web/', import.meta.url);
const pages = [
    { name: 'Search', html: 'Search/search.html', script: 'Search/search.js' },
    { name: 'Downloads', html: 'Downloads/downloads.html', script: 'Downloads/downloads.js' },
    { name: 'Settings', html: 'Settings/settings.html', script: 'Settings/settings.js' }
];

const read = relativePath => readFileSync(new URL(relativePath, webRoot), 'utf8');

test('no per-language copy of a page exists', () => {
    const htmlFiles = ['Search', 'Downloads', 'Settings', 'Shared'].flatMap(directory =>
        readdirSync(new URL(`${directory}/`, webRoot)).filter(file => file.endsWith('.html')));

    assert.deepEqual(htmlFiles.sort(), ['downloads.html', 'search.html', 'settings.html']);
});

for (const { name, html } of pages) {
    test(`${name} page has an accessible language picker offering only English and Italian`, () => {
        const markup = read(html);
        const header = markup.slice(markup.indexOf('<header class="tc-header">'), markup.indexOf('</header>'));

        assert.match(header, /data-language-picker/);
        assert.match(header, /<button[^>]*data-language-button[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"/);
        assert.match(header, /<button[^>]*aria-label="[^"]+"[^>]*title="[^"]+"/);
        assert.match(header, /<ul[^>]*role="listbox"[^>]*data-language-list[^>]*aria-label="[^"]+"/);
        const options = [...header.matchAll(/<li[^>]*role="option"[^>]*data-language="(\w+)"[^>]*>([\s\S]*?)<\/li>/g)];
        assert.deepEqual(options.map(option => option[1]), ['en', 'it']);
        for (const [, code, content] of options) {
            assert.match(content, new RegExp(`<svg[^>]*data-flag="${code}"[^>]*aria-hidden="true"`));
            assert.match(content, /class="tc-sr-only" data-i18n="language\.\w+"/);
        }

        assert.ok(header.indexOf('data-language-picker') > header.indexOf('tc-nav'), 'the picker is the last part of the header');
    });

    test(`${name} page loads the shared stylesheet next to its own`, () => {
        assert.match(read(html), /<link rel="stylesheet" href="configurationpage\?name=TorrentClawShared\.css">/);
    });

    test(`${name} page only uses dictionary keys defined in both languages`, () => {
        const markup = read(html);
        const script = read(name === 'Search' ? 'Search/search.js' : `${name}/${name.toLowerCase()}.js`);
        const keys = new Set([
            ...[...markup.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]),
            ...[...markup.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(match =>
                match[1].split(';').map(pair => pair.split(':')[1])),
            ...[...script.matchAll(/'((?:nav|language|common|error|validation|settings|downloads|search|release|rule|preflight)\.[\w.]+)'/g)]
                .map(match => match[1])
        ]);

        assert.ok(keys.size > 10);
        for (const key of keys) {
            assert.ok(Object.hasOwn(TRANSLATIONS.en, key), `en is missing ${key}`);
            assert.ok(Object.hasOwn(TRANSLATIONS.it, key), `it is missing ${key}`);
        }
    });

    test(`${name} page keeps an English fallback text inside every marked element`, () => {
        const markup = read(html);

        for (const [, key, text] of markup.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]+)</g)) {
            assert.equal(text.trim(), TRANSLATIONS.en[key], key);
        }
    });
}

test('controllers do not contain Italian user-facing text outside the language aliases', () => {
    const italianWords = /\b(Cerca|Ricerca|Impostazioni|Salva|Annulla|Riprova|Conferma|Rimuovi|Scaricat|Nessun|Caricamento|Errore)\b/;
    for (const { script } of pages) {
        const lines = read(script).split('\n').filter(line => !/aliases:/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line));

        assert.deepEqual(lines.filter(line => italianWords.test(line)), [], script);
    }
});

test('controllers never await at the top level, because Jellyfin fires "load" before such a module has evaluated', () => {
    for (const { script } of pages) {
        const topLevelAwaits = read(script).split('\n').filter(line => /^\S.*\bawait\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line));

        assert.deepEqual(topLevelAwaits, [], script);
        assert.match(read(script), /export const i18nReady = /, script);
    }

    assert.doesNotMatch(read('Shared/torrentclaw-i18n.js'), /^\S.*\bawait\b/m);
});

test('the language picker uses local SVG flags only', () => {
    const script = read('Shared/torrentclaw-i18n.js');

    assert.doesNotMatch(script, /<img|url\(|@import|new Image|fetch\(|XMLHttpRequest/);
    assert.match(script, /createElementNS\(SVG_NAMESPACE/);
});
