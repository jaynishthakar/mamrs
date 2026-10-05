// Fictional metadata and locally synthesized previews, not commercial recordings.
export const moods = ['Happy', 'Sad', 'Relaxed', 'Energetic', 'Romantic', 'Stressed'];
export const activities = ['Study', 'Workout', 'Driving', 'Party', 'Sleep', 'Meditation'];
const collections = [
  ['Paper Lanterns', 'Quiet Pages', 'Lo-fi', 76],
  ['Electric Motion', 'Pulse Theory', 'Electronic', 138],
  ['Open Roads', 'Westbound', 'Indie', 104],
  ['After Hours', 'Neon Club', 'Pop', 124],
  ['Moonlit Windows', 'Luna Field', 'Ambient', 58],
  ['Still Water', 'Asha Grove', 'Acoustic', 64],
];
const titles = ['First Light', 'Soft Focus', 'Golden Hour', 'Slow Bloom', 'Blue Skies', 'Drifting', 'Daydream', 'New Horizons', 'Warm Nights', 'Small Wonders', 'Silver Lining', 'Home Again', 'Quiet Sparks', 'Cloud Nine', 'Sunlit', 'In the Moment', 'Wildflowers', 'Weightless', 'Afterglow', 'Distant Stars', 'A Little Closer', 'Deep Breath', 'Stay Awhile', 'One More Day'];
export const catalog = collections.flatMap(([album, artist, genre, bpm], a) => titles.map((title, i) => ({
  id: a * titles.length + i + 1,
  title: `${title} / ${a + 1}`,
  artist, album, genre,
  language: ['Instrumental', 'English', 'Hindi', 'Tamil'][i % 4],
  duration: 150 + ((i * 13 + a * 7) % 130),
  year: 2024 + i % 3,
  bpm: bpm + (i % 5) * 2,
  moodScores: Object.fromEntries(moods.map((m, j) => [m, ((i + j) % 6) < 3 ? 0.6 + ((i + j) % 3) * 0.2 : 0])),
  activityScores: { [activities[a]]: 1 },
  color: ['sage', 'coral', 'sand', 'violet', 'blue', 'rose'][a],
  previewUrl: `/api/previews/${a * titles.length + i + 1}.wav`,
  demo: true,
})));
export const options = {
  moods, activities,
  genres: [...new Set(catalog.map(s => s.genre))],
  artists: [...new Set(catalog.map(s => s.artist))],
  languages: [...new Set(catalog.map(s => s.language))],
};
