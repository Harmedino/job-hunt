# Trend Radar: setup, workflow and verified limits

This update extends the merged PR #13 implementation and PR #14 changes already on master (`71aee1d`). It keeps the existing personal workspace, authentication, YouTube integration and MongoDB data. Job Finder, YouTube Research, Coding Bounties, CV Builder and Application Assistant implementations are unchanged by this update.

## Creator workflow

1. Open **Trend Radar** and choose a recent story or verified completed match. Use 6/12/24/48-hour windows. Publisher reporting, public community discussion and manually supplied references have different evidence labels.
2. Preview an approved, authorized comedy-library video or a strict 1–15 second YouTube reference. YouTube previews carry no automatic permission to download or edit. Supply an authorized local file for production/export.
3. Inspect the match's actual participants before selecting the Comedy Cast. A manager and up to ten players fit eleven separate performer mappings. Appearance in a losing team alone is not evidence of poor performance.
4. Assign original performers, replacement identities and scene clothing. Each performer has a stable ID, independent of screen position. Optional timestamped role intervals record crossings without changing IDs.
5. For each character, review the detailed image prompt and optionally select an authentic identity photo. Click **Generate Image**, preview the actual image, and **Approve & Save**. Uploaded replacement images can also be previewed and approved. Regeneration creates a draft and leaves approved images intact until a new approval.
6. Review the short Kling prompt and editable platform captions. Add an optional environment image with its own unused `@Image` tag. Click **Prepare for Kling · Download ZIP**. This saves the selected local video/environment before checking the export.

Approved images are saved immediately to this browser's IndexedDB, with approval metadata in MongoDB. Save the project to retain other edits. Source videos, generated images and uploaded replacement images are **not synced to other devices**. Keep the ZIP as a backup; clearing browser site data removes local media. A saved approval whose local file is missing cannot produce a ready export.

## Character Image Generator

The existing image API now has an exclusive generation lock covering the complete provider request, a bounded hourly budget, bounded request/response bodies, compatible reference-photo uploads, and explicit model/access/quota/network failures. It never retries a billable image request automatically.

Prompts specify one individual person, recognizable reference-derived facial traits and hairstyle, natural proportions, scene-specific clothing, a neutral pose, simple environment, lighting, camera framing and visible footwear. Prompts are editable. Photorealistic is the default; 3D cartoon, cinematic, sports photography and custom styles remain available. The model's depiction, identity, current football kit and full-body framing need visual review. No face match or current kit is independently verified by Launchpad.

Gemini uses `generateContent` with image response modalities and optional inline identity-photo data. The Gemini 2.5 image model receives its compatible aspect-ratio options without the newer image-size option. OpenAI uses the Images generation endpoint or multipart Images edits when an identity photo is supplied. Existing API keys remain server-only. Only the selected photo and prompt go to the provider after the explicit Generate action.

A text response is never stored as a generated image. The server checks recognized image bytes; the browser decodes the image before showing success. If a provider returns a native aspect ratio other than 9:16, the browser fits the complete image onto a 9:16 canvas with plain margins, without cropping the head or feet. The image's actual hash is recorded after this framing operation.

Approvals bind the exact performer ID, role, identity, scene, appearance, outfit, image tag, filename, MIME and SHA-256. Changing the character or scene requires review and reapproval. The export rehashes the stored files and rejects stale, missing, swapped or replaced assets. Existing legacy approvals remain stored but need reapproval to obtain this stronger verification.

## Local video analysis

The optional **Analyze authorized video locally** action operates entirely in the browser. No video is sent to an AI provider or uploaded to a Vercel function.

- Browser metadata checks actual duration and resolution. Export checks the actual file again and rejects unreadable videos or durations outside 1–15 seconds.
- The conservative MP4 parser identifies container audio-track presence where supported.
- Web Audio attempts to decode actual audio samples and reports overall RMS energy in dBFS. An audio track, detected energy and audible dialogue are different findings. Failed decoding remains UNKNOWN.
- The browser samples up to twenty frames, 0.75 seconds apart, and reports possible scene changes from pixel differences. These are heuristic cut hints; motion can trigger them and short cuts can be missed.
- Automatic speech/laughter classification, person counts, named-person recognition and performer tracking models are unavailable in this inspector and stay UNKNOWN. The editable timestamped performer-role map is manual evidence, not an automatic identity claim.

The reusable library preserves original media/audio bytes, records owner-confirmed rights and manually reviewed attributes, and clears prior speech/person annotations when a different file is imported. A file with a verified absent audio track cannot be saved as containing dialogue/laughter.

## Discovery and ranking

### Football

API-Football supplies completed results, lineup/coach information, participant minutes, provider ratings and supported explicit match events. Only completed defeats with at least a three-goal margin qualify automatically. The selected losing team is checked against the actual fixture before generating its cast report, and the cache is scoped to both fixture and losing team.

Malformed, null or negative goals are rejected. Unused players are excluded. Good players are not marked poor simply for losing; low provider ratings or supported events are shown with their reasons. Unknown starting/substitute status stays unknown. Managers are lineup-sourced **for that match**, not assumed to still hold the job today. No unavailable current-squad, current-kit or individual-error evidence is invented.

