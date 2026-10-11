import { moods, activities } from './catalog.js';

export const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizeGenre = value => {
  const key = normalize(value).replace(/[-_]/g, ' ');
  return ({ 'hip hop': 'hip hop', 'r&b': 'rhythm and blues', 'rnb': 'rhythm and blues', 'lo fi': 'lofi' })[key] || key;
};
export function valuesFor(song, field) {
  const values = song[`${field}s`];
  return Array.isArray(values) && values.length ? values.map(v => typeof v === 'string' ? v : v.name).filter(Boolean) : [song[field]].filter(Boolean);
}
export function matchesPreference(song, values, field) {
  const norm = field === 'genre' ? normalizeGenre : normalize;
  const wanted = new Set((values || []).map(norm));
  return valuesFor(song, field).some(value => !['unknown', 'unknown artist', 'various'].includes(norm(value)) && wanted.has(norm(value)));
}

export function cleanTrack(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid track.');
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const artist = typeof raw.artist === 'string' ? raw.artist.trim() : '';
  if (!title || title.length > 500 || !artist || artist.length > 1000) throw new Error('Track needs a valid title and artist.');
  const scores = (value, allowed) => Object.fromEntries(Object.entries(value || {}).filter(([key, score]) => allowed.includes(key) && Number.isFinite(score) && score > 0 && score <= 1));
  const moodScores = scores(raw.moodScores, moods), activityScores = scores(raw.activityScores, activities);
  const artists = Array.isArray(raw.artists) && raw.artists.length ? raw.artists.map(v => typeof v === 'string' ? v.trim() : { id: v.id || null, name: v.name?.trim() }).filter(v => typeof v === 'string' ? v : v.name) : [artist];
  const genres = [...new Set(valuesFor(raw, 'genre').map(normalizeGenre))].filter(v => v && v !== 'unknown');
  const issues = [];
  if (normalize(artist) === 'unknown artist' || normalize(artist) === 'various') issues.push('Unresolved recording artists');
  if (raw.source === 'Discogs' && !raw.isCatalog && !/^\d+:.+$/.test(raw.discogsId || '')) issues.push('Legacy release imported as a track');
  if (!Object.keys(moodScores).length || !Object.keys(activityScores).length) issues.push('Missing context labels');
  return { ...raw, title, artist, artists, genres, genre: raw.genre && normalize(raw.genre) !== 'unknown' ? raw.genre : genres[0] || 'Unknown', language: raw.language || 'Unknown',
    duration: Number.isFinite(raw.duration) && raw.duration > 0 ? raw.duration : null,
    moodScores, activityScores, qualityIssues: issues,
    catalogStatus: issues.some(v => v !== 'Missing context labels') ? 'needs_review' : issues.length ? 'pending' : 'ready',
    labelVersion: raw.labelVersion || 1,
    tagSource: raw.labelsReviewed ? raw.labelSource || 'Reviewed' : raw.tagSource || 'Unclassified',
  };
}

// Never merge titles alone, or infer that a remix/live version is the original.
export function recordingFingerprint(song) {
  if (!Number.isFinite(song.duration) || !song.duration || !song.artist || normalize(song.artist).includes('unknown')) return null;
  return JSON.stringify([normalize(song.title), valuesFor(song, 'artist').map(normalize).sort(), Math.round(song.duration)]);
}
