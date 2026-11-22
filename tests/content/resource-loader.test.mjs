import test from 'node:test';
import assert from 'node:assert/strict';
import { loadResource, loadJsonResource, subscribeContentProgress } from '../../src/adapters/content/resource-loader.ts';

test('ranged loading reconstructs every byte despite out-of-order chunks and reports completed progress', async t => {
  const expected = Uint8Array.from({ length: 3 * 262144 + 19 }, (_, index) => (index * 17 + 31) % 251);
  const requested = [], updates = [];
  const unsubscribe = subscribeContentProgress(update => updates.push(update));
  t.after(unsubscribe);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://example.test/ship.glb');
    const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
    assert.ok(match);
    const start = Number(match[1]), end = Math.min(Number(match[2]), expected.length - 1);
    requested.push(start);
    await new Promise(resolve => setTimeout(resolve, start === 262144 ? 5 : 1));
    return new Response(expected.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${expected.length}`, ETag: '"v1"' }
    });
  });
  const actual = await loadResource('https://example.test/ship.glb');
  assert.deepEqual(new Uint8Array(actual), expected);
  assert.deepEqual(requested.sort((a, b) => a - b), [0, 262144, 524288, 786432]);
  assert.equal(updates.at(-1).received, expected.length);
  assert.equal(updates.at(-1).total, expected.length);
  assert.ok(updates.every((update, index) => index === 0 || update.received > updates[index - 1].received));
});

test('servers ignoring Range and inlined manifests still load their complete JSON', async t => {
  const json = '{"models":[]}';
  t.mock.method(globalThis, 'fetch', async () => new Response(json, {
    headers: { 'Content-Length': String(new TextEncoder().encode(json).length) }
  }));
  assert.deepEqual(await loadJsonResource('https://example.test/catalog.json'), { models: [] });
  t.mock.restoreAll();
  assert.deepEqual(await loadJsonResource(`data:application/json,${encodeURIComponent(json)}`), { models: [] });
});

test('invalid ranges, truncated bodies and HTTP errors are surfaced rather than accepted as loaded', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('bad', { status: 206 }));
  await assert.rejects(loadResource('https://example.test/model.glb'), /Content-Range/);
  t.mock.method(globalThis, 'fetch', async () => new Response('abc', {
    status: 206, headers: { 'Content-Range': 'bytes 0-4/5' }
  }));
  await assert.rejects(loadResource('https://example.test/model.glb'), /首段长度/);
  t.mock.method(globalThis, 'fetch', async () => new Response('missing', { status: 404 }));
  await assert.rejects(loadResource('https://example.test/model.glb'), /HTTP 404/);
});

test('a changed file version during ranged download fails and cancels outstanding work', async t => {
  const signals = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    signals.push(options.signal);
    const start = Number(/^bytes=(\d+)-/.exec(options.headers.Range)[1]);
    const total = 262145, end = Math.min(start + 262143, total - 1);
    return new Response(new Uint8Array(end - start + 1), {
      status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${total}`, ETag: start ? '"v2"' : '"v1"' }
    });
  });
  await assert.rejects(loadResource('https://example.test/model.glb'), /版本发生变化/);
  assert.ok(signals.every(signal => signal.aborted));
});
