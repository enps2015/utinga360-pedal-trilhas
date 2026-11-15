import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readBrowserTtlCache,
  TtlCache,
  writeBrowserTtlCache,
} from './apiCache.ts';

test('TtlCache serves fresh entries, expires after TTL, and deduplicates concurrent loads', async () => {
  let clock = 1000;
  const cache = new TtlCache<string>(3);
  let calls = 0;

  const loader = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 15));
    return `result-${calls}`;
  };

  // Two concurrent callers should trigger only 1 loader execution
  const [r1, r2] = await Promise.all([
    cache.runDeduplicated('k1', 500, loader, { nowMs: () => clock }),
    cache.runDeduplicated('k1', 500, loader, { nowMs: () => clock }),
  ]);

  assert.equal(calls, 1);
  assert.equal(r1.value, 'result-1');
  assert.equal(r2.value, 'result-1');
  assert.equal(r1.stale, false);

  // Within TTL: still cached
  clock = 1400;
  const r3 = await cache.runDeduplicated('k1', 500, loader, { nowMs: () => clock });
  assert.equal(calls, 1);
  assert.equal(r3.value, 'result-1');

  // After TTL: reloads
  clock = 1600;
  const r4 = await cache.runDeduplicated('k1', 500, loader, { nowMs: () => clock });
  assert.equal(calls, 2);
  assert.equal(r4.value, 'result-2');
});

test('TtlCache returns stale fallback on error when allowStaleOnError allows it', async () => {
  let clock = 1000;
  const cache = new TtlCache<{ ok: boolean }>(5);
  cache.set('weather', { ok: true }, 100, clock);

  clock = 2000; // expired
  const res = await cache.runDeduplicated(
    'weather',
    100,
    async () => {
      throw new Error('HTTP_429');
    },
    {
      nowMs: () => clock,
      allowStaleOnError: (err) => String(err).includes('429'),
    }
  );

  assert.deepEqual(res.value, { ok: true });
  assert.equal(res.stale, true);
});

test('TtlCache evicts oldest key when exceeding maxEntries', () => {
  const cache = new TtlCache<number>(2);
  cache.set('a', 1, 1000, 0);
  cache.set('b', 2, 1000, 0);
  cache.set('c', 3, 1000, 0);

  assert.equal(cache.size(), 2);
  assert.equal(cache.getFresh('a', 10), null);
  assert.equal(cache.getFresh('b', 10)?.value, 2);
  assert.equal(cache.getFresh('c', 10)?.value, 3);
});

test('readBrowserTtlCache and writeBrowserTtlCache respect expiration', () => {
  const map = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };

  writeBrowserTtlCache(mockStorage, 'places', { count: 12 }, 1000, 5000);
  assert.deepEqual(readBrowserTtlCache<{ count: number }>(mockStorage, 'places', 5500), {
    count: 12,
  });
  assert.equal(readBrowserTtlCache(mockStorage, 'places', 6000), null);
});
