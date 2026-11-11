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

## Football Humiliation Radar and real video studio (PR #14)

The module now prioritizes source-backed heavy defeats and actual previewable comedy videos, not just news cards.

- Optional fixture provider: API-Football. Set `API_FOOTBALL_KEY` (or `APISPORTS_KEY`) to enable completed-match 6/12/24/48-hour results. The server fetches at most three UTC dates per window, uses a 45-minute cache, and checks only finished fixtures. Heavy defeat = **3+ goal margin**; surprising narrow defeats are not inferred without opponent-quality evidence.
- For each match the owner can fetch provider lineups, coach, player appearances/ratings and major recorded events. A player is suggested only if they **played** and a supplied rating <= 6.0 or an explicitly recorded match event supports it. An excellent player on a losing side is not automatically blamed. The absence of big-chance, error-to-goal, duel or opposition-strength data is explicitly unavailable. Some competitions have no lineup or rating coverage.
- Official API docs: https://www.api-football.com/documentation_v3 . Existing API access may be suspended. No credentials means football data is **not available**, and source-backed RSS headline coverage remains.
- Video previews: YouTube Data API video details are checked against exact ISO 8601 duration, **1–15 seconds**. Bounded one-to-three page searches (50 search results per page) with date/relevance sorting and rejection counts. At most a few top stories auto-request actual preview candidates, avoiding unlimited quota usage. Video findings are cached. Each YouTube search request costs quota and does **not** establish reuse rights or audible dialogue.
- Personal owned-media library: local IndexedDB stores approved source video **bytes** and preserves original audio. Rights, manually listened-to speech/laughter, and performer count are **creator-confirmed**, not independently licensed or visually verified. Meta is stored separately in MongoDB. Browser site-data removal can delete the video bytes; back up originals.
- Optional official X API recent post search: set `X_BEARER_TOKEN` with permission for v2 recent search. Returns provider-supplied timestamps and public metrics; no broad "trending" claim. With no API key, public X URLs can be recorded manually without claiming their content was read.
- Character image generation: set existing `OPENAI_API_KEY` or `GEMINI_API_KEY`, optionally `TREND_RADAR_IMAGE_PROVIDER=openai|gemini` and `TREND_RADAR_IMAGE_MODEL` to a compatible image-capable model. Image requests really use the provider API and **verify image bytes**. A text-only model is not treated as an image. Supports an optional owner-supplied identity reference photo (max 4MB) and separate image per role. Provider quota, billing, permissions, policy and costs depend on the account; no connected API keys are accessible for live testing here.
- Approved images are retained as **browser-local media** in IndexedDB; MongoDB stores exact image prompt and approval metadata. Regenerating a single character produces a draft until separately approved and does not overwrite others. Multiple independent image references map to stable character IDs even when people switch screen positions.
- "Prepare for Kling" downloads a ZIP containing the owner's authorized original video, individually approved character images, manifest mapping, prompts, captions and AI-parody disclosure. A YouTube reference alone is **not** downloadable; the ZIP requires an authorized local source video. This tool does not generate videos on Kling.
- The original concise Kling prompt structure remains unchanged and existing YouTube Research, Job Finder, Coding Bounties, CV Builder and Application Assistant features are not modified.
- Video dialogue recognition, human tracking through complex crossings, automatic verified performer identification, universal player-error attribution, and direct Kling generation remain **not implemented**. Manual role and action entry remains available.

### Acceptance and checks

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. Review the PR checks and smoke test the app in a browser. Production API keys and uploaded-file rights are not available in repository code; live provider success must be verified in the user's deployment. Do not claim that an image was generated or a real video was inspected when none has been provided.

