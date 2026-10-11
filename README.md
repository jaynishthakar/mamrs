# MAMRS

**Mood and Action-Based Music Recommendation System** is a web application for discovering songs that fit a listener's mood, activity, preferred artists, genres and languages. Recommendations include explanations and respond to personal ratings and helpfulness feedback.

[Live application](https://mamrs.jaynishthakar.tech) · [Four-minute demonstration](https://drive.google.com/drive/folders/1OPB9C-5W27d4q_Sq22MXLoxTjYFJRuwk?usp=sharing) · [Project report](output/pdf/MAMRS_Project_Implementation_Report.pdf)

## Features

- Account registration, sign-in and private saved preferences.
- Mood and activity recommendations with required language preferences, favorite artist and genre matching, and artist diversity.
- Track explanations, 1–5 ratings, comments and helpful/unhelpful feedback.
- Editable playlists: create a playlist, search the library or providers, add tracks, remove tracks and delete a playlist.
- Saved recommendation mixes and recent recommendation history.
- MusicBrainz and Discogs discovery, structured artist credits and personal context tags.
- Persistent ingestion jobs, duplicate detection, evidence-based label enrichment, quarantine, review and shared catalog publication.
- SQLite for local development and PostgreSQL support for Supabase-backed deployment.

MAMRS recommends song metadata. It does not stream, preview, download or host audio. The ranking engine is a deterministic content-based baseline, not a trained machine learning model.

## Local setup

Use **Node.js 22.21 or newer**; Node 22.21 is the version configured for Render. SQLite may print an experimental-feature warning on Node 22.

```bash
git clone https://github.com/jaynishthakar/mamrs.git
cd mamrs
npm ci
npm start
```

Open [localhost:3000](http://localhost:3000) and create an account. Without `DATABASE_URL`, data is stored in `data/mamrs.sqlite`. No provider credentials are required for the current metadata adapters.

For automatic server restarts during development:

```bash
npm run dev
```

If another app or agent is already using port 3000, start a separate instance on a different port in PowerShell:

```powershell
$env:PORT = "3001"
npm start
```

## Using the application

1. Save favorite artists, genres and languages in Music preferences.
2. Select a mood and activity on Discover and generate recommendations.
3. Read **Why this track?**, submit ratings and helpfulness feedback, and generate another mix.
4. Save a mix or create an editable playlist in Playlists. Search for tracks and add or remove them as needed.
5. Import artist recordings in Your catalog. Add personal context tags to unlabeled tracks, or explore them without a context.

Selected mood and activity constraints stay strict. Language is required by default unless opened to discovery. Eligible tracks with more artist/genre/language preference matches rank ahead of those with fewer matches; scoring orders ties. The engine prefers up to two tracks per credited artist before filling a small result set. Scores are ranking points, not probabilities.

Unlabeled imported favorites appear separately as awaiting context tags. They are not claimed to match a selected context or included in a saved contextual mix. Personal labels remain private; reviewed shared labels use the publication workflow below.

## Catalog ingestion

The bundled catalog contains editorial metadata and subjective context labels. Provider discovery expands recording coverage but is not ordered by popularity and does not guarantee Spotify availability or comprehensive coverage. The configured expansion starts with Hindi, Punjabi and Tamil artists, alongside global English artists.

```text
Artist configuration / recording imports
  → persistent jobs → provider discovery
  → recording validation and identity deduplication
  → metadata and label enrichment
  → ready recordings published to the shared catalog
  → pending recordings exported for human review
  → malformed records quarantined with an error reason
```

Run from the repository root:

```bash
npm run ingest -- seed config/catalog-artists.india.json
npm run ingest -- enrich
npm run ingest -- run 20
npm run ingest -- status
```

For ongoing ingestion, run a separate worker:

```bash
npm run ingest -- watch 20 60
```

It processes bounded batches of up to 20 jobs, waiting 60 seconds between batches. Jobs persist across restarts, recover expired claims and retry transient failures with backoff. Do not run the legacy `catalog:sync` worker alongside it. Shared provider quotas still apply across app processes.

When automatic label evidence is missing:

```bash
npm run ingest -- review data/catalog-review.json
# Review entries, supply context labels and labelSource, then mark reviewed entries.
npm run ingest -- publish data/catalog-review.json
```

Publication validates the selected batch before applying labels. Provider refreshes preserve reviewed labels. Moods and languages are not guessed from song titles, artist nationality or genre. Ambiguous artist names require a pinned provider `artistId` in the configuration.

See [Ingestion pipeline](docs/INGESTION_PIPELINE.md) for label evidence, recording-file imports, refreshes and worker operation, and [Catalog workflow](docs/CATALOG_WORKFLOW.md) for cleanup and database details. Back up an existing database before applying catalog cleanup.

## Configuration

Set environment variables in your shell or deployment environment. `npm start` does not automatically read a `.env` file. To load one explicitly, use `node --env-file=.env src/server.js`; keep the file private.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port; Render supplies its own port. |
| `HOST` | `127.0.0.1` locally; `0.0.0.0` when `PORT` is set | Server bind address. |
| `DATABASE_URL` | Unset | PostgreSQL connection string; takes precedence over SQLite. |
| `DATABASE_PATH` | `data/mamrs.sqlite` for the server | Local SQLite path. |
| `COOKIE_SECURE` | `false` | Set `true` for an HTTPS deployment. |
| `MUSICBRAINZ_USER_AGENT` | Project name/version and repository URL | Provider identification; use your deployment contact. |
| `DISCOGS_USER_AGENT` | Project name/version and repository URL | Discogs request identification. |
| `CATALOG_REFRESH` | `false` | Set `true` for an intentional discovery/enrichment refresh pass. |

## Render and Supabase deployment

The [Render blueprint](render.yaml) targets **main**, installs locked dependencies with `npm ci`, starts the app with `npm start`, and checks `/api/health`.

For an existing Render service currently tracking `feat/supabase-postgres-deployment`:

1. Change the service's deployment branch to **main** in Render settings after the consolidated changes are pushed.
2. Set the build command to `npm ci` and start command to `npm start`; use Node `22.21.0` or newer.
3. Keep the existing Supabase `DATABASE_URL` secret. Set `COOKIE_SECURE=true` and `HOST=0.0.0.0`. Let Render provide `PORT`.
4. Deploy the latest commit from main. Confirm the deploy log shows the expected commit and `/api/health` returns `{"ok":true}`.
5. Sign in and verify Playlists, adding/removing tracks, saving mixes, preferences and feedback on the deployed site.

Editing `render.yaml` does not by itself switch an existing manually configured service's branch. The existing Supabase database is selected through `DATABASE_URL`; schema initialization adds required tables and the playlist `kind` column without resetting account data. Back up the database before upgrading, and validate the deployment against your live PostgreSQL connection.

For dynamic catalog updates, configure a separate worker or scheduled job with the **same `DATABASE_URL`** and run `npm run ingest -- watch 20 60`, or periodically run `npm run ingest -- run 20`. The web blueprint does not provision this worker. A Render service's local SQLite file is not a substitute for durable production database storage.

## Tests

```bash
npm test
```

The test command runs the current `test/*.test.js` suite only, excluding ignored copies of earlier prototypes. Tests cover recommendation constraints and feedback, playlist ownership and editing, authentication and persistence, provider metadata mapping, ingestion and retry behavior, reviewed labels and PostgreSQL transaction isolation. Provider requests and PostgreSQL transaction tests use fixtures; they do not prove live provider or Supabase connectivity.

## Repository structure

| Path | Responsibility |
| --- | --- |
| `public/` | Browser UI, preferences, catalog, playlists and feedback dialogs. |
| `src/server.js` | HTTP API, authentication, validation and ownership checks. |
| `src/recommendation.js` | Context filtering, preference ranking, feedback and diversity. |
| `src/database.js`, `src/pgDatabase.js` | SQLite and PostgreSQL storage adapters. |
| `src/musicbrainz.js`, `src/discogs.js` | Provider discovery and recording metadata. |
| `src/ingestion.js`, `src/catalogQuality.js` | Staging, identity matching and metadata quality. |
| `src/catalogPipeline.js`, `src/pipelineQueue.js`, `src/trackEnrichment.js` | Persistent jobs, enrichment, review and publication. |
| `scripts/ingest.js`, `config/` | Ingestion CLI and artist configuration. |
| `test/` | Automated tests for the current application. |
| `docs/` | Catalog, ingestion, core module and demonstration documentation. |

## Scope and next steps

The application does not implement automatic mood detection, collaborative filtering, comment sentiment analysis, Spotify-wide coverage or popularity charts. Very large catalogs need indexed database candidate retrieval and paginated options. Recommendation accuracy and production load performance have not been measured.

The next priorities are reviewed catalog expansion, permitted popularity data and Spotify availability resolution, deployment validation, and evaluation of preference match rates and label quality with users.

## Project team

Department of Computer Engineering, Sardar Patel Institute of Technology

| Name | UID | Division | Batch |
| --- | --- | --- | --- |
| Jaynish Thakar | 2024300260 | D | B |
| Lavya Surana | 2024300251 | D | B |

[Core module implementation](docs/CORE_MODULES.md) · [Demo script](docs/DEMO_SCRIPT.md) · [Demo instructions](docs/DEMO_README.md)
