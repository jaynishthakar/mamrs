# MAMRS implementation plan and module scope

## Decision

Build the **Get Recommended Songs** vertical slice first. It is the central behavior shared by the supplied SRS (sections 3.2–3.4 and 8), class diagram, sequence diagram, activity diagram and DFD process 3.0. Authentication, preferences and ratings provide the minimum surrounding behavior to demonstrate personalized output end to end.

The repository initially contained only a seven-byte README. The supplied PDFs were reviewed separately; they are not replaced or modified by this implementation.

The academic demo uses Node.js 24, SQLite and HTML/CSS/JavaScript. This keeps setup to one command and makes each layer readable for a lab presentation. The API can later serve a React frontend, and database access can move to PostgreSQL when shared hosting and concurrent use justify it. Neither change is required to demonstrate the core algorithm.

## Implemented flow

1. Register or sign in; load the user's saved preferences.
2. Select one mood and one activity, or accept neutral/general defaults.
3. Load catalog candidates with positive relevance to both selected contexts.
4. Apply saved language, artist and genre constraints.
5. If fewer than ten candidates remain, relax language, then artist, then genre. Stop once ten are available. Never relax the context silently.
6. Score candidates, sort descending, and use song ID as a deterministic tie-breaker.
7. Persist the recommendation event, contexts, timestamp and full ranking result.
8. Display up to ten tracks with metadata and score explanations.
9. Play a generated preview, submit a rating, save a mix, or change the context.
10. Use the user's ratings and explicit helpful feedback when ranking future candidates.

## Scoring

All components are in [0,1]. Configurable non-negative weights sum to one and are validated by the engine:

| Component | Weight | Initial implementation |
| --- | ---: | --- |
| Mood | .28 | Catalog mood relevance; .5 when no mood selected |
| Activity | .25 | Catalog activity relevance; .5 for general context |
| Genre | .12 | 1/0 preferred-genre match; .5 when no preference |
| Artist | .10 | 1/0 preferred-artist match; .5 when no preference |
| Language | .08 | 1/0 preferred-language match; .5 when no preference |
| Rating history | .12 | Mean normalized rating of songs sharing artist or genre; .5 cold start |
| Feedback | .05 | Mean explicit helpful signal for related songs; .5 cold start |

`score = 100 * sum(weight * component)`.

A rating from 1–5 is normalized with `(rating - 1) / 4`. Free-text comments are retained but not interpreted. These weights are an implementation choice consistent with the conceptual SRS equation, not prescribed values from the documents. Scores are relevance indices, not calibrated probabilities. The current prototype adjusts relevance components from personal feedback; it does not learn the weights themselves (FR-23 is partial).

## Traceability and honest completion status

| Requirements / model | Status | Code / behavior |
| --- | --- | --- |
| FR-01, FR-02: register and login/logout | Implemented supporting flow | `server.js`, scrypt, HTTP-only cookies, persistent sessions |
| FR-03 and preference updates in FR-04 | Implemented subset | Favorite genres, artists, languages; full profile deletion deferred |
| FR-05, FR-08: mood/activity selection | Implemented | Single selection per group, optional disclosed defaults |
| FR-06, FR-09: taxonomy administration | Partial | Data-driven taxonomy in DB; no admin interface |
| FR-07, FR-10: selection timestamps | Partial | Contexts timestamped when recommendations are generated; pre-generation clicks not individually logged |
| FR-11, FR-12, FR-14: ranking and context changes | Implemented against demo data | Candidate filtering, weighted ranking, automatic UI refresh |
| FR-13: historical ratings/feedback | Implemented | Account-specific related-song score components |
| Section 3.4.8: progressive fallback | Implemented | Language, artist, genre; user-visible notices |
| FR-15, FR-18, FR-20: playlist create/view/delete | Implemented supporting subset | Save the current result set, ownership-checked deletion |
| FR-16, FR-17, FR-19: playlist item and metadata editing | Deferred | Next playlist module increment |
| FR-21, FR-22, FR-24: ratings/comments/history | Implemented | Numeric ratings, comments, explicit helpful feedback, rating history |
| FR-23: dynamic preference weight adjustment | Partial | Personal history affects score components, weights stay configured |
| Sequence: generate → display → play → record action | Implemented for demo previews | Preview events recorded after browser playback starts |
| Activity: login → context → rank → result → repeat | Implemented | End-to-end frontend/API flow |
| DFD user profiles, song preferences, playlists, feedback stores | Implemented subset | SQLite tables and account ownership |
| NFR: under 3 seconds for 1,000 sessions | Not verified | Functional testing only; no concurrency/load claim |
| Production security/privacy and availability | Not complete | Public production hardening is a later gate |

