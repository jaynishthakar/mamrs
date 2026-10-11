# Catalog ingestion and recommendations

The persistent discovery/enrichment/review worker is now documented in [Song ingestion pipeline](INGESTION_PIPELINE.md). Use `npm run ingest` for new recurring ingestion; `catalog:sync` is the older page importer.

## Implemented behavior

Language selections are required by default; the preferences dialog can open them to discovery. Artist and genre matches take priority over discovery and match structured collaboration credits and normalized genre aliases. Mood/activity constraints remain strict. Scores are explanatory ranking points, not confidence estimates.

Imported favorites without context labels appear in a separate "awaiting context tags" section on Discover, with personal tagging and context-free exploration actions. They are not claimed to match the selected mood/activity and are not included in a saved contextual mix. When every contextual result is outside the preferred artists, the UI explicitly identifies those suggestions as other artists.

Discogs artist discovery fetches five releases per page, resolves masters to their main release, and imports tracklists. Recording identities use `releaseId:position`. Compilation tracks are included only when the selected artist is in the track credits. Track imports re-fetch provider records instead of trusting browser metadata. MusicBrainz keeps structured artist credits; recording lookups also retain ISRCs.

Both SQLite and Supabase PostgreSQL initialize staging, persistent jobs, identity mappings, artist credits, and indexed label tables automatically. Existing song IDs, ratings, playlists, and personal annotations are retained. Imports use a single transaction connection. Provider IDs take priority; cross-source duplicate detection requires an exact normalized title, artist names, and duration. Live/remix/version suffixes are preserved. Fuzzy or title-only merging is deliberately not automatic.

Catalog states: `ready` has valid artists and mood/activity labels; `pending` lacks context labels; `needs_review` includes legacy Discogs release rows and unresolved artists. Pending personal imports can be explored without context and personally tagged. Reviewed label publication makes tracks available to all users. Quarantined records remain available in saved playlists but are excluded from new recommendations.

## Local cleanup

Back up the database before applying cleanup. The audit is a report; clean normalizes metadata and stages identified records without deleting tracks.

```powershell
npm run catalog:audit -- data/catalog-audit.json
npm run catalog:clean -- data/catalog-clean.json
npm run seed:tracks
```

`seed:tracks` loads the bundled editorial entries; it no longer fabricates MusicBrainz or Discogs IDs. Existing source search links are references, not evidence that those records were verified at a provider.

## India-first discovery

```powershell
npm run catalog:sync -- config/catalog-artists.india.json 1
```

The final argument is the maximum pages per invocation, not the number of songs. Artist names resolve only when exactly one provider match satisfies the optional country. Pin returned genuine `artistId` values in the config for recurring operation. Artist country selects an identity; it does not label a recording's language. Browse results may include obscure recordings and alternate versions; this is discovery coverage, not a popularity chart.

Each invocation resumes pending jobs. Failed pages preserve their cursor for retry on the next scheduled invocation. Interrupted processing jobs become retryable after 15 minutes. Use one worker per provider across the deployment to respect MusicBrainz's shared one-request-per-second limit. Run the worker periodically as a scheduled background command; this repository does not provision a cloud scheduler. Set `CATALOG_REFRESH=true` on a periodic refresh invocation to restart completed artists for new releases. Don't run refresh and ingestion concurrently.

## Reviewed labels and publication

Stage tracks first, then supply a JSON array of reviewed records:

```json
[
  {
    "sourceKey": "musicbrainz:REPLACE_WITH_REAL_RECORDING_UUID",
    "language": "Hindi",
    "moodScores": { "Romantic": 0.8 },
    "activityScores": { "Driving": 0.7 },
    "labelSource": "Human review, batch 2026-10",
    "labelsReviewed": true,
    "labelVersion": 1
  }
]
```

```powershell
npm run catalog:labels -- reviewed-labels.json
```

Use the source keys from `catalog_imports`. Allowed moods/activities come from the existing taxonomy. Scores must be positive and at most 1. Provider refreshes preserve reviewed labels. Personal user annotations remain private. No automatic language guessing or invented mood labels are applied, and Spotify content is not sent to an AI model.

## Supabase deployment

Configure `DATABASE_URL` securely on the server and worker, then run the same commands against Supabase. Do not put credentials in the config files or browser. Back up the live database before `catalog:clean`. No Supabase connection was available during implementation, so live PostgreSQL execution and scheduler provisioning still require deployment validation.

## Remaining work

Spotify availability resolution and chart/licensed popularity ingestion are not implemented. This pipeline does not promise Spotify-wide coverage. Automated context enrichment needs a licensed data source and measured validation; manual reviewed-label batches work now. Artist names in the original editorial catalog remain combined strings until reviewed into structured credits.

Indexed label and artist tables are available for a future SQL candidate retrieval stage. The server limits metadata reads to shared tracks, the current user's imports, and their saved/rated references. It still loads that visible catalog for options and ranking; very large shared catalogs require indexed candidate queries and paginated options. Measure preference match rates, label coverage, duplicate rates, and rating feedback before expanding aggressively.
