# Manual workflow improvements — 2026-10-27

## Preserved working features

The existing repository already supported public and optional authenticated job feeds, ATS board discovery, location checks, vacancy deduplication, CV import, immutable tailored versions, cover letters, PDF/Word export, master-profile comparison, recovery/autosave, readability checks, social lead verification, authentication, Coding Bounties and YouTube Research. These paths were reused. The dated registry verification retains 135 verified public boards across 134 company labels; the four ATS environment variables remain optional additions, with no paid keys required.

## Changes

- Manual discovery: no first-visit or hourly dashboard search. Saved results load immediately; **Find new jobs** and named-search **Run** remain explicit actions. Existing separately configured schedulers remain independent.
- Search/results appear above collapsible diagnostics. Counts distinguish retained discovery results, active jobs, source-backed location coverage, review candidates and filtered results. Fresh this week is seven days. Strong/Fresh counters are keyboard-accessible filters.
- Role, date, experience, employment, location and sorting controls persist in the browser. Named filters use a separate private collection, preserving saved alert URLs. Keyword terms can match different parts of a title, company and description.
- Known incompatible stacks are excluded by default; a broader explicit view remains available. Supplied project/experience skill evidence contributes to matching. Seniority mismatches are visible and capped below the Strong threshold. Location and profile scores do not imply hiring probabilities.
- Cards have readable titles, short descriptions and visible Save Job, View Details and Apply actions. Details retain full descriptions and match evidence. Escaped feed HTML/numeric entities are normalized as text. Explicit applicant timezone requirements and remote-country labels outrank broad worldwide tags; uncertain timezone ranges remain review candidates.
- CV Builder has four navigable stages: choose, analyze, build/edit, save/use. Existing descriptions and empty sections collapse. Requirements compare actual profile mentions, and relevant experience/projects retain exact supplied text. Editor/preview work beside each other on desktop and sequentially on mobile.
- Section ordering persists through autosaves, immutable versions, PDF, Word, readability and application downloads. Revert clears unfinished edits with a newer revision. Actual saved-PDF preview and separate CV/letter downloads remain available.
- Retry Generation preserves inputs and reuses completed private stages only for unchanged inputs and provider/model settings, for thirty minutes. Verification always runs before completion. Factual/schema failures discard the writing checkpoint. Basic Layout stays explicit; no other provider receives credentials or CV data as a fallback.
- Saving a CV package creates/reuses the application and keeps its job/company, CV version and letter together. Manual descriptions need an original HTTPS URL and retain an unverified label; they never become confirmed discovery records automatically.
- Applications add personal notes, application/follow-up dates and interview information. Ready to Apply displays existing Ready for review records without migrating/deleting data. Dates do not imply submission. Both UI and API require explicit submission confirmation. Submitted document snapshots remain immutable after later edits or status reversals.

## Validation

Lint, TypeScript and the webpack production build pass. All **128 unit/database integration tests** pass with no skips. The full **70 desktop/mobile browser checks** pass, followed by **24 focused workflow checks** after the final CV/layout and live-data corrections. Production tests pass for real login/logout/session protection, CV upload parsing, immutable versions, saved styles, PDF, editable Word, cover letters, selectable text and serverless font/worker tracing.

A fresh official-feed discovery returned 321 actual vacancies before the final additional text-location screening. Re-evaluation retained 146 with location evidence, 173 needing review and identified two restricted postings. These are dated source results, not profile matches or a permanent inventory. Public boards can return partial inventories; empty accepted results from an individual source do not imply the platform has no jobs.

The production application rendered actual fetched job data on desktop and mobile, opened its full details and preserved the original application URL with no browser errors or horizontal overflow. Live data was handed to the browser without inserting synthetic jobs or personal profiles into the application database. UI corrections were prompted by inspecting these real-data screenshots.

## Configuration and practical limits

No new required keys, services or environment variables. Use the existing MongoDB/password setup and optional server-side Gemini credentials. New collections are additive: named job filters and private expiring generation checkpoints. Existing records are preserved. Installation/startup steps remain in README; see [manual workflow](manual-workflow.md), [public board formats](public-job-boards.md), and [provider troubleshooting](provider-troubleshooting.md).

Gemini's live availability still depends on Google. Earlier live model checks accepted the configured key and small writing requests, while complete synthetic CV generation was not consistently successful; provider overload/timeouts and strict factual completeness remain visible failures. Checkpoint and fallback behavior has deterministic regressions, but it cannot guarantee provider capacity or approve unsupported qualifications. The Findwork token in Vercel is not injected into this cloud environment, so its live validity was not established here.

Follow-up reminders are displayed in the tracker; no email or external reminder service was added. Requirement extraction is text-based and must be reviewed for proficiency, duration, location and credentials. Native operating-system share-sheet installation remains device-dependent. No new job APIs, LinkedIn integration or automatic submission was added.

Changes are committed and pushed directly to master in small stages. Git publication and Vercel deployment are separate: check that the newest master commit is Ready in the connected Vercel project. This session does not have Vercel deployment visibility and does not claim the production domain has updated.
