import assert from 'node:assert/strict';
import test from 'node:test';
import { i18nReady, isPreflightReady } from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Search/search.js';

await i18nReady;

test('preflight readiness accepts both enum JSON representations', () => {
    assert.equal(isPreflightReady({ Status: 0 }), true);
    assert.equal(isPreflightReady({ Status: 'Ready' }), true);
    assert.equal(isPreflightReady({ Status: 1 }), false);
    assert.equal(isPreflightReady({ Status: 'MetadataUnavailable' }), false);
    assert.equal(isPreflightReady(null), false);
});
