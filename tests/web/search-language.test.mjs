import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    collectAudioEntries,
    collectSubtitleEntries,
    describeAudioTrack,
    i18nReady,
    formatBytes,
    formatChannelLayout,
    normalizeLanguage,
    parsePreferredLanguageKeys,
    translateRule
} from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Search/search.js';
import { setLanguage } from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Shared/torrentclaw-i18n.js';

await i18nReady;

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
    setLanguage('en');
    for (const value of ['', '   ', null, undefined, 'und', 'unknown']) {
        const language = normalizeLanguage(value);
        assert.equal(language.recognized, false);
        assert.equal(language.code, null);
        assert.equal(language.name, 'Unknown language');
    }
});

test('media language names follow the active UI language while the codes stay the same', () => {
    const expectedNames = {
        en: { it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', ja: 'Japanese', pt: 'Portuguese', ru: 'Russian' },
        it: { it: 'Italiano', en: 'Inglese', es: 'Spagnolo', fr: 'Francese', de: 'Tedesco', ja: 'Giapponese', pt: 'Portoghese', ru: 'Russo' }
    };
    const stored = normalizeLanguage('ita');
    const unmapped = normalizeLanguage('kor');

    for (const [uiLanguage, names] of Object.entries(expectedNames)) {
        setLanguage(uiLanguage);
        for (const [code, name] of Object.entries(names)) {
            const language = normalizeLanguage(code);
            assert.equal(language.name, name, `${uiLanguage}/${code}`);
            assert.equal(language.code, code);
            assert.equal(language.key, code);
        }

        // A result computed earlier is displayed in the language that is active when it is rendered.
        assert.equal(stored.name, names.it);
        assert.equal(stored.code, 'it');
        assert.equal(unmapped.displayCode, 'KOR');
    }

    setLanguage('it');
    assert.equal(normalizeLanguage('').name, 'Lingua sconosciuta');
    assert.equal(unmapped.name, 'Lingua sconosciuta (KOR)');
    setLanguage('en');
    assert.equal(unmapped.name, 'Unknown language (KOR)');
});

test('ranking rules and track descriptions are shown in the active UI language', () => {
    const track = { lang: 'ita', codec: 'ac3', channels: 6, default: true };

    setLanguage('en');
    assert.equal(translateRule('requested audio language'), 'requested audio language');
    assert.equal(translateRule('no subtitles (TrueSpec)'), 'no subtitles (TrueSpec)');
    assert.equal(translateRule('Threat level: high'), 'Risk level: high');
    assert.equal(describeAudioTrack(track), 'Italian · AC3 · 5.1 · default');

    setLanguage('it');
    assert.equal(translateRule('requested audio language'), 'lingua audio richiesta');
    assert.equal(translateRule('Size metadata unavailable'), 'Dimensione non indicata');
    assert.equal(translateRule('Threat level: high'), 'Livello di rischio: high');
    assert.equal(translateRule('a rule the server invented'), 'a rule the server invented');
    assert.equal(translateRule('constructor'), 'constructor');
    assert.equal(describeAudioTrack(track), 'Italiano · AC3 · 5.1 · predefinita');
    setLanguage('en');
});

test('byte sizes use the formatting locale of the active language', () => {
    setLanguage('en');
    assert.equal(formatBytes(1536 * 1024 * 1024), '1.50 GB');
    assert.equal(formatBytes(1024 ** 4 * 1.5), '1.50 TB');
    assert.equal(formatBytes(-1), 'Unknown');

    setLanguage('it');
    assert.equal(formatBytes(1536 * 1024 * 1024), '1,50 GB');
    assert.equal(formatBytes(undefined), 'Sconosciuta');
    setLanguage('en');
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
