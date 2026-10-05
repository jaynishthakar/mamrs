# MAMRS

Mood and Action-Based Music Recommendation System: real song discovery, explainable recommendations, personal tags, ratings and saved mixes. **Recommendations only — no playback, previews, downloads or audio hosting.**

## Run

Install **Node.js 24 or newer**. No npm runtime dependencies or provider API keys are needed.

```bash
git clone --branch feat/core-recommendations https://github.com/jaynishthakar/mamrs.git
cd mamrs
npm start
```

Open **http://localhost:3000** and create an account. Data persists in `data/mamrs.sqlite`.

1. Choose a mood/activity on Discover, or leave them empty for general discovery.
2. Open **Your catalog**, search an artist, choose the correct MusicBrainz identity, and add recordings. Each click imports up to 50; continue with **Add next 50**.
3. Use **Edit tags** to classify imported tracks for your moods and activities. Imported metadata has no automatic mood labels. Untagged tracks participate only when the corresponding context is empty.
4. Choose favorite artists/genres/languages in **Music preferences**, then generate recommendations.
5. Inspect **Why this track?**, rate familiar tracks, and save a mix. The arrow beside a result opens its metadata source, not a player.

```bash
npm test
npm run dev
```

## Catalog and ranking

The offline starter collection contains **20 real song titles** with explicitly labeled, subjective editorial genre/language/context tags. It is a small starting point, not comprehensive artist coverage. Unknown duration, album and year stay unknown.

[MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) supplies artist and recording metadata. Imports are scoped to your account, deduplicated by recording MBID, and persisted locally. MusicBrainz pages are **not ordered by popularity**; live/remix/alternate recordings may appear. Starter entries have no asserted MBID, so an imported recording may overlap a starter title. Recording genre can be missing; language and mood are never inferred from artist nationality or song title.

Personal context tags replace the track's editorial/unclassified tags for your account only. Empty tag groups are unclassified. A Stressed tag means you want that track recommended when stressed. These are preferences, not therapeutic claims or measured audio features.

The engine keeps selected context constraints, ranks with preferences and feedback, and prefers up to two recordings per credited artist before filling a small result set. Language, artist, then genre filters are relaxed when needed, with visible notices. Scores are **ranking points, not probabilities**. Direct song feedback takes priority over related artist/genre feedback. Comments are stored but not analyzed. This is a deterministic content-based baseline, not trained ML or collaborative filtering.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind interface |
| `DATABASE_PATH` | `data/mamrs.sqlite` | Persistent SQLite file |
| `COOKIE_SECURE` | `false` | Set true behind HTTPS |
| `MUSICBRAINZ_USER_AGENT` | MAMRS version and repository URL | Identifying provider User-Agent; use your deployment contact |

MusicBrainz calls run server-side with an identifying User-Agent, a shared queue (at least 1.1 seconds between starts), ten-second fetch timeout, bounded queue, ten-minute cache, and coalescing of identical in-flight requests. Outages return a retryable error; saved recommendations need no provider connection. Run one app process; multiple instances require a shared provider limiter. Review [MusicBrainz API usage](https://musicbrainz.org/doc/MusicBrainz_API) and [data licensing](https://musicbrainz.org/doc/About/Data_License) before deployment.

## Storage and compatibility

The upgrade creates provider-mapping, user-catalog and personal-annotation tables without deleting existing accounts, ratings, history or saved mixes. Legacy fictional entries remain available in old saved mixes/ratings but are excluded from new recommendations. Existing preferences can be edited to use the new catalog. Back up the SQLite database before upgrading.

| File | Responsibility |
| --- | --- |
| `public/` | Responsive UI, artist discovery, personal tags, rating and mix dialogs |
| `src/server.js` | HTTP API, authentication, validation, ownership |
| `src/musicbrainz.js` | Provider queue, cache, artist search and recording mapping |
| `src/recommendation.js` | Pure ranking, context constraints, fallback and diversity |
| `src/database.js` | SQLite schema and idempotent starter seeding |
| `src/catalog.js` | Editorial starter metadata and category definitions |
| `test/` | Ranking, provider and HTTP/database tests |

## Validation and limits

All 13 automated tests pass on Node 24, covering ranking, privacy, authentication/CSRF, saved data, import pagination/deduplication, provider errors, tagging, and absence of playback endpoints. Provider tests use controlled fixtures. A live MusicBrainz request failed in the build environment, so live discovery must be checked on your deployment. Frontend JavaScript passes syntax checks; a browser walkthrough remains unverified because no Chromium executable is available here.

Before sharing publicly, use HTTPS, secure cookies, a durable database volume/backups, deployment rate limiting, account recovery and monitoring. The app has not been load-tested or evaluated for recommendation accuracy. SQLite and the in-memory request controls target a small single-process prototype.

See [implementation details](docs/IMPLEMENTATION.md).
