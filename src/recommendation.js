import { matchesPreference, valuesFor, normalize } from './catalogQuality.js';
export const DEFAULT_WEIGHTS = Object.freeze({ mood: .20, activity: .20, genre: .18, artist: .18, language: .12, history: .08, feedback: .04 });
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : .5;
const prefMatch = (song, prefs, field) => (prefs[`${field}s`] || []).length ? Number(matchesPreference(song, prefs[`${field}s`], field)) : .5;

/** Pure, deterministic, inspectable recommendation engine. No ML claims. */
export function recommend({ songs, mood = null, activity = null, preferences = {}, ratings = [], limit = 10, weights = DEFAULT_WEIGHTS }) {
  if (!Object.keys(DEFAULT_WEIGHTS).every(k => Number.isFinite(weights[k]) && weights[k] >= 0) || Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) > .00001) throw new Error('Weights must be non-negative and sum to 1.');
  const contextual = songs.filter(s => !['needs_review', 'rejected'].includes(s.catalogStatus) && (!mood || s.moodScores?.[mood] > 0) && (!activity || s.activityScores?.[activity] > 0));
  const active = ['language', 'artist', 'genre'].filter(k => preferences[`${k}s`]?.length);
  const relaxed = [];
  // Language is required by default. Artist and genre are ranking preferences.
  const required = preferences.required || ['language'];
  // Surface favorite recordings awaiting labels separately from contextual recommendations.
  const unclassifiedFavorites = songs.filter(song => {
    if (!mood && !activity || ['needs_review', 'rejected'].includes(song.catalogStatus)) return false;
    const favorites = preferences.artists?.length ? matchesPreference(song, preferences.artists, 'artist') : preferences.genres?.length && matchesPreference(song, preferences.genres, 'genre');
    if (!favorites) return false;
    for (const field of active.filter(k => required.includes(k))) {
      const known = valuesFor(song, field).some(v => !['unknown', 'unknown artist'].includes(normalize(v)));
      if (known && !matchesPreference(song, preferences[`${field}s`], field)) return false;
    }
    const missingMood = mood && !Object.keys(song.moodScores || {}).length;
    const missingActivity = activity && !Object.keys(song.activityScores || {}).length;
    if (mood && !missingMood && !(song.moodScores?.[mood] > 0)) return false;
    if (activity && !missingActivity && !(song.activityScores?.[activity] > 0)) return false;
    return missingMood || missingActivity;
  }).map(song => ({ ...song, missingLabels: [mood && !Object.keys(song.moodScores || {}).length ? 'mood' : null, activity && !Object.keys(song.activityScores || {}).length ? 'activity' : null].filter(Boolean) }));
  const candidates = contextual.filter(s => active.filter(k => required.includes(k)).every(k => matchesPreference(s, preferences[`${k}s`], k)));
  const rated = ratings.map(r => ({ ...r, song: songs.find(s => s.id === r.song_id) })).filter(r => r.song);
  const ranked = candidates.map(song => {
    const related = rated.filter(r => matchesPreference(song, valuesFor(r.song, 'genre'), 'genre') || matchesPreference(song, valuesFor(r.song, 'artist'), 'artist'));
    const direct = rated.filter(r => r.song.id === song.id);
    const signals = direct.length ? direct : related;
    const components = {
      mood: mood ? song.moodScores[mood] || 0 : .5,
      activity: activity ? song.activityScores[activity] || 0 : .5,
      genre: prefMatch(song, preferences, 'genre'),
      artist: prefMatch(song, preferences, 'artist'),
      language: prefMatch(song, preferences, 'language'),
      history: mean(signals.map(r => (r.score - 1) / 4)),
      // Explicit helpful/not-helpful feedback; free text is stored, not analyzed.
      feedback: mean(signals.filter(r => [0, 1].includes(r.helpful)).map(r => r.helpful)),
    };
    const score = Object.entries(components).reduce((sum, [k, v]) => sum + weights[k] * v, 0);
    const reasons = [];
    if (mood) reasons.push(`${mood}: ${song.tagSource || 'catalog'} mood tag`);
    if (activity) reasons.push(`${activity}: ${song.tagSource || 'catalog'} activity tag`);
    for (const k of ['genre', 'artist', 'language']) if (components[k] === 1) reasons.push(`Preferred ${k}`);
    if (related.length) reasons.push('Shaped by your ratings');
    if (!reasons.length) reasons.push('Explore your catalog');
    const preferenceMatches = active.filter(k => components[k] === 1).length;
    return { ...song, score: Math.round(score * 1000) / 10, components, reasons, preferenceMatches, discovery: active.length > 0 && preferenceMatches === 0, rating: ratings.find(r => r.song_id === song.id)?.score || null };
  }).sort((a, b) => b.preferenceMatches - a.preferenceMatches || b.score - a.score || a.id - b.id);
  // Prefer at most two recordings per artist, then fill if the catalog is small.
  const counts = new Map(), selected = new Set();
  for (const song of ranked) {
    const artistKey = normalize(valuesFor(song, 'artist')[0]);
    if (selected.size < limit && (counts.get(artistKey) || 0) < 2 && !song.discovery) {
      selected.add(song.id); counts.set(artistKey,(counts.get(artistKey) || 0)+1);
    }
  }
  for (const song of ranked) { if (selected.size < limit && !song.discovery) selected.add(song.id); }
  for (const song of ranked) {
    const artistKey = normalize(valuesFor(song, 'artist')[0]);
    if (selected.size < limit && song.discovery && (counts.get(artistKey) || 0) < 2) {
      selected.add(song.id); counts.set(artistKey, (counts.get(artistKey) || 0) + 1);
    }
  }
  for (const song of ranked) { if (selected.size < limit) selected.add(song.id); }
  const results = ranked.filter(s=>selected.has(s.id));
  const notices = [];
  if (!mood) notices.push('No mood selected: using a neutral context.');
  if (!activity) notices.push('No activity selected: showing general-purpose recommendations.');
  if (preferences.languages?.length && required.includes('language')) notices.push('Selected languages are required. Change this in Music preferences to broaden results.');
  const discoveryCount = results.filter(s => s.discovery).length;
  if (unclassifiedFavorites.length) notices.push(`${unclassifiedFavorites.length} favorite tracks need context tags. They appear separately below so you can tag them or explore without a mood and activity.`);
  if (discoveryCount) notices.push(discoveryCount === results.length && preferences.artists?.length ? 'None of your preferred artists have eligible tracks for this moment yet. These suggestions are from other artists.' : `${discoveryCount} suggestions broaden your artist and genre preferences.`);
  if (results.length < limit) notices.push(`Only ${results.length} songs match this mood and activity. These selections have been kept.`);
  const unclassified = songs.filter(s=>(mood && !Object.keys(s.moodScores || {}).length) || (activity && !Object.keys(s.activityScores || {}).length)).length;
  if (unclassified && !unclassifiedFavorites.length) notices.push(`${unclassified} tracks need context tags before they can match this moment.`);
  return { songs: results, unclassifiedFavorites: unclassifiedFavorites.slice(0, limit), unclassifiedFavoriteCount: unclassifiedFavorites.length, relaxed, notices, discoveryCount, candidateCount: candidates.length, weights, context: { mood, activity } };
}