## Classes and storage

| Diagram concept | Implementation |
| --- | --- |
| User / UserProfile / UserPreference | `users`, hashed password and JSON preference lists |
| RecommendationEngine | Pure `recommend()` function, independent of HTTP |
| Recommendation | `recommendations` with user, contexts, time and result snapshot |
| Song / Artist / Genre / Language / Album | Song metadata JSON inside `songs`; normalization deferred |
| Mood / Activity | `taxonomy` and catalog relevance maps |
| Rating / Feedback | One rating per user/song, optional text and helpful value |
| UserAction | `actions`, preview/rating events |
| Playlist / PlaylistSong | Relational playlist tables, stable song positions |

## API

All data routes except registration, login and health require the session cookie. Mutations require `X-MAMRS-Request: 1` and authenticated mutations also require `X-CSRF-Token` from login or `/api/me`. JSON bodies use `Content-Type: application/json`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/register` | `{name,email,password}`; starts a session |
| POST | `/api/login` | `{email,password}`; starts a session |
| POST | `/api/logout` | Revoke current session |
| GET | `/api/me` | Current user, preferences and CSRF token |
| GET | `/api/options` | Available taxonomy and preference values |
| PUT | `/api/preferences` | `{genres:[],artists:[],languages:[]}` |
| POST | `/api/recommendations` | `{mood:null|string,activity:null|string}` |
| GET | `/api/history` | Last 30 recommendation contexts |
| POST | `/api/ratings` | `{songId,score,comment?,helpful?:0|1|null}` |
| GET | `/api/ratings` | Current user's rating history |
| GET | `/api/previews/:id.wav` | Eight-second synthesized audio |
| POST | `/api/actions` | `{songId,type:"preview"}` |
| POST | `/api/playlists` | `{name,songIds:[...]}` |
| GET | `/api/playlists` | Current user's saved mixes |
| DELETE | `/api/playlists/:id` | Delete a mix owned by the session user |
| GET | `/api/health` | Liveness response |

Inputs are validated server-side. SQL uses prepared parameters. User-generated values are rendered with DOM `textContent`, not inserted as HTML. Other users cannot select a user ID in the API to access another account. Rating an unseen song is rejected. Session tokens are random, stored hashed, expire after seven days and are revoked on logout. Request origin checks, custom request headers and per-session CSRF tokens protect mutations. The demo binds only to loopback by default.

## Acceptance demo

1. Create an account. Select Relaxed + Study. Generate ten suggestions.
2. Select Hindi in preferences. Observe the broader-results notice when the language constraint has to be relaxed.
3. Change activity to Workout. Observe different candidates and updated labels.
4. Preview a track. Confirm the player identifies it as synthesized demo audio.
5. Rate a track and give helpful feedback. Observe refreshed scores and a persisted rating in Your ratings.
6. Save a named mix. Open Saved mixes, play a preview, then revisit a context through Recent moments.
7. Sign out and sign back in. Preferences, ratings and mixes remain.
8. Create a second account. Its playlists, history and ratings begin empty.

## Next increments

1. Replace fictional catalog metadata with a licensed real-song dataset; validate relevance tags and add provider-supplied preview URLs. Keep API credentials on the server. Verify the selected provider's current access and playback restrictions before implementation.
2. Complete playlist add/remove/rename and profile update/deletion flows, with ownership tests.
3. Add database migrations and admin taxonomy/catalog management. Normalize artists, genres, languages and mood/activity mappings when importing a real catalog.
4. Evaluate recommendation relevance with labeled examples. Tune weights and implement the full FR-23 learning behavior only with measurable acceptance criteria.
5. Prepare shared deployment: PostgreSQL if appropriate, HTTPS, secure cookies, backups, distributed rate limiting/session lifecycle, email verification/recovery, monitoring, and load testing against the SRS target.

Full audio streaming, automatic emotion recognition and trained collaborative filtering are outside this initial core module.

## Validation performed

`npm test` passed all seven tests on Node 24.19.0. The suite exercises context changes, ranking, ordered fallback, empty/default behavior, feedback effects, invalid weights, and a full HTTP lifecycle with persistent SQLite storage. The integration test checks registration/login/logout, input rejection, request/CSRF protection, unseen-song rating rejection, rating updates, generated WAV structure, preview action logging, playlist ownership, separate user histories, and persistence after server restart.

Frontend JavaScript passes `node --check`. A browser-driven desktop/mobile walkthrough was prepared, but Chromium was unavailable and its download failed in the execution environment. Consequently, visual layout, browser audio playback and the complete browser interaction flow have **not** been verified here. Use the acceptance-demo checklist above before presenting or deploying. No claim is made about load, real-catalog accuracy or production readiness.
