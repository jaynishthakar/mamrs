// Real song titles; genre, language and context labels are editorial starter data.
// These subjective labels are not MusicBrainz facts or audio analysis.
export const moods = ['Happy', 'Sad', 'Relaxed', 'Energetic', 'Romantic', 'Stressed'];
export const activities = ['Study', 'Workout', 'Driving', 'Party', 'Sleep', 'Meditation'];
const entries = [
  ['Tum Hi Ho', 'Arijit Singh', 'Hindi', 'Bollywood', ['Romantic','Sad'], ['Driving']],
  ['Channa Mereya', 'Arijit Singh', 'Hindi', 'Bollywood', ['Sad'], ['Driving']],
  ['Sun Raha Hai (Female Version)', 'Shreya Ghoshal', 'Hindi', 'Bollywood', ['Sad','Relaxed'], ['Study']],
  ['Saibo', 'Shreya Ghoshal & Tochi Raina', 'Hindi', 'Bollywood', ['Romantic','Relaxed'], ['Study','Driving']],
  ['Kun Faya Kun', 'A.R. Rahman, Javed Ali & Mohit Chauhan', 'Hindi', 'Bollywood', ['Relaxed','Stressed'], ['Meditation']],
  ['Jai Ho', 'Sukhwinder Singh, Tanvi Shah, Mahalakshmi Iyer & Vijay Prakash', 'Hindi', 'Bollywood', ['Happy','Energetic'], ['Workout','Party']],
  ['Sheila Ki Jawani', 'Sunidhi Chauhan & Vishal Dadlani', 'Hindi', 'Bollywood', ['Energetic'], ['Workout','Party']],
  ['Aaja Nachle', 'Sunidhi Chauhan', 'Hindi', 'Bollywood', ['Happy','Energetic'], ['Party']],
  ['Kal Ho Naa Ho', 'Sonu Nigam', 'Hindi', 'Bollywood', ['Sad','Romantic'], ['Driving']],
  ['Abhi Mujh Mein Kahin', 'Sonu Nigam', 'Hindi', 'Bollywood', ['Sad','Relaxed'], ['Study']],
  ['Yellow', 'Coldplay', 'English', 'Alternative rock', ['Romantic','Relaxed'], ['Driving','Study']],
  ['A Sky Full of Stars', 'Coldplay', 'English', 'Pop', ['Happy','Energetic'], ['Workout','Party']],
  ['Someone Like You', 'Adele', 'English', 'Pop', ['Sad','Relaxed'], ['Study']],
  ['Rolling in the Deep', 'Adele', 'English', 'Pop', ['Energetic'], ['Driving','Workout']],
  ['Levitating', 'Dua Lipa', 'English', 'Pop', ['Happy','Energetic'], ['Workout','Party']],
  ["Don't Start Now", 'Dua Lipa', 'English', 'Pop', ['Energetic'], ['Workout','Party']],
  ['Blinding Lights', 'The Weeknd', 'English', 'Pop', ['Energetic'], ['Driving','Workout']],
  ['Save Your Tears', 'The Weeknd', 'English', 'Pop', ['Sad'], ['Driving']],
  ['Shake It Off', 'Taylor Swift', 'English', 'Pop', ['Happy','Energetic'], ['Party','Workout']],
  ['Love Story', 'Taylor Swift', 'English', 'Country pop', ['Romantic','Happy'], ['Driving']],
];
export const catalog = entries.map(([title,artist,language,genre,ms,as],i) => ({
  id: 1001+i, title, artist, language, genre, album: null, duration: null, year: null,
  moodScores: Object.fromEntries(ms.map(m=>[m,.8])), activityScores: Object.fromEntries(as.map(a=>[a,.8])),
  color: ['sage','coral','sand','violet','blue','rose'][i%6], source: 'Editorial starter', tagSource: 'Editorial',
  sourceUrl: `https://musicbrainz.org/search?query=${encodeURIComponent(title+' '+artist)}&type=recording&method=indexed`,
}));
