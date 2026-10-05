# MAMRS

Mood and Action-Based Music Recommendation System. A working academic prototype of the **Get Recommended Songs** core module, with a responsive frontend and persistent accounts.

## Run locally

Install **Node.js 24 or newer**. No npm dependencies or music-provider API keys are required.

Clone the implementation branch, then start the app:

```bash
git clone --branch feat/core-recommendations https://github.com/jaynishthakar/mamrs.git
cd mamrs
npm start
```

If you downloaded the source archive instead, extract it and run `npm start` inside its `mamrs` folder.

Open **http://localhost:3000**. Create an account, select a mood and activity, and click **Find my music**. Accounts, preferences, ratings, recommendation history and saved mixes persist in `data/mamrs.sqlite`, created on first start.

```bash
npm test         # recommendation and HTTP/database integration tests
npm run dev      # restart server when source changes
```

The default listener is local-only. Optional environment settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind interface |
| `DATABASE_PATH` | `data/mamrs.sqlite` | SQLite file |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |

Example on Ubuntu: `PORT=3001 npm start`. Stop with Ctrl+C. Never commit the database or personal data.

## What works

- Account registration, sign-in, sign-out, scrypt password hashing and server-side sessions.
- Six moods and six activities; neutral/general defaults are disclosed.
- Automatically refreshed recommendations after context changes.
- Persistent genre, artist and language preferences.
- Explainable weighted ranking with rating and helpful-feedback signals.
- SRS fallback order: language → artist → genre; selected mood/activity stay fixed.
- Up to ten results with metadata, relevance scores, explanations in desktop tooltips, and audio previews.
- 1–5 ratings, optional comments and explicit helpful/not-helpful feedback; updates affect subsequent rankings.
- Saved mixes: create from results, view, preview and delete; ownership enforced.
- Recommendation history and rating history, separately scoped to each account.
- Responsive UI, accessible controls, loading/error/empty states, retry actions and native audio controls.

## Demo catalog and audio

All **144 catalog entries are fictional**, generated from six activity collections. Language labels and mood relevance values are synthetic test metadata, not validated descriptions of real recordings. Each preview is an original eight-second synthesized instrumental motif generated locally. A Hindi/Tamil/English metadata label does **not** mean the demo preview contains vocals. Duration metadata describes a fictional full-length track, not the eight-second clip.

The UI labels this demo collection explicitly. No Spotify integration, commercial recordings, trained ML model, emotion recognition, or real-song recommendation quality is claimed.

## Stack and structure

- **Frontend:** semantic HTML, CSS and browser JavaScript modules.
- **Backend:** Node.js HTTP API; SQLite through built-in `node:sqlite`.
- **Storage:** relational tables for users, sessions, ratings, recommendation events and playlists; catalog metadata is stored as JSON per song.
- **Testing:** Node's built-in test runner. Zero third-party runtime dependencies.

```text
public/                  Responsive UI, account flow, player and dialogs
src/server.js            HTTP routes, validation, authentication and ownership
src/recommendation.js    Pure ranking and fallback logic
src/database.js          Schema creation and idempotent catalog seeding
src/catalog.js           Fictional catalog and category definitions
src/audio.js             Original synthesized WAV preview generator
test/                    Engine and API integration tests
docs/IMPLEMENTATION.md   Scope, requirements mapping, API and next steps
```

## Scope and deployment limits

This implements one demonstrable core flow, not the entire SRS. Playlist item editing, profile deletion, administrator tools, real music APIs, migrations and production deployment remain future work. Comments are stored but not processed with NLP; feedback changes score components, not dynamically learned global weights. SQLite calls are synchronous and this prototype has not been load-tested against the SRS's 1,000-session target.

Before public deployment, add an HTTPS reverse proxy, secure cookies, durable database backup, a production session/rate-limit store, migrations, recovery/email-verification flows and operational monitoring. The current in-memory authentication rate limit is intended for a single-process demo. Node 24 may display an experimental warning for `node:sqlite`; the tested runtime is Node 24.19.0.

See [implementation plan and requirements mapping](docs/IMPLEMENTATION.md).
