const unavailable = message => Object.assign(new Error(message), { status: 503 });

/** One shared queue per app instance for Discogs API rate-limiting. */
export function createDiscogs({ fetcher = fetch, interval = 1100, ttl = 600000, userAgent = process.env.DISCOGS_USER_AGENT || 'MAMRS/0.2.0 (https://github.com/jaynishthakar/mamrs)' } = {}) {
  const cache = new Map(), pending = new Map();
  let queue = Promise.resolve(), lastStart = 0;

  function request(path, params = {}) {
    const url = new URL(`https://api.discogs.com/${path}`);
    url.search = new URLSearchParams(params).toString();
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
        cache.set(key, { data, expires: Date.now() + ttl });
        if (cache.size > 200) cache.delete(cache.keys().next().value);
        return data;
      } catch {
        throw unavailable('Discogs is unavailable or rate-limited. Your saved catalog still works; retry discovery later.');
      }
    });
    pending.set(key, task);
    queue = task.catch(() => {});
    task.then(() => pending.delete(key), () => pending.delete(key));
    return task;
  }

  return {
    async searchArtists(query) {
      const data = await request('database/search', { q: query, type: 'artist', per_page: '10' });
      if (!Array.isArray(data.results)) throw unavailable('Discogs returned an invalid artist list. Retry later.');
      return data.results.filter(a => a.id && a.title).map(a => ({
        id: String(a.id),
        name: a.title.replace(/\s*\(\d+\)$/, ''),
        country: '',
        type: 'Artist',
        disambiguation: a.title.includes('(') ? a.title : '',
        thumb: a.thumb || '',
        sourceUrl: `https://www.discogs.com/artist/${a.id}`,
      }));
    },
    async recordings(artistId, page = 1) {
      const data = await request(`artists/${artistId}/releases`, { page: String(page), per_page: '50', sort: 'year', sort_order: 'desc' });
      if (!Array.isArray(data.releases) || !data.pagination) throw unavailable('Discogs returned an invalid release list. Retry later.');
      const songs = data.releases.filter(r => r.id && r.title).map(r => ({
        discogsId: String(r.id),
        title: r.title,
        artist: (r.artist || '').replace(/\s*\(\d+\)$/, '') || 'Unknown artist',
        genre: Array.isArray(r.genre) && r.genre.length ? r.genre[0] : (Array.isArray(r.style) && r.style.length ? r.style[0] : 'Unknown'),
        language: 'Unknown',
        duration: null,
        album: r.title,
        year: r.year ? Number(r.year) : null,
        moodScores: {},
        activityScores: {},
        color: 'coral',
        source: 'Discogs',
        tagSource: 'Unclassified',
        sourceUrl: `https://www.discogs.com/${r.type === 'master' ? 'master' : 'release'}/${r.id}`,
      }));
      const total = data.pagination.items || songs.length;
      const nextOffset = (data.pagination.page < data.pagination.pages) ? Number(page) + 1 : null;
      return { songs, total, nextOffset };
    }
  };
}
