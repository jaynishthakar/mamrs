# Implemented core modules

The two central implemented modules to present are **Mood and Activity-Based Song Recommendation** and **Ratings and Feedback**. Authentication, preferences, catalog ingestion, playlists and saved mixes are implemented supporting capabilities; the project contains more than two working features.

This mapping is based on the current source and the earlier diagram traceability preserved in `mamrs-core-module/mamrs/docs/IMPLEMENTATION.md`, together with the earlier **Continue MAMRS Implementation Plan** chat. The original PDF diagrams are not present in this checkout. These are descriptive module names, not a claim that the diagrams use these exact headings. The current code uses JavaScript functions and database records rather than a literal class-per-diagram implementation.

| Core module | Diagram concepts from the earlier mapping | Current implementation | Demonstrated behavior |
| --- | --- | --- | --- |
| Mood and Activity-Based Song Recommendation | User / UserPreference, Mood, Activity, Song, RecommendationEngine, Recommendation | `src/recommendation.js:recommend()`, `POST /api/recommendations` in `src/server.js`, `generate()` in `public/app.js` | Select context; load preferences and ratings; filter candidates; prioritize preference matches; score and diversify; persist and display results with explanations. |
| Ratings and Feedback | User, Song, Rating / Feedback, RecommendationEngine | `POST /api/ratings`, `GET /api/ratings`, `ratings` table, history/feedback components in `recommend()` | Validate and save 1–5 ratings, optional comments and helpful/not-helpful feedback; refresh recommendations using the updated personal signals. |

## Sequence represented by the running application

1. User signs in and saves artist, genre and language preferences.
2. User selects a mood/activity and requests recommendations.
3. Server loads the user's accessible songs, preferences and ratings.
4. `recommend()` filters and ranks candidates; the server stores the recommendation snapshot.
5. UI displays song metadata, ranking points and reasons.
6. User rates a previously recommended song; the server validates and persists it.
7. UI requests refreshed recommendations; personal rating and helpfulness components change the score.

## Evidence from the recorded walkthrough

- A fresh, isolated in-memory database and a demo account were used; existing user data was not modified.
- Preferences: Bollywood, Arijit Singh and Hindi; required language enabled.
- Context: Romantic / Driving.
- Three eligible starter tracks; Tum Hi Ho ranks first.
- Tum Hi Ho changes from **86 to 92 points** after rating it **5/5** and marking it **helpful**, with the same context and preferences.
- No browser JavaScript errors were observed during the captured walkthrough.
- `node --test --test-reporter=dot`: **40 tests passed** (includes the ignored legacy demo tests discovered by Node's default test scan).
- Machine-readable before/after evidence: `data/demo/demo-evidence.json`.

## Completion boundaries

The recommendation engine is a deterministic content-based baseline. Rating history changes scoring components; it does not train a model or learn new weights. Comments are stored but not analyzed. Automatic mood detection, playback, comprehensive Spotify coverage, and measured recommendation accuracy are not implemented.

Earlier plans described relaxing language, artist, then genre. The current implementation instead preserves required preferences, defaults language to required, and orders candidates by preference-match count before score. The old `docs/IMPLEMENTATION.md` describes an earlier revision and should not be used as the current algorithm specification. See `docs/CATALOG_WORKFLOW.md` and `docs/INGESTION_PIPELINE.md` for the newer catalog behavior.

The ingestion worker is implemented, but broad live catalog coverage and Supabase deployment are not established by this demo. The video shows the catalog interface and describes the pipeline; it does not portray a live provider import or a Supabase upload.
