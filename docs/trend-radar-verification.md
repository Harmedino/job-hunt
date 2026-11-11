# Trend Radar review and verification — 11 November 2026

## Baseline and scope

Reviewed the merged PR #13 implementation and the PR #14 changes already on master at `71aee1d`. This is an extension of the existing module, not a replacement. Existing MongoDB records and unrelated workspace features were preserved. The earlier uncommitted Application Assistant recovery work remains in the original checkout; this change was validated in an isolated checkout.

Feature changes were pushed incrementally to master:

- `68b5523`: character/scene-bound image approvals and exact-byte Kling exports.
- `3b5d5fa`: bounded paginated video search with retained partial results.
- `3e1e50d`: football evidence validation and local media-analysis primitives.
- `2bfa0d2`: integrated authorized-media studio, source discovery, persistence and regression coverage.

## Issues found and corrected

Static review found these concrete implementation gaps:

- Approval matched a performer ID/tag without binding its current identity, scene or actual bytes. Export trusted tag presence. Approvals now include a complete assignment fingerprint and SHA-256, and export verifies filename, MIME and bytes.
- Approved image metadata was not immediately persisted to the project. Approval now saves metadata as part of the action; regeneration leaves existing approved images intact.
- JPEG approvals/draft downloads could have PNG filenames, and WebP environment exports used a JPEG extension. Extensions and manifest paths now match the files.
- OpenAI reference-photo requests used a JSON payload where the compatible image-edit upload path uses multipart data. Tests cover the actual multipart contract. Gemini 2.5 image options now exclude the newer image-size setting.
- A generation lock expired before a slow image request could finish. The lock now spans the complete bounded request, with a separate hourly budget. Request/image sizes fit the intended Vercel envelope; oversized output produces a failure rather than fake success.
- A later YouTube page failure discarded previously eligible clips. Partial reports now retain earlier results, and invalid individual metadata does not abort an entire batch. Pagination tokens, page counts, time, result count and shared quota are bounded.
- Saved video references could trust client-provided duration metadata. Saves now check exact ISO duration and canonical URL, then use server-side cached/provider metadata or the existing saved snapshot.
- Partial project updates erased environment mappings, while empty notes could not be cleared. Both behaviors are corrected.
- Null scores could be coerced to zero and missing starter/substitute information to a definite substitution. Malformed scores are rejected and unavailable lineup status remains unknown.
- Cast reports were cached by fixture without the requested losing-team identity. The fixture/loser pairing is verified against the official result and included in the cache key.
- Choosing a clip for an already selected story reset its chosen cast. The cast is preserved.
- The feed parser did not consume Atom entries. Public community feeds now work with explicit unverified-discussion labels.
- Changing the lead report could create another notification or lose hidden status. Existing story identity, evidence and hidden state are retained across matching refreshes. Same-URL manual imports are deduplicated.
- Replacing a comedy-library file could retain old manual speech/person annotations. Those fields reset on file change; absent audio tracks cannot be marked as dialogue.

Browser testing also caught a duplicate React key introduced while adding the inspector. It caused repeated panels. The keys were separated before the final feature push, and the regression test explicitly asserts a single inspector.

## What works in the implementation

### Character images

One image request per character, detailed scene-aware editable prompts, optional authentic identity photos, independent previews/drafts, generation/regeneration, explicit approval/save, per-image download, styles and 9:16 full-body instructions are integrated into the existing studio. Provider-native images with a different ratio are fitted to 9:16 using plain margins without cropping. The actual resulting file is hashed. Image presence, facial identity, correct kit and suitability require visual review; a prompt does not verify those properties.

Changing an identity, role, outfit, appearance or scene invalidates the earlier approval for export. Timestamped position changes retain stable performer IDs. Up to eleven performers support a manager plus ten players and a separate environment reference.

### Video, matching and export

Video search checks up to three pages of fifty IDs and only exposes 1–15 second results. Reports show pages/checks/rejections/partial failures. Existing approved, matching comedy templates with files on the current device receive production priority.

Authorized-file inspection measures real browser duration/dimensions, MP4 audio-track presence, optional decoded audio energy and sampled scene changes. It does not pretend to identify speech, laughter or people. Manual timestamped role mapping remains available.

The ZIP contains the authorized source video, a distinct approved file per character, optional separate environment image, exact reference mappings, image prompts/approval metadata, a short replacement prompt, five platform captions and AI-parody disclosure. Actual file duration and timestamp boundaries are checked again before download. The original audio bytes and concise preserve-original-scene instructions remain intact.

### Sources and notifications

Added public Atom community research, publisher-result fallback labels, stronger source validation, evidence-aware deduplication and local-template priority. X references remain uninspected unless official API access actually returns their contents. The existing daily cron remains opt-in and in-app notices are deduplicated; no external notifications are sent.

