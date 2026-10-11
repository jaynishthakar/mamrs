import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicBrainz } from '../src/musicbrainz.js';
const id='11111111-1111-1111-1111-111111111111';
test('provider caches and coalesces queries, sends identification, escapes search, and spaces requests',async()=>{
  const calls=[];
  const provider=createMusicBrainz({interval:30,fetcher:async(url,opts)=>{
    calls.push({url,opts,time:Date.now()});
    return {ok:true,json:async()=>({artists:[{id,name:'Artist'}]})};
  }});
  const [a,b]=await Promise.all([provider.searchArtists('A "B"'),provider.searchArtists('A "B"')]);
  assert.deepEqual(a,b); assert.equal(calls.length,1);
  assert.equal(calls[0].url.searchParams.get('query'),'artist:"A \\"B\\""');
  assert.match(calls[0].opts.headers['User-Agent'],/MAMRS/);
  await provider.searchArtists('A "B"');assert.equal(calls.length,1);
  await provider.searchArtists('Other');assert.ok(calls[1].time-calls[0].time>=29);
});
test('provider maps recording metadata without inventing language/context and preserves pagination',async()=>{
  let requested;
  const provider=createMusicBrainz({interval:0,fetcher:async(url)=>{
    requested=url;return {ok:true,json:async()=>({'recording-count':51,recordings:[{id,title:'Song',length:123000,'artist-credit':[{name:'One',joinphrase:' & '},{name:'Two'}],genres:[{name:'pop',count:4}]}]})};
  }});
  const out=await provider.recordings(id,50);
  assert.equal(requested.searchParams.get('offset'),'50');
  assert.equal(out.nextOffset,null);assert.equal(out.songs[0].artist,'One & Two');
  assert.equal(out.songs[0].duration,123);assert.equal(out.songs[0].language,'Unknown');assert.deepEqual(out.songs[0].moodScores,{});
});
test('upstream failures return retryable errors and are not cached',async()=>{
  let calls=0;
  const provider=createMusicBrainz({interval:0,fetcher:async()=>{calls++;return {ok:false,status:503};}});
  await assert.rejects(provider.searchArtists('Artist'),{status:503});
  await assert.rejects(provider.searchArtists('Artist'),{status:503});assert.equal(calls,2);
});

test('recording enrichment uses work lyrics languages, tags and ISRCs instead of release text language', async () => {
  const workId = '33333333-3333-3333-3333-333333333333';
  const calls = [];
  const provider = createMusicBrainz({ interval: 0, fetcher: async url => {
    calls.push(url);
    return { ok: true, json: async () => url.pathname.includes('/work/') ? { id: workId, languages: ['hin'] } : {
      id, title: 'Recording', 'artist-credit': [{ name: 'Singer', artist: { id, name: 'Singer' } }],
      isrcs: ['INAAA2600001'], tags: [{ name: 'romantic', count: 4 }],
      releases: [{ title: 'Album', 'text-representation': { language: 'eng' } }],
      relations: [{ type: 'performance', work: { id: workId } }]
    } };
  } });
  const out = await provider.track(id);
  assert.deepEqual(out.workLanguages, ['hin']); assert.equal(out.language, 'Unknown');
  assert.deepEqual(out.isrcs, ['INAAA2600001']); assert.equal(out.providerTags[0].count, 4);
  assert.ok(calls[0].searchParams.get('inc').includes('tags'));
  assert.equal(calls[1].pathname, `/ws/2/work/${workId}`);
});

test('rate-limit retry-after is preserved for the background scheduler', async () => {
  const provider = createMusicBrainz({ interval: 0, fetcher: async () => ({ ok: false, status: 429, headers: { get: () => '120' } }) });
  await assert.rejects(provider.track(id), error => error.status === 503 && error.retryAfterMs === 120000);
});
