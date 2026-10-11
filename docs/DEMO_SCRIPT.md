# MAMRS — four-minute demo script

Duration: **4:00**. Twelve scenes; timings follow the narration with pauses for the on-screen actions.

The generated video is an edited walkthrough of actual app screenshots with synthetic English narration and captions. It uses an isolated test account and starter catalog. No live provider import is shown. Module names follow the earlier traceability and current source; the original diagram PDFs are not available in this checkout.

See [core module mapping](CORE_MODULES.md) for implementation evidence and limitations.

## 0:00–0:20 — Music for the moment

**On screen:** Mood + activity + preferences; Explainable recommendations; Local academic prototype.

Hello. Welcome to M A M R S, the Mood and Action Based Music Recommendation System. It helps you discover songs for your mood and activity, using your saved music preferences. Let me show you how it works.

## 0:20–0:39 — Two implemented core modules

**On screen:** 1. Contextual recommendations; 2. Ratings and feedback; Accounts and saved mixes support both.

The two core modules are contextual recommendations, and ratings and feedback. The first matches preferences, mood, and activity to songs. The second stores feedback and uses it to influence future recommendations.

## 0:39–0:59 — Save your music preferences

**On screen:** Artist: Arijit Singh; Genre: Bollywood; Language: Hindi; Required language remains enabled.

First, I choose Bollywood, Arijit Singh, and Hindi in Music preferences. These choices are saved for my account. Hindi remains a required language, while artist and genre matches help prioritize songs that suit my taste.

## 0:59–1:20 — Choose a mood and activity

**On screen:** Mood: Romantic; Activity: Driving; Both selected contexts must match.

Next, I select Romantic as my mood and Driving as my activity. When I request music, the server loads my preferences, available songs, and ratings. The engine checks both context tags before ranking eligible tracks.

## 1:20–1:41 — Inspect the ranked results

**On screen:** Tum Hi Ho ranks first; 3 eligible songs in this demo; Preference matches take priority.

Tum Hi Ho appears first, followed by other matching songs. Preference matches take priority, then ranking points determine the order. Three songs qualify in this small demo catalog, and the application explains why the result set is smaller.

## 1:41–2:02 — Understand why a song appears

**On screen:** Context and preference reasons; Editorial label provenance; Ranking points, not probability.

Why this track shows the context and preference matches behind each suggestion. Scores combine those signals with rating history and helpful feedback. They are rule based ranking points, rather than predictions from a trained machine learning model.

## 2:02–2:19 — Submit a rating and feedback

**On screen:** Rating: 5 out of 5; Helpful: Yes; Optional comment is stored.

Now I give Tum Hi Ho five stars and mark it helpful. I can also leave a comment. The server checks that this account received the song as a recommendation, then saves the rating and feedback.

## 2:19–2:38 — See the feedback loop work

**On screen:** Tum Hi Ho: 86 to 92 points; Same context and preferences; Configured weights stay fixed.

After the refresh, Tum Hi Ho rises from eighty six to ninety two points, with the same context and preferences. Feedback changes personal scoring components. Weights stay fixed, and comments are stored without sentiment analysis.

## 2:38–2:59 — Keep a recommendation snapshot

**On screen:** Save this mix; Name: Romantic drive; Reopen the saved song list.

I save these recommendations as Romantic drive, then reopen them from Saved mixes. This keeps a snapshot of the song list for later. The project currently focuses on discovery and recommendations, with no streaming or downloads.

## 2:59–3:19 — Revisit recent moments

**On screen:** Recommendation contexts are saved; Revisit a mood and activity; Account-specific history.

Recent moments stores recommendation contexts and timestamps. This follows the sequence: request songs, retrieve data, calculate results, save the event, and display recommendations. Revisiting a context generates a fresh mix.

## 3:19–3:41 — Grow a cleaner song catalog

**On screen:** MusicBrainz and Discogs adapters; Persistent ingestion and retry jobs; Missing labels require evidence or review.

Your catalog supports MusicBrainz and Discogs. The ingestion pipeline validates imports, removes duplicates, enriches metadata, and supports label review. Missing context labels stay unclassified until reliable evidence or review supplies them.

## 3:41–4:00 — What the prototype demonstrates

**On screen:** Working recommendation and feedback loop; Broader catalog and label review next; No claim of complete Spotify coverage.

The recommendation and feedback loop works, with forty tests passing. Next come broader catalog coverage, reviewed labels, and relevance evaluation. Full Spotify coverage remains future work. Thank you.
