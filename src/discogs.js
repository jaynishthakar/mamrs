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

  async function releaseTracks(id, type = 'release') {
    const release = await request(`${type === 'master' ? 'masters' : 'releases'}/${id}`);
    if (type === 'master') {
      if (!release.main_release) throw unavailable('Discogs master has no canonical release.');
      return releaseTracks(release.main_release);
    }
    if (!Array.isArray(release.tracklist)) throw unavailable('Discogs returned a release without a tracklist.');
    const flatten = tracks => tracks.flatMap(t => Array.isArray(t.sub_tracks) && t.sub_tracks.length ? flatten(t.sub_tracks) : [t]);
    return flatten(release.tracklist).filter(t => t.type_ !== 'heading' && t.type_ !== 'index' && t.title && t.position).map(t => {
      const credits = (t.artists?.length ? t.artists : release.artists || []).map(a => ({ id: String(a.id), name: (a.name || '').replace(/\s*\(\d+\)$/, ''), join: a.join || ', ' }));
      const artists = credits.filter(a => a.name && a.name !== 'Various');
      const duration = /^(\d+):([0-5]\d)$/.exec(t.duration || '');
      return { discogsId: `${id}:${t.position}`, discogsType: type, discogsReleaseId: String(id), position: t.position,
        title: t.title, artist: artists.map((a, i) => a.name + (i < artists.length - 1 ? ` ${a.join} ` : '')).join('') || 'Unknown artist',
        artists: artists.map(a => ({ id: `discogs:${a.id}`, name: a.name })),
        genres: [...(release.genres || []), ...(release.styles || [])], genre: release.genres?.[0] || 'Unknown', language: 'Unknown',
        album: release.title || null, year: release.year || null, duration: duration ? Number(duration[1]) * 60 + Number(duration[2]) : null,
        moodScores: {}, activityScores: {}, color: 'coral', source: 'Discogs', tagSource: 'Unclassified',
        sourceUrl: `https://www.discogs.com/${type}/${id}`, catalogStatus: 'pending' };
    });
  }
  return {
    async track(id, type = 'release') {
      const match = /^(\d+):(.+)$/.exec(id || '');
      if (!match || !['release', 'master'].includes(type)) throw Object.assign(new Error('Select an individual Discogs track.'), { status: 400 });
      const song = (await releaseTracks(match[1], type)).find(s => s.position === match[2]);
      if (!song) throw Object.assign(new Error('Track no longer exists in this release.'), { status: 400 });
      return song;
    },
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
    async searchTracks(query) {
      const data = await request('database/search', { q: query, type: 'release', per_page: '15' });
      if (!Array.isArray(data.results)) throw unavailable('Discogs returned an invalid search list. Retry later.');
      const songs = [];
      for (const release of data.results.filter(r => r.id).slice(0, 5)) songs.push(...await releaseTracks(release.id));
      const needle = query.toLowerCase();
      return songs.filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(needle)).slice(0, 30);
    },
    async recordings(artistId, page = 1) {
      const data = await request(`artists/${artistId}/releases`, { page: String(page), per_page: '5', sort: 'year', sort_order: 'desc' });
      if (!Array.isArray(data.releases) || !data.pagination) throw unavailable('Discogs returned an invalid release list. Retry later.');
      const songs = [];
      for (const release of data.releases.filter(r => r.id)) {
        const tracks = await releaseTracks(release.id, release.type === 'master' ? 'master' : 'release');
        songs.push(...tracks.filter(s => s.artists.some(a => a.id === `discogs:${artistId}`)));
      }
      const total = data.pagination.items || songs.length;
      const nextOffset = (data.pagination.page < data.pagination.pages) ? Number(page) + 1 : null;
      return { songs, total, nextOffset };
    }
  };
}
