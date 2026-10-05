const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validMbid = value => typeof value === 'string' && MBID.test(value);
const unavailable = message => Object.assign(new Error(message), { status: 503 });

/** One shared queue per app instance. Run a single server process for this limiter. */
export function createMusicBrainz({ fetcher = fetch, interval = 1100, ttl = 600000, userAgent = process.env.MUSICBRAINZ_USER_AGENT || 'MAMRS/0.2.0 (https://github.com/jaynishthakar/mamrs)' } = {}) {
  const cache = new Map(), pending = new Map();
  let queue = Promise.resolve(), lastStart = 0;
  function request(entity, params) {
    const url = new URL(`https://musicbrainz.org/ws/2/${entity}`);
    url.search = new URLSearchParams({ ...params, fmt: 'json' }).toString();
    const key = url.href, cached = cache.get(key);
    if (cached?.expires > Date.now()) return Promise.resolve(cached.data);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 12) return Promise.reject(unavailable('Music discovery is busy. Please try again shortly.'));
    const task = queue.then(async () => {
      const delay = Math.max(0, lastStart + interval - Date.now());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      lastStart = Date.now();
      try {
        const response = await fetcher(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Upstream ${response.status}`);
        const data = await response.json();
        if (!data || typeof data !== 'object') throw new Error('Invalid response');
        cache.set(key, { data, expires: Date.now()+ttl });
        if (cache.size > 200) cache.delete(cache.keys().next().value);
        return data;
      } catch { throw unavailable('MusicBrainz is unavailable or rate-limited. Your saved catalog still works; retry discovery later.'); }
    });
    pending.set(key,task); queue = task.catch(()=>{});
    task.then(()=>pending.delete(key),()=>pending.delete(key));
    return task;
  }
  return {
    async searchArtists(query) {
      // Quote/escape user text as a literal Lucene phrase, not a query expression.
      const data = await request('artist', { query: `artist:"${query.replace(/[\\"]/g,'\\$&')}"`, limit: '10' });
      if (!Array.isArray(data.artists)) throw unavailable('MusicBrainz returned an invalid artist list. Retry later.');
      return data.artists.filter(a=>validMbid(a.id)).map(a=>({ id:a.id, name:a.name, country:a.country || '', type:a.type || '', disambiguation:a.disambiguation || '' }));
    },
    async recordings(artistId, offset=0) {
      const data = await request('recording', { artist: artistId, limit:'50', offset:String(offset), inc:'artist-credits+genres' });
      if (!Array.isArray(data.recordings) || !Number.isInteger(data['recording-count'])) throw unavailable('MusicBrainz returned an invalid recording list. Retry later.');
      const songs = data.recordings.filter(r=>validMbid(r.id) && typeof r.title==='string').map(r=>({
        mbid:r.id, title:r.title,
        artist:(r['artist-credit'] || []).map(a=>`${a.name || a.artist?.name || ''}${a.joinphrase || ''}`).join('') || 'Unknown artist',
        genre:[...(r.genres || [])].sort((a,b)=>(b.count||0)-(a.count||0))[0]?.name || 'Unknown',
        language:'Unknown', duration:Number.isFinite(r.length) ? Math.round(r.length/1000) : null, album:null, year:null,
        moodScores:{}, activityScores:{}, color:'sage', source:'MusicBrainz', tagSource:'Unclassified', sourceUrl:`https://musicbrainz.org/recording/${r.id}`,
      }));
      return { songs, total:data['recording-count'], nextOffset: offset+data.recordings.length < data['recording-count'] && data.recordings.length ? offset+data.recordings.length : null };
    },
  };
}