Trusted publisher headlines with explicit heavy-defeat scorelines can appear as **Reported heavy defeats · Match statistics unverified**. This fallback retains the original source and does not invent lineup/player ratings. Unexpected narrow defeats, losing streaks, opposition strength, big-chance counts, goalkeeper-error attribution and manager pressure are not automatically inferred when the necessary statistics are unavailable.

### Clips

Trend Radar reuses the existing `youtubeData` and video normalizer, without changing YouTube Research. A search checks at most three pages of fifty IDs, requests exact ISO 8601 durations, and stops once twelve eligible references are found, the provider ends pagination or the bounded budget is reached. Sort by relevance/date and select a 1–3 page budget. The strict 15-second ceiling applies independently of YouTube's broad `short` query filter.

The report counts attempted detail checks, rejected duration/missing metadata, duplicates and pages. A later-page outage/quota error preserves earlier checked clips and shows a partial-search warning. Successful searches are cached for eight hours; partial searches have a five-minute freshness limit. Each search page consumes the existing shared YouTube quota budget.

Approved comedy-library templates with files present in the current browser receive production priority when their scene category fits. Templates appear before external reference searches. No playable local file, successful download, reuse permission, performer count, original speech or orientation is fabricated from a YouTube thumbnail.

### News and social references

Public feeds include BBC, Guardian, Sky Sports, The Athletic and the public Atom feeds for `r/soccer` and `r/popculturechat`. RSS/Atom parsing is bounded, rejects unsafe URLs/unsupported XML declarations, and excludes undated, future and stale entries. Community posts remain unverified discussion; their contents do not establish the truth of a claim or a measured social trend.

Official X API recent search remains optional. API-supplied counts are displayed only when present. Without access, manual X links remain uninspected references. Reimporting the same manual URL reuses its saved reference rather than creating another suggestion. No X scraping or video downloading is added.

Source clusters reuse existing story identity across refreshes, preserving hidden stories and avoiding repeated new-opportunity notifications when a different publisher becomes the lead source. The optional existing daily cron stores deduplicated **in-app** notices; it sends no email/push messages. Freshness, reporting evidence and available production assets affect ranking. Social virality is not measured or promised.

## Configuration

Keep the existing local setup (`npm ci`, local MongoDB, `npm run dev`) and production owner login. Add only integrations you want:

| Variable | Required value / purpose |
| --- | --- |
| `MONGODB_URI`, optional `MONGODB_DB` | Existing MongoDB connection/database. No destructive migration or reseeding. |
| `APP_PASSWORD` | Existing production workspace password; HTTPS required. |
| `GEMINI_API_KEY` | Existing Gemini API key with access/quota for the selected image model. |
| `OPENAI_API_KEY` | Alternative existing OpenAI key with Images API access. |
| `TREND_RADAR_IMAGE_PROVIDER` | `auto`, `gemini` or `openai`. Auto follows a configured explicit `AI_PROVIDER` where possible, then available keys. |
| `TREND_RADAR_IMAGE_MODEL` | Optional image model override. Defaults: `gemini-3.1-flash-image` or `gpt-image-1.5`. Supported IDs are listed in `image-service.ts`. `GEMINI_MODEL` / `OPENAI_MODEL` remain the text-AI settings. |
| `TREND_RADAR_IMAGE_HOURLY_LIMIT` | Optional local UTC-hour request cap, default `20`, bounded to 1–60. Failed generation attempts also count. |
| `YOUTUBE_API_KEY` | Existing YouTube Data API v3 key for official reference searches. |
| `YOUTUBE_DAILY_QUOTA_BUDGET` | Existing shared search quota budget, default `2000` units/day. |
| `API_FOOTBALL_KEY` or `APISPORTS_KEY` | Optional API-Football/API-Sports direct API key. Coverage/quotas depend on the account. |
| `X_BEARER_TOKEN` | Optional official X token with recent-search permission. No subscription is required to use the remaining module. |
| `TREND_RADAR_SCHEDULED_REFRESH` | Set `true` to reuse the existing daily cron; disabled otherwise. |
| `CRON_SECRET` | Existing protected cron credential. No new Vercel schedules are installed. |

Set credentials in deployment/environment settings, never in source or chat. Redeploy Vercel after changing production variables. Cloud workspace credentials and Vercel credentials are separate.

For restricted cloud networking, the app needs the selected provider/API/feed hosts. A network-only draft preserving the existing host list was saved for review; saving a draft alone does not enable those hosts. See the verification report for what was actually reachable.

## Verification

See [Trend Radar verification report](trend-radar-verification.md) for reproduced bugs, real provider observations and regression results.

```bash
npm run typecheck
npm run lint
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:auth
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:radar
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2
```

Cloud checkouts with external dependency links use `npm run build -- --webpack` and a manually started `npm run dev -- --webpack --hostname 127.0.0.1` for Playwright. CI and Vercel retain the default build. Stop dev before building.

An explicitly requested live image smoke check makes **one real provider request**, may consume provider quota, writes its result under `/tmp`, and uses a disposable local database:

```bash
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 \
  node --import tsx scripts/verify-radar-image.ts --generate
```

Synthetic fixtures in `tests/fixtures/radar` are test patterns, not discovered clips, public figures, generated celebrity images or production-library content.
