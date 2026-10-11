import { moods, activities } from './catalog.js';
import { normalize, valuesFor } from './catalogQuality.js';

const languages = { hin: 'Hindi', pan: 'Punjabi', tam: 'Tamil', eng: 'English', ben: 'Bengali', tel: 'Telugu', mal: 'Malayalam', mar: 'Marathi', guj: 'Gujarati', kan: 'Kannada', spa: 'Spanish', kor: 'Korean', zxx: 'Instrumental' };

/** Direct recording tags only: no artist-country, album-language, or genre-to-mood guesses. */
export function enrichTrack(raw, { now = Date.now(), minTagVotes = 3 } = {}) {
  const evidence = [];
  const context = (allowed, kind) => {
    const scores = {};
    for (const tag of raw.providerTags || []) {
      const value = allowed.find(label => normalize(label) === normalize(tag.name));
      if (!value || !Number.isInteger(tag.count) || tag.count < minTagVotes) continue;
      // Vote strength is a ranking signal, not a calibrated confidence probability.
      scores[value] = Math.max(scores[value] || 0, Math.min(.9, tag.count / (tag.count + 2)));
      evidence.push({ kind, value, source: raw.source, votes: tag.count, sourceUrl: raw.sourceUrl });
    }
    return scores;
  };
  const moodScores = context(moods, 'mood'), activityScores = context(activities, 'activity');
  const workCodes = [...new Set((raw.workLanguages || []).filter(Boolean))];
  const workLanguage = workCodes.length === 1 ? languages[workCodes[0]] : null;
  if (workLanguage) evidence.push({ kind: 'language', value: workLanguage, source: 'MusicBrainz linked work', workIds: raw.workIds || [] });
  return { ...raw,
    language: raw.language && normalize(raw.language) !== 'unknown' ? raw.language : workLanguage || 'Unknown',
    moodScores: { ...moodScores, ...(raw.moodScores || {}) }, activityScores: { ...activityScores, ...(raw.activityScores || {}) },
    labelSource: evidence.some(e => e.kind !== 'language') ? 'MusicBrainz recording community tags' : raw.labelSource,
    tagSource: evidence.some(e => e.kind !== 'language') ? 'Community tags' : raw.tagSource,
    labelEvidence: evidence, enrichedAt: new Date(now).toISOString(), enrichmentVersion: 1,
  };
}

export function reviewDraft(song, sourceKey) {
  return { sourceKey, title: song.title, artists: valuesFor(song, 'artist'), duration: song.duration, album: song.album || null, year: song.year || null, sourceUrl: song.sourceUrl || null,
    language: song.language || 'Unknown', moodScores: song.moodScores || {}, activityScores: song.activityScores || {},
    labelEvidence: song.labelEvidence || [], labelSource: '', labelsReviewed: false, labelVersion: song.labelVersion || 1 };
}
