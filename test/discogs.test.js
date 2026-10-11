import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiscogs } from '../src/discogs.js';

test('discogs provider caches and coalesces queries, sends identification, and spaces requests', async () => {
  const calls = [];
  const provider = createDiscogs({
    interval: 30,
    fetcher: async (url, opts) => {
      calls.push({ url, opts, time: Date.now() });
      return {
        ok: true,
        json: async () => ({
          results: [{ id: 1234, title: 'Test Artist (2)' }]
        })
      };
    }
  });

  const [a, b] = await Promise.all([
    provider.searchArtists('Test'),
    provider.searchArtists('Test')
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/database/search');
  assert.match(calls[0].opts.headers['User-Agent'], /MAMRS/);
  assert.equal(a[0].name, 'Test Artist');
  assert.equal(a[0].disambiguation, 'Test Artist (2)');

  await provider.searchArtists('Test');
  assert.equal(calls.length, 1);

  await provider.searchArtists('Other');
  assert.ok(calls[1].time - calls[0].time >= 29);
});

test('discogs expands masters, preserves recording credits and excludes unrelated compilation tracks', async () => {
  let requested;
  const provider = createDiscogs({
    interval: 0,
    fetcher: async (url) => {
      requested = url;
      if (url.pathname === '/masters/999') return { ok: true, json: async () => ({ main_release: 888 }) };
      if (url.pathname === '/releases/888') return { ok: true, json: async () => ({
        title: 'Awesome Album', genres: ['Rock'], artists: [{ id: 1, name: 'Various' }],
        tracklist: [
          { type_: 'heading', title: 'Side A' },
          { type_: 'track', position: 'A1', title: 'Actual Song', duration: '3:12', artists: [{ id: 1234, name: 'Band (1)' }] },
          { type_: 'track', position: 'A2', title: 'Unrelated', artists: [{ id: 7, name: 'Other' }] }
        ]
      }) };
      return {
        ok: true,
        json: async () => ({
          pagination: { page: 1, pages: 3, per_page: 50, items: 120 },
          releases: [
            { id: 999, title: 'Awesome Album', artist: 'Band (1)', year: 2020, genre: ['Rock'], type: 'master' }
          ]
        })
      };
    }
  });

  const out = await provider.recordings('1234', 1);
  assert.equal(requested.pathname, '/releases/888');
  assert.equal(out.nextOffset, 2);
  assert.equal(out.songs[0].artist, 'Band');
  assert.equal(out.songs[0].genre, 'Rock');
  assert.equal(out.songs[0].source, 'Discogs');
  assert.equal(out.songs.length, 1);
  assert.equal(out.songs[0].title, 'Actual Song');
  assert.equal(out.songs[0].discogsId, '888:A1');
  assert.equal(out.songs[0].duration, 192);
});

test('discogs upstream failures return retryable 503 errors and are not cached', async () => {
  let calls = 0;
  const provider = createDiscogs({
    interval: 0,
    fetcher: async () => {
      calls++;
      return { ok: false, status: 503 };
    }
  });

  await assert.rejects(provider.searchArtists('Artist'), { status: 503 });
  await assert.rejects(provider.searchArtists('Artist'), { status: 503 });
  assert.equal(calls, 2);
});