## Real provider/source observations

These results are separate from fixtures and do not establish access on Vercel:

| Integration | Observation in this cloud environment |
| --- | --- |
| Gemini model discovery | HTTP 200; the configured account listed `gemini-3.1-flash-image`, `gemini-2.5-flash-image` and other image-capable IDs. Listing is not proof of generation quota. |
| Gemini real image request, `gemini-3.1-flash-image` | HTTP 429 quota/rate-limit failure. One fictional coach portrait requested; no image saved. |
| Gemini real image request, `gemini-2.5-flash-image` | HTTP 429 quota/rate-limit failure during a separate compatibility check. No image saved. |
| OpenAI Images | No OpenAI key configured here. Multipart/reference and response handling tested with fixtures; live generation unverified. |
| `r/soccer` public Atom | HTTP 200; 25 eligible recent posts parsed with original links/dates and community labels. These are discussion references, not verified football results. |
| `r/popculturechat` public Atom | HTTP 429. No successful posts claimed. |
| BBC Sport RSS | Fresh request failed under this environment's current outbound access rules. Not claimed operational here. Other publisher feeds remain separately diagnosed by the app. |
| YouTube | No `YOUTUBE_API_KEY` configured here. Real search/playback success unverified; production search code uses the existing official integration and is fixture-tested. |
| API-Football | Neither supported football key configured here. Live fixtures, squads, managers and ratings unverified. Empty/missing-provider states remain explicit. |
| Official X API | No bearer token configured here. No post contents, metrics or trend status invented. |
| Kling | Preparation/export only; no Kling API integration or video generation claimed. |

Two real image requests were made for compatibility verification. Production code never silently falls back/retries a billable generation request. The image workflow's successful branches were tested with real image file bytes in fixtures, not represented as successful live AI generation.

## Automated verification

- Typecheck and lint passed.
- Full unit/database suite: **213 passed**, including isolated MongoDB persistence, source/URL validation, notification deduplication, hidden-state retention, strict durations, field/identity binding, image hashes, image-provider response/error contracts and authorization.
- Full desktop/mobile browser regression suite: **94 passed**. This includes existing Job Finder, CV Builder, Coding Bounties, YouTube Research and Application Assistant views.
- Trend Radar's successful browser path covers three separate fixture images, an uploaded identity reference, independent regeneration, per-image download, actual synthetic MP4 inspection, a timestamped performer, a separate environment image, real ZIP contents and rejection after changing identity.
- Production build passed with webpack in this cloud checkout. CI/Vercel retain the normal build command.
- Built-app HTTP checks passed for Trend Radar login/authorization, origin rejection, missing image provider, bounded bodies, validated video references and durable isolated project updates.
- Existing production auth, CV-upload, CV-builder and Application Assistant checks passed.
- Existing six companion fixture regressions passed. These are fixtures, not a new native Chrome-extension installation claim.

All database tests used uniquely named disposable databases. Existing application data/volumes were not dropped, reset, migrated destructively or seeded with content opportunities. Synthetic blue test patterns are committed only under `tests/fixtures/radar` and never added to the production library.

Commands and environment-variable formats are in [the setup guide](trend-radar.md) and [`.env.example`](../.env.example). New production checks run with `TEST_MONGODB_URI=... npm run test:radar` and are included in CI.

## Remaining access and capability limits

1. The image provider must grant usable image-generation quota. Both tested Gemini model requests returned 429. Adding the key alone does not supply quota; check the provider account/model access. No successful real generated portrait was verified in this run.
2. Enter existing YouTube/football/X keys in deployment settings only for the integrations you want. Those services were not connected in this environment. The video library, source references, deterministic prompts/captions and exports do not require them.
3. Automatic confirmed speech/laughter recognition, semantic person identification/tracking, current squad/kit verification and universal football-error attribution remain unavailable. Manual assignments stay clearly labeled and cannot turn an uninspected reference into verified footage.
4. Media remains browser-local. Restore the same approved files or reapprove replacements on another device; a MongoDB metadata record alone does not contain the media.
5. A network-only configuration draft was saved, preserving existing domains and adding the relevant feed/API/embed hosts. It still requires review, save and publication in environment settings before live access can be assumed. No pending draft is treated as applied. The [Cloud environment runtime skill](skill://plugin_connector_1p_c5b7d5df5d7081918f2c4be5a633ed5d/cloud-environment-runtime/SKILL.md) requires: “For changes to the reusable configuration, or when this tool is unavailable, use the onboarding/settings flow.” Code and independent validation were completed while that configuration remains pending.
6. Local protected production tests are not authenticated tests of the user's deployed Vercel workspace. Deployment status is checked separately through GitHub/Vercel commit statuses; credentials for the deployed workspace were not requested or exposed.
