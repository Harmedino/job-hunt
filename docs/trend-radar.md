# Trend Radar — first release (personal creator workflow)

Trend Radar is a separate Launchpad workspace using the existing owner-only login, MongoDB and YouTube research API. It does not replace existing YouTube Research or Kling prompt generation.

## What the initial implementation actually does

- Fetches bounded recent public RSS items from BBC/Guardian section feeds, removes high-overlap duplicate headlines, preserves original publisher links, ranks by freshness/editorial fit/corroboration, and offers a 6/12/24/48-hour view with maximum 12 cards. This is NOT a measured social-media virality score.
- Refreshes on demand or when the news cache is more than 20 minutes old. Provider failures appear in the dashboard and old source-backed results may remain. Publishers can restrict RSS endpoints; check live diagnostics before treating a source as operational.
- Accepts manually supplied X/news links WITHOUT claiming to have fetched or verified the post.
- Reuses the existing official YouTube Data API search and video-details integration. Its broad short search is only a preliminary query; every shown result must pass the strict ISO 8601 1–15-second check. No longer videos are displayed as candidates. Search is deliberate/on-demand to preserve quota.
- Shows original YouTube previews and source links, without downloading third-party video files. Rights, spoken dialogue, visible people, audio content, aspect ratio and suitability are UNKNOWN from public metadata.
- Supports browser-local previews of owned/licensed uploaded video (not transmitted to the server); duration is inspected by the browser and anything outside 1–15 seconds is rejected for the default workflow. Browser metadata alone does not verify speech, ownership or character suitability.
- Provides @Video1 / @Image1… mappings, separate optional environment reference, constrained character-replacement prompt, five editable caption drafts with fictional/AI disclosure, and production statuses.
- Saves story evidence, chosen YouTube reference metadata, replacement assignments, prompt, captions, publication URL, notes and status in the trend_radar_projects collection. This first release does not save uploaded video or character image bytes: use the local files again in Kling. Only filenames (notes) are stored.

## Sources and API keys

Existing MONGODB_URI and production APP_PASSWORD are required for durable owner-only project storage. Existing YOUTUBE_API_KEY is needed for live public clip discovery. AI_PROVIDER, GEMINI_API_KEY and OPENAI_API_KEY remain optional for the rest of Launchpad; Trend Radar's initial caption drafts and replacement prompt do not require an AI provider. No X API, JEV API, additional paid subscription or downloader is needed.

Source evidence is the feed provider's original public URL and reported publication date. At this stage people[] stays empty unless independently verified; Trend Radar does not infer names from headlines. A high rank measures editorial opportunity, not measured audience engagement or viral certainty.

## Limitations and recommended next improvements

1. Confirm actual feed access and relevance in production; RSS publishers can block hosting providers or change formats. Replace an inaccessible feed only with another authorized public source and source attribution.
2. Native media inspection beyond browser duration (actual speech/music/laughter, person count, original audio, transitions and 9:16 crop) requires authorized media bytes and additional tooling; do not mark these verified from thumbnails or metadata.
3. User-selected local video and character images are not stored in a durable media library. Persist a private owned-media library or browser-local indexed files only with explicit user action, storage limits and local-only labeling.
4. YouTube results are references; rights to edit, reuse, or replace people in a clip must be assessed separately.
5. Clips are matched through a manually selected scene search, not automated footage analysis. Concept suggestions are editorial, not evidence of specific characters in the video.
6. No external publishing automation, social account connection, engagement tracking or live X read access is implemented in this first release.
7. Existing cron is unchanged; no scheduled trend refresh beyond cached on-demand checks is enabled.
8. The module does not download videos or remove watermarks.

## Safety and copyright

Use original/owned/licensed material or authorized references. A YouTube clip's public viewability is not evidence of reuse rights. Do not portray AI parody reactions as actual statements or interactions of real people. Keep disclosure on generated media.

## Quality checks

Run npm run typecheck, npm run lint, npm test, npm run build and npm run test:e2e.

tests/trend-radar.test.ts covers strict ISO duration, unknown media qualities, headline merging, freshness, unique character tags and caption disclosure. Existing auth middleware protects /api/trend-radar; POST requires same-origin requests. No articles, YouTube files or real publishing operations are used in tests.

Status: feature branch pending CI and browser review. Do not claim production acceptance before deploying and checking live feeds/search.
