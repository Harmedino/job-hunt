# Trend Radar — first release (personal creator workflow)

Trend Radar is a separate Launchpad workspace using the existing owner-only login, MongoDB and YouTube research API. It does not replace existing YouTube Research or Kling prompt generation.

## What the initial implementation actually does

- Fetches bounded recent public RSS items from BBC/Guardian section feeds, removes high-overlap duplicate headlines, preserves original publisher links, ranks by freshness/editorial fit/corroboration, and offers a 6/12/24/48-hour view with maximum 12 cards. This is NOT a measured social-media virality score.
- Refreshes on demand or when the news cache is more than 20 minutes old. Provider failures appear in the dashboard and old source-backed results may remain. Publishers can restrict RSS endpoints; check live diagnostics before treating a source as operational.
- Accepts manually supplied X/news links WITHOUT claiming to have fetched or verified the post. Manually supplied links are stored in a separate unverified references list; unknown publication times are not treated as fresh news.
- Reuses the existing official YouTube Data API search and video-details integration. Its broad short search is only a preliminary query; every shown result must pass the strict ISO 8601 1–15-second check. No longer videos are displayed as candidates. Search is deliberate/on-demand to preserve quota.
- Shows original YouTube previews and source links, without downloading third-party video files. Rights, spoken dialogue, visible people, audio content, aspect ratio and suitability are UNKNOWN from public metadata.
- Supports browser-local previews of owned/licensed video; duration and dimensions are inspected in the browser and clips outside 1–15 seconds are rejected. A conservative local MP4 parser may verify the presence/absence of an audio track, but cannot verify whether it contains audible speech, laughter, music or silence. On explicit Save, selected eligible videos and character images are stored locally using IndexedDB, not uploaded or synchronized.
- Provides @Video1 / @Image1… mappings, separate optional environment image reference, constrained character-replacement prompt, five editable caption drafts with fictional/AI disclosure, and production statuses. Optional opt-in brainstorming reuses the existing Gemini/OpenAI provider for up to three fictional comedy concepts and platform captions; this is not evidence of matching media.
- Saves story evidence, YouTube reference metadata, character assignments, prompt, captions, publication URL, notes and status in the trend_radar_projects MongoDB collection. Selected owner-provided video and image blobs are optionally saved in the browser's private IndexedDB under a project ID. They are not on MongoDB or another device; clearing browser site data can permanently remove them. Export separate backups for Kling.

## Sources and API keys

Existing MONGODB_URI and production APP_PASSWORD are required for durable owner-only project storage. Existing YOUTUBE_API_KEY is needed for live public clip discovery. AI_PROVIDER and an existing GEMINI_API_KEY or OPENAI_API_KEY are OPTIONAL for enhanced fictional scene suggestions and caption rewrites; deterministic captions and replacement prompts do not require an AI key. No X API, JEV API, additional paid subscription or downloader is needed.

Source evidence is the feed provider's original public URL and reported publication date. Headline people[] contains only literal likely proper-name pairs extracted from published headline text and is labeled UNVERIFIED; it does not verify any person's identity, involvement or popularity. A high rank measures editorial opportunity, not measured audience engagement or viral certainty.

## Limitations and recommended next improvements

1. Confirm actual feed access and relevance in production; RSS publishers can block hosting providers or change formats. Replace an inaccessible feed only with another authorized public source and source attribution.
2. Media inspection beyond browser duration/resolution and optional owned-MP4 audio track detection (actual audible speech/music/laughter, person count, quality, transitions and editing suitability) needs additional authorized-media analysis; do not mark these verified from thumbnails or YouTube metadata.
3. Browser-local IndexedDB media is not cloud-synced or backed up; this prototype cannot guarantee persistence after browser site-data clearing. Add a private, consent-based owned-media upload and storage option for cross-device work in a later phase.
4. YouTube results are references; rights to edit, reuse, or replace people in a clip must be assessed separately.
5. Clips are matched through a manually selected scene search, not automated footage analysis. Concept suggestions are editorial, not evidence of specific characters in the video.
6. No external publishing automation, social account connection, engagement tracking or live X read access is implemented in this first release.
7. Existing cron is unchanged; news refresh occurs when the Trend Radar page is loaded (cache age exceeds 20 minutes) or on demand. No always-on scheduled monitoring is enabled.
8. The module does not download videos or remove watermarks.

## Safety and copyright

Use original/owned/licensed material or authorized references. A YouTube clip's public viewability is not evidence of reuse rights. Do not portray AI parody reactions as actual statements or interactions of real people. Keep disclosure on generated media.

## Quality checks

Run npm run typecheck, npm run lint, npm test, npm run build and npm run test:e2e.

tests/trend-radar.test.ts covers strict ISO duration, unknown media qualities, headline merging, freshness, unique character tags and caption disclosure. Existing auth middleware protects /api/trend-radar; POST requires same-origin requests. No articles, YouTube files or real publishing operations are used in tests.

Status: feature branch pending CI and browser review. Do not claim production acceptance before deploying and checking live feeds/search.
