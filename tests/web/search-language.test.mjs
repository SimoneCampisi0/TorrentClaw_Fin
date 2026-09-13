import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    collectAudioEntries,
    collectSubtitleEntries,
    formatChannelLayout,
    normalizeLanguage,
    parsePreferredLanguageKeys
} from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Search/search.js';

const REQUIRED_ALIASES = {
    it: ['it', 'ita', 'italian', 'italiano'],
    en: ['en', 'eng', 'english', 'inglese'],
    es: ['es', 'spa', 'spanish', 'spagnolo'],
    fr: ['fr', 'fra', 'fre', 'french', 'francese'],
    de: ['de', 'deu', 'ger', 'german', 'tedesco'],
    ja: ['ja', 'jpn', 'japanese', 'giapponese'],
    pt: ['pt', 'por', 'portuguese', 'portoghese'],
    ru: ['ru', 'rus', 'russian', 'russo']
};

test('every required alias is normalised to its language, regardless of case and spacing', () => {
    for (const [code, aliases] of Object.entries(REQUIRED_ALIASES)) {
        for (const alias of aliases) {
            for (const variant of [alias, alias.toUpperCase(), ` ${alias} `]) {
                const language = normalizeLanguage(variant);
                assert.equal(language.recognized, true, variant);
                assert.equal(language.code, code, variant);
                assert.equal(language.displayCode, null, variant);
            }
        }
    }
});

test('missing or undetermined languages get the neutral unknown label', () => {
    for (const value of ['', '   ', null, undefined, 'und', 'unknown']) {
        const language = normalizeLanguage(value);
        assert.equal(language.recognized, false);
        assert.equal(language.code, null);
        assert.equal(language.name, 'Lingua sconosciuta');
    }
});

test('unmapped languages never receive an arbitrary flag', () => {
    const korean = normalizeLanguage('kor');

    assert.equal(korean.recognized, false);
    assert.equal(korean.code, null);
    assert.equal(korean.displayCode, 'KOR');
});

test('regional subtags are reduced to the primary language', () => {
    assert.equal(normalizeLanguage('pt-BR').code, 'pt');
    assert.equal(normalizeLanguage('en_US').code, 'en');
});

test('channel counts are shown as human-readable layouts', () => {
    assert.equal(formatChannelLayout(2), '2.0');
    assert.equal(formatChannelLayout(6), '5.1');
    assert.equal(formatChannelLayout(8), '7.1');
    assert.equal(formatChannelLayout(0), null);
    assert.equal(formatChannelLayout('not a number'), null);
});

test('audio entries keep channel layouts, drop codec duplicates and list the preferred language first', () => {
    const release = {
        AudioTracks: [
            { lang: 'eng', codec: 'EAC3', channels: 6, default: true, title: 'Main' },
            { lang: 'ita', codec: 'AC3', channels: 6 },
            { lang: 'ita', codec: 'DTS', channels: 6 },
            { lang: 'ita', codec: 'AAC', channels: 2 }
        ]
    };

    const entries = collectAudioEntries(release, parsePreferredLanguageKeys('it'));

    assert.deepEqual(
        entries.map(entry => [entry.language.code, entry.channelLayout]),
        [['it', '5.1'], ['it', '2.0'], ['en', '5.1']]
    );
});

test('audio falls back to detected languages when TrueSpec tracks are absent', () => {
    const entries = collectAudioEntries({ AudioTracks: [], AudioLanguages: ['en', 'it'] }, []);

    assert.deepEqual(entries.map(entry => [entry.language.code, entry.channelLayout]), [['en', null], ['it', null]]);
});

test('subtitles show one entry per language whatever the codec, forced or default flags', () => {
    const release = {
        SubtitleTracks: [
            { lang: 'und', codec: 'pgs' },
            { lang: 'ita', codec: 'subrip' },
            { lang: 'it', codec: 'ass', forced: true },
            { lang: 'eng', codec: 'subrip', default: true },
            { lang: 'English', codec: 'pgs' }
        ]
    };

    const entries = collectSubtitleEntries(release, parsePreferredLanguageKeys('en', 'it'));

    assert.deepEqual(entries.map(entry => entry.language.key), ['en', 'it', 'unknown']);
});

test('PascalCase track properties are accepted as well', () => {
    const entries = collectAudioEntries({ AudioTracks: [{ Lang: 'fre', Channels: 2 }] }, []);

    assert.deepEqual(entries.map(entry => [entry.language.code, entry.channelLayout]), [['fr', '2.0']]);
});

test('preferred language keys ignore "none" and unknown values', () => {
    assert.deepEqual(parsePreferredLanguageKeys('it,en', 'none', 'xx', 'ita'), ['it', 'en']);
});
