# Song ingestion pipeline

```text
Artist configuration / recording files / app imports
    → persistent job queue
    → provider discovery → recording validation → identity deduplication
    → recording enrichment (credits, genres, ISRC, work language, context tags)
    → ready: publish to shared catalog
    → pending: export for human label review → publish
    → malformed: quarantine with original input and error
```

## Local commands

Run from the project directory. `DATABASE_PATH` selects a SQLite file; otherwise commands use `data/mamrs.sqlite`. `DATABASE_URL` selects PostgreSQL/Supabase instead. The existing schema is extended automatically without dropping user data.

```powershell
# Queue India-first artists; namesakes require an explicit artistId.
npm run ingest -- seed config/catalog-artists.india.json

# Queue existing unlabeled MusicBrainz imports, including Kishore Kumar.
npm run ingest -- enrich

# Process at most 20 jobs; rerun to continue.
npm run ingest -- run 20

# Or run continuously, processing up to 20 jobs every 60 seconds.
npm run ingest -- watch 20 60

# Inspect counts and recent errors.
npm run ingest -- status
```

`Ctrl+C` in watch mode allows the current bounded batch to finish before closing the database. Discovery, each provider page, and each recording enrichment are separate jobs. In-app imports automatically enqueue recording enrichment; keep the background worker running to process them. Newly discovered unlabeled recordings remain staged until context labels are available.

## Label enrichment

MusicBrainz recording details supply genre votes, structured credits, ISRCs and direct community tags. Exact mood/activity taxonomy tags with at least three positive votes produce context scores with recorded vote evidence. Scores express vote strength, not measured accuracy. Genre, artist country, and title are never used to guess a mood or language.

When exactly one performed work supplies one recognized lyrics-language code, it supplies a language label with linked-work provenance. Medleys, multiple languages and unknown codes remain unknown. Album text language is not used as the recording language. Community labels remain subjective and visible as such; operator-reviewed labels take precedence on subsequent provider refreshes.

Many recordings have no suitable community tags. They remain pending; running the worker does not guarantee automatic labels for every song. Discogs supplies recording credits and genre/style metadata but does not provide this context enrichment. Discogs records can use the same review/publication workflow.

## Review and publication

```powershell
npm run ingest -- review data/catalog-review.json
```

The exported records contain source keys, title, artists, duration, album, source link, existing labels and evidence. Fill `moodScores` and `activityScores` using the app's taxonomy, confirm language, enter a meaningful `labelSource`, and set `labelsReviewed` to `true` only on reviewed entries. Leave the rest false.

```powershell
npm run ingest -- publish data/catalog-review.json
```

Only entries marked reviewed are applied. The complete selected batch is validated before any label writes; individual publications use transactions. IDs, ratings, playlists and personal annotations remain attached. Publication requires valid recording metadata and at least one mood and activity label. Unknown language remains possible and cannot match a required language preference.

## Recording file imports

```powershell
npm run ingest -- import recordings.json
npm run ingest -- import recordings.jsonl
```

JSON files contain an array; JSONL contains one recording object per line. Supply a real `mbid` or Discogs `releaseId:position`, a `title`, an `artist`, optional structured `artists`, genres, duration, source and source link. Files are operator inputs; use metadata you have permission to use. Import files are bounded to 10 MB. Repeated imports reuse source identities. Invalid recording rows are quarantined without preventing valid rows in the batch from being staged. These imports don't publish directly; enrichment or reviewed labels handle publication.

## Queue reliability and deployment

Claims and the worker lock are persisted with a five-minute lease. Concurrent workers on the same database cannot claim the active worker lock. Expired jobs recover automatically, and claim tokens stop an obsolete worker from finalizing a newer claim. Transient failures retry with exponential backoff (30 seconds to one hour), up to five attempts. Provider `Retry-After` is respected. Identity/permission/not-found failures are retained for operator action instead of repeatedly retried. Every finished attempt records an event.

On the server, set `DATABASE_URL` securely, seed the configuration, and run `npm run ingest -- watch 20 60` as a background worker. Alternatively schedule `npm run ingest -- run 20` periodically. Don't run the legacy `catalog:sync` worker alongside this worker; it lacks the new lease/backoff workflow. Interactive imports and other apps share provider quotas too, so avoid simultaneous bulk imports from other processes.

To start a fresh discovery/enrichment pass for completed or failed jobs, set `CATALOG_REFRESH=true` while seeding/bootstraping and running the refresh pass. Refresh does not steal processing jobs. Existing mappings make re-imports idempotent; reviewed labels survive refresh.

Supabase scheduling and production execution require its connection configured in the deployment. This implementation does not provision a hosted worker, scrape Spotify, provide popularity rankings, or claim complete Spotify coverage.

## Source documentation

- [MusicBrainz API: tags, recording relationships, and rate limits](https://musicbrainz.org/doc/MusicBrainz_API)
- [MusicBrainz work lyrics languages](https://musicbrainz.org/doc/Work)
