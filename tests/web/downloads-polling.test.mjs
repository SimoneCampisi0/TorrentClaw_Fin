import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createPollingController,
    formatBytes,
    formatDuration,
    formatPercent,
    getStateLabel,
    i18nReady,
    resolveStateName
} from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Downloads/downloads.js';
import { setLanguage } from '../../src/Jellyfin.Plugin.TorrentClaw/Web/Shared/torrentclaw-i18n.js';

await i18nReady;

function createFakeTimers() {
    const active = new Map();
    let nextId = 1;
    return {
        setTimeout(callback, delay) {
            const id = nextId;
            nextId += 1;
            active.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) {
            active.delete(id);
        },
        get activeCount() {
            return active.size;
        },
        async fireAll() {
            const due = [...active.values()];
            active.clear();
            for (const timer of due) {
                await timer.callback();
            }
        }
    };
}

function createFakeDocument() {
    const listeners = new Set();
    return {
        visibilityState: 'visible',
        addEventListener(type, listener) {
            assert.equal(type, 'visibilitychange');
            listeners.add(listener);
        },
        removeEventListener(type, listener) {
            listeners.delete(listener);
        },
        setVisibility(state) {
            this.visibilityState = state;
            for (const listener of listeners) {
                listener();
            }
        },
        get listenerCount() {
            return listeners.size;
        }
    };
}

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

function createHarness(onTick = async () => {}) {
    const timers = createFakeTimers();
    const visibility = createFakeDocument();
    let tickCount = 0;
    const controller = createPollingController({
        intervalMs: 10000,
        timers,
        visibility,
        onTick: async () => {
            tickCount += 1;
            await onTick();
        }
    });
    return { controller, timers, visibility, getTickCount: () => tickCount };
}

test('start runs one tick immediately and keeps exactly one timer', async () => {
    const { controller, timers, getTickCount } = createHarness();

    controller.start();
    controller.start();
    await flushPromises();

    assert.equal(getTickCount(), 1);
    assert.equal(timers.activeCount, 1);

    await timers.fireAll();
    await flushPromises();
    assert.equal(getTickCount(), 2);
    assert.equal(timers.activeCount, 1);
});

test('repeated viewshow/viewhide cycles never duplicate timers or listeners', async () => {
    const { controller, timers, visibility } = createHarness();

    for (let cycle = 0; cycle < 5; cycle += 1) {
        controller.start();
        await flushPromises();
        assert.equal(timers.activeCount, 1);
        assert.equal(visibility.listenerCount, 1);

        controller.stop();
        assert.equal(timers.activeCount, 0);
        assert.equal(visibility.listenerCount, 0);
    }

    assert.equal(controller.isRunning, false);
});

test('a tick finishing after stop does not schedule a new timer', async () => {
    let releaseTick;
    const { controller, timers } = createHarness(() => new Promise(resolve => {
        releaseTick = resolve;
    }));

    controller.start();
    controller.stop();
    releaseTick();
    await flushPromises();

    assert.equal(timers.activeCount, 0);
});

test('manual refresh during a running tick does not overlap requests', async () => {
    let releaseTick;
    const { controller, timers, getTickCount } = createHarness(() => new Promise(resolve => {
        releaseTick = resolve;
    }));

    controller.start();
    const manualRefresh = controller.refreshNow();
    releaseTick();
    await manualRefresh;
    await flushPromises();

    assert.equal(getTickCount(), 1);
    assert.equal(timers.activeCount, 1);
});

test('polling pauses while the browser tab is hidden and resumes with a single timer', async () => {
    const { controller, timers, visibility, getTickCount } = createHarness();

    controller.start();
    await flushPromises();
    visibility.setVisibility('hidden');
    assert.equal(timers.activeCount, 0);

    visibility.setVisibility('visible');
    visibility.setVisibility('visible');
    await flushPromises();

    assert.equal(getTickCount(), 2);
    assert.equal(timers.activeCount, 1);
    controller.stop();
});

test('a page opened in a hidden tab loads once but does not start the periodic timer', async () => {
    const { controller, timers, visibility, getTickCount } = createHarness();
    visibility.visibilityState = 'hidden';

    controller.start();
    await flushPromises();
    assert.equal(getTickCount(), 1);
    assert.equal(timers.activeCount, 0);

    await controller.refreshNow();
    assert.equal(getTickCount(), 2);
    assert.equal(timers.activeCount, 0);

    visibility.setVisibility('visible');
    await flushPromises();
    assert.equal(getTickCount(), 3);
    assert.equal(timers.activeCount, 1);
    controller.stop();
});

test('a failing refresh keeps polling alive', async () => {
    const { controller, timers } = createHarness(async () => {
        throw new Error('network down');
    });

    controller.start();
    await flushPromises();

    assert.equal(timers.activeCount, 1);
    controller.stop();
});

test('download states accept both enum names and numeric values', () => {
    assert.equal(resolveStateName(null), 'Waiting');
    assert.equal(resolveStateName({ State: 'Downloading' }), 'Downloading');
    assert.equal(resolveStateName({ State: 6 }), 'Completed');
    assert.equal(resolveStateName({ State: 'constructor' }), 'Unknown');
    assert.equal(resolveStateName({ State: 99 }), 'Unknown');
});

test('download state labels follow the active UI language while state names stay stable', () => {
    const states = ['Waiting', 'Unknown', 'Queued', 'Downloading', 'Paused', 'Stalled', 'Checking', 'Completed', 'Error', 'MissingFiles'];
    const english = [
        'Waiting for status', 'Unknown status', 'Queued', 'Downloading', 'Paused', 'Stalled', 'Checking', 'Completed', 'Error', 'Missing files'
    ];
    const italian = [
        'In attesa di stato', 'Stato sconosciuto', 'In coda', 'In download', 'In pausa', 'Bloccato', 'In verifica', 'Completato', 'Errore',
        'File mancanti'
    ];

    setLanguage('en');
    assert.deepEqual(states.map(getStateLabel), english);
    setLanguage('it');
    assert.deepEqual(states.map(getStateLabel), italian);
    assert.equal(getStateLabel('SomethingNew'), 'Stato sconosciuto');
    setLanguage('en');

    assert.equal(resolveStateName({ State: 3 }), 'Paused');
    assert.equal(resolveStateName({ State: 'MissingFiles' }), 'MissingFiles');
});

test('sizes, percentages and durations use the formatting locale and words of the active language', () => {
    setLanguage('en');
    assert.equal(formatBytes(1536 * 1024 * 1024), '1.50 GB');
    assert.equal(formatPercent(42.5), '42.5%');
    assert.equal(formatDuration(90), '1 min');
    assert.equal(formatDuration(3 * 86400 + 5 * 3600), '3 d 5 h');

    setLanguage('it');
    assert.equal(formatBytes(1536 * 1024 * 1024), '1,50 GB');
    assert.equal(formatPercent(42.5), '42,5%');
    assert.equal(formatDuration(3 * 86400 + 5 * 3600), '3 g 5 h');
    setLanguage('en');
});
