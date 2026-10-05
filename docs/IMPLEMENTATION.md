# Recommendation-only core module

## Current scope

MAMRS retains its existing visual design and account flow while replacing synthetic recordings and audio previews with real metadata discovery. There is no player, audio generator, preview endpoint or playback action API. Saved mixes are lists of recommendations.

Implemented: registration/login/logout, preferences, contextual recommendations, artist discovery/import, per-user catalog browsing/search, personal context tags, explainable scores, ratings/helpfulness, saved mixes and recommendation history. Deferred: trained ML, automatic mood detection, catalog administration, playlist item editing, public deployment and relevance evaluation.

## Data flow

1. Search an artist through the server-side MusicBrainz adapter. User selects the correct artist identity.
2. Browse up to 50 recordings per page and persist recording metadata. A unique MBID mapping prevents repeated provider imports. User-to-song associations keep imported collections separate.
3. Apply account-specific mood/activity annotations over base metadata. Missing context labels remain unknown.
4. Filter against every selected context. Never silently replace a selected mood/activity.
5. Apply preferences, relaxing language → artist → genre filters if fewer than ten candidates remain. Preferences still contribute to score.
6. Score mood (.28), activity (.25), genre (.12), artist (.10), language (.08), rating history (.12), and helpful feedback (.05). Neutral components use .5. Explicit track feedback overrides related feedback; unrelated Unknown genres do not create similarity.
7. Select with a soft two-per-credited-artist diversity cap, fill remaining slots if necessary, then display the chosen tracks in score order. Credit strings are currently used for artist matching; collaborators are not normalized into separate preference identities.
8. Store the result snapshot, and support ratings and saved mixes. A rating requires a prior recommendation for that account.

Personal tags take precedence over editorial tags and are never shared with other accounts. A context that is not tagged is excluded when that context is selected, with an explanation and guidance to tag tracks or clear context. No popularity, mood quality, language or audio characteristics are invented for imported recordings.

## API

All routes except health, login and registration require the session cookie. Mutations require `X-MAMRS-Request: 1`, JSON bodies, and (when authenticated) the session's `X-CSRF-Token`. Existing origin checks and ownership restrictions remain.

| Method | Route | Input / purpose |
| --- | --- | --- |
| POST | `/api/register` | `{name,email,password}` |
| POST | `/api/login` | `{email,password}` |
| POST | `/api/logout` | Revoke session |
| GET | `/api/me` | User/preferences/CSRF token |
| GET | `/api/options` | Per-user catalog preference values and taxonomy |
| PUT | `/api/preferences` | `{genres:[],artists:[],languages:[]}` |
| GET | `/api/artists?q=...` | MusicBrainz artist candidates, two-character minimum |
| POST | `/api/catalog/import` | `{artistId,offset?:0}`; returns added count, total and nextOffset |
| GET | `/api/catalog?q=...&offset=0` | Local per-user catalog, 50-item pages |
| PUT | `/api/annotations` | `{songId,moods:[],activities:[]}`; replace personal labels |
| POST | `/api/recommendations` | `{mood:null|string,activity:null|string}` |
| GET | `/api/history` | Last 30 recommendation contexts |
| POST | `/api/ratings` | `{songId,score,comment?,helpful?:0|1|null}` |
| GET | `/api/ratings` | Personal rating history |
| POST | `/api/playlists` | `{name,songIds:[...]}` |
| GET | `/api/playlists` | Personal saved mixes |
| DELETE | `/api/playlists/:id` | Ownership-checked deletion |
| GET | `/api/health` | Liveness |

`/api/previews/:id.wav` and `/api/actions` now return 404 after authentication. The CSP disallows media sources. Source arrows link to MusicBrainz metadata/search pages.

## Persistence

Existing users, sessions, songs, taxonomy, recommendations, ratings, actions, playlists and playlist_songs tables remain. New tables:

- `provider_songs`: unique recording MBID → local song ID.
- `user_songs`: account → imported song membership.
- `annotations`: account/song → personal mood and activity arrays.

Imports run in a transaction after provider retrieval. Reimporting does not duplicate membership or overwrite personal tags. The old synthetic catalog remains for historical references only. Starter IDs begin at 1001, avoiding the original 1–144 IDs. Provider IDs are allocated above the existing maximum. No destructive migration is required for the previous demo schema.

## Provider behavior

Use MusicBrainz's documented artist search and artist-linked recording browse endpoints with JSON and `artist-credits+genres`. Requests use an identifying User-Agent, one shared per-process queue, a 1.1-second minimum interval, ten-second fetch timeout, at most twelve distinct queued/in-flight calls, and a bounded ten-minute cache. Concurrent identical requests share one promise. Failed calls are not cached. The UI offers retry and keeps the local collection operational during outages.

Artist search has a ten-result limit; refine the name for ambiguous matches. Recording pages may contain alternate versions and have no popularity guarantee. MBID deduplication does not merge editorial starter entries with imported recordings. Language stays Unknown, and context tags stay empty until supplied by the user. Genres are optional recording-level MusicBrainz metadata.

## Verification

`npm test`: 13 passing tests. Coverage includes context constraints, fallback order, diversity, direct/related feedback, missing metadata, import pagination and idempotence, private catalog/tag access, invalid provider input, upstream failures/cache/request spacing, login/CSRF and persisted user data. An integration fixture also verifies old saved songs remain readable and are excluded from new recommendations.

`node --check public/app.js` and `node --check src/server.js` pass. Live MusicBrainz access failed from the build environment. No browser executable was available, so a desktop/mobile walkthrough is still required.

Suggested walkthrough: create account → generate starter suggestions → search/import an artist → filter Your catalog → add personal tags → select favorite artist → generate matching context → inspect explanations → rate → save/reopen a mix → sign out/in. Confirm a second account cannot see imports/tags until independently imported, and that no playback controls exist.

## Next recommendation work

Collect a small evaluation set of familiar songs and user-labeled contexts; measure whether relevant tracks reach the top ten and track artist coverage. Add normalized artist identities, calibrated tag coverage and optional exploration controls before considering learned models. No recommendation-accuracy or 1,000-session performance claim is made.
