export const DEFAULT_WEIGHTS = Object.freeze({ mood: .28, activity: .25, genre: .12, artist: .10, language: .08, history: .12, feedback: .05 });
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : .5;
const prefMatch = (song, prefs, field) => (prefs[`${field}s`] || []).length ? Number(prefs[`${field}s`].includes(song[field])) : .5;

/** Pure, deterministic, inspectable recommendation engine. No ML claims. */
export function recommend({ songs, mood = null, activity = null, preferences = {}, ratings = [], limit = 10, weights = DEFAULT_WEIGHTS }) {
  if (!Object.keys(DEFAULT_WEIGHTS).every(k => Number.isFinite(weights[k]) && weights[k] >= 0) || Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) > .00001) throw new Error('Weights must be non-negative and sum to 1.');
  const contextual = songs.filter(s => (!mood || s.moodScores[mood] > 0) && (!activity || s.activityScores[activity] > 0));
  const active = ['language', 'artist', 'genre'].filter(k => preferences[`${k}s`]?.length);
  const relaxed = [];
  const filter = () => contextual.filter(s => active.every(k => preferences[`${k}s`].includes(s[k])));
  let candidates = filter();
  // SRS 3.4.8: never silently relax the selected mood or activity.
  while (candidates.length < limit && active.length) {
    relaxed.push(active.shift());
    candidates = filter();
  }
  const rated = ratings.map(r => ({ ...r, song: songs.find(s => s.id === r.song_id) })).filter(r => r.song);
  const ranked = candidates.map(song => {
    const related = rated.filter(r => r.song.genre === song.genre || r.song.artist === song.artist);
    const components = {
      mood: mood ? song.moodScores[mood] || 0 : .5,
      activity: activity ? song.activityScores[activity] || 0 : .5,
      genre: prefMatch(song, preferences, 'genre'),
      artist: prefMatch(song, preferences, 'artist'),
      language: prefMatch(song, preferences, 'language'),
      history: mean(related.map(r => (r.score - 1) / 4)),
      // Explicit helpful/not-helpful feedback; free text is stored, not analyzed.
      feedback: mean(related.filter(r => r.helpful !== null).map(r => r.helpful)),
    };
    const score = Object.entries(components).reduce((sum, [k, v]) => sum + weights[k] * v, 0);
    const reasons = [];
    if (mood) reasons.push(`${mood} mood`);
    if (activity) reasons.push(`Made for ${activity.toLowerCase()}`);
    for (const k of ['genre', 'artist', 'language']) if (components[k] === 1) reasons.push(`Preferred ${k}`);
    if (related.length) reasons.push('Shaped by your ratings');
    if (!reasons.length) reasons.push('Explore the demo catalog');
    return { ...song, score: Math.round(score * 1000) / 10, components, reasons, rating: ratings.find(r => r.song_id === song.id)?.score || null };
  }).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, limit);
  const notices = [];
  if (!mood) notices.push('No mood selected: using a neutral context.');
  if (!activity) notices.push('No activity selected: showing general-purpose recommendations.');
  if (relaxed.length) notices.push(`Broader results: relaxed ${relaxed.join(', then ')} filters. Your preferences still influence ranking.`);
  if (ranked.length < limit) notices.push(`Only ${ranked.length} songs match this mood and activity. These selections have been kept.`);
  return { songs: ranked, relaxed, notices, candidateCount: candidates.length, weights, context: { mood, activity } };
}
