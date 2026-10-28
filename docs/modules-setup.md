# Coding Bounties and YouTube Research

These extend the existing Launchpad app. The sidebar contains independent **Coding Bounties** and **YouTube Research** tabs; Job Finder, Applications, CV Builder and My Profile remain in place.

## Install and run

Use the Node version in `.node-version`.

```bash
npm ci
cp .env.example .env.local  # only when creating a new local configuration
# Set MONGODB_URI and APP_PASSWORD. Add provider variables below as needed.
npm run db:migrate:modules
npm run dev
```

The migration is additive and safe to rerun. API writes also create the required indexes idempotently. Do not replace an existing `.env.local` or copy production data into a test database.

## Shared authentication, data and migrations

This is the existing **single-owner personal workspace**, not a new multi-user application. All people using its password share its owner account. The server fixes `owner=owner` on every module record, query and foreign reference; a request cannot choose an owner. OAuth connections use that same boundary. Introducing independent users would require a separate authentication migration.

New collections:

- `workspace_bounties`: normalized source opportunities, funding evidence and explainable analysis.
- `workspace_tracked`: source-ID references and work progress/notes/deadlines/submissions.
- `workspace_payments`: explicitly owner-confirmed received payments with currency and evidence.
- `workspace_profiles`, `workspace_topics`: editable creative profiles and saved research topics.
- `workspace_ideas`: original content concepts and approvals.
- `workspace_prompts`: immutable prompt versions linked to an idea.
- `workspace_metadata`: generated titles, captions, descriptions, hooks and hashtags.
- `workspace_entries`, `workspace_journal`: production plans and learning notes.
- `workspace_sources`, `workspace_settings`: source diagnostics and scheduled refresh preferences.
- `workspace_oauth`: encrypted owned-channel grants; never exposed in snapshot responses.
- `workspace_youtube_cache`: replaceable video/channel metadata and private sync snapshots.
- `workspace_ephemeral`: OAuth state, quotas and refresh leases.
- `workspace_ai_cache`: validated AI outputs with a one-day expiration.

The `db:migrate:modules` command calls `ensureModuleIndexes` in `src/lib/modules/store.ts`: unique owner/ID indexes, owner/kind/ID source snapshot index, and TTL indexes for API snapshots, OAuth state and AI caches. It does not delete or modify legacy job, CV, profile or application records. Foreign references are checked by the application in the current owner scope.

## Coding Bounties

1. Set your matching skills in **My Profile**. The fallback for a blank skills field is React, Angular, JavaScript, TypeScript, Next.js, Node.js, Express.js, MongoDB, HTML, CSS and Tailwind CSS. Existing profile skills are never overwritten.
2. Optionally set `BOUNTY_GITHUB_TOKEN` to an authorized public-repository read token for higher GitHub quotas. Anonymous official API access is supported. No new key or paid service is required.
3. Use **Find Paid Tasks** to refresh GitHub discovery. GitHub, Algora, Opire and IssueHunt original URLs can also be imported. The latter three are manual imports/direct browsing; the app does not claim they were automatically searched. A linked original GitHub issue permits public status checks. Failed API reads can be retained as explicitly manual, availability-unverified metadata; known private repositories are rejected.
4. The default includes paid and potentially paid tasks. Separate facets show **Verified Funded**, **Paid Opportunities to Investigate**, **Needs Funding Verification**, and **Inactive**. **Unpaid Contributions** requires explicit selection. Reset restores these broader paid-task defaults. Previously saved filter preferences remain editable.
5. **Verified Funded** still requires a positive task-specific reward, escrow/deposit evidence, acceptance conditions, a named authority and explicit manual confirmation of an authoritative current-funding source. Evidence expires after seven days and must be reviewed again after a newer source update. Historical payouts never verify current funding. Nigeria payout support is checked separately and defaults to unknown.
6. **Analyze Task** performs basic analysis and bounded public repository inspection without AI. The scope shows the actual directories/file excerpts retrieved and any failed reads; it never claims tests ran. **Generate AI implementation plan** is a separate optional action using the configured AI provider and existing evidence. Provider failure preserves basic analysis and entered data.
7. Save a task, review funding/assignment/payment conditions, then track assignment requests, coding, PR submission/review, merge, reward claim and payment separately. These are local records. No external comments, claims, branches, pushes or PR submissions are automatic. A merged PR never creates a payment.
8. Record actual received payments with date, original currency, platform, issue/PR and supporting evidence. Voiding a receipt retains its audit record and removes it from earnings. Archiving a tracked task retains its history and prevents rediscovery as new.

**Best Opportunity** uses explainable funding, skills, availability, uncertain effort, known competition, activity, maintainer response, acceptance conditions and Nigeria evidence. Scores are heuristics, not earnings probabilities. Sort by verified reward, estimated reward/hour, effort, competition, newest or skills. Unknown values stay unknown; amounts in different currencies are not treated as comparable. Filters include reward/currency, technologies, difficulty, effort, platform, availability and funding status. Save preferred filters in module settings. Pagination applies within the server's 500-record snapshot window.

Grouped advertisements preserve original links and separate funding arrangements. Saved/handled tasks are hidden from new opportunities by default. The earnings dashboard separates advertised/available rewards, verified funding, submitted work, approved-but-unpaid rewards, pending claims and receipts actually received. Original currencies and monthly totals remain separate. Optional NGN estimates reuse owner-reviewed, dated manual rates from My Profile (at most 30 days old); no rate is invented or fetched automatically.

### Provider investigation and limits

Observed on 28 October 2026; see the [paid contribution report](bounty-paid-workflow-report.md) for live evidence and validation.

- **GitHub:** six independent official search variations, up to two pages each within anonymous/token request and time budgets. Skill queries rotate rather than requiring every technology together. Search hits are source candidates, not confirmed paid work. Bounded maintainer-comment checks can establish advertised rewards, never funding. Cooldowns, leases, provider reset times and cached workspace data limit retries and preserve results during outages.
- **Algora:** the live homepage currently advertises open-source engineer hiring. No working authorized public bounty/funding API was established. Direct browsing and manual import remain available; the older empty-list controller does not establish the state of every current service.
- **Opire:** its live public site advertises developer rewards. Its FAQ describes sponsors arranging their own payments after approval; advertised amounts therefore do not establish escrow. Direct browsing/manual import are supported; automatic discovery was not claimed.
- **IssueHunt:** its current live homepage focuses on security bug-bounty programs. No authorized general coding-task discovery/funding contract was established. Manual import remains available; advanced vulnerability research is outside the default skill scope.
- No connector automatically verifies current escrow, sponsor credibility, historical payouts or Nigeria payment-provider support. Maintainer announcements remain advertised. Bare `$` never becomes an assumed USD amount.
- Default filtering excludes promotional advertisements, unsafe payment/credential demands, unrelated primary stacks and advanced architecture/security research. A task with plausible metadata still requires repository and sponsor review before work.
- Repository analysis reads at most four bounded files and directory listings, not an entire project. Issue timelines/comments and reviews are bounded. Linked PRs are possible competing references, not a complete competitor count. Only explicit merge evidence is called merged.
- Saved checks cover at most eight active tasks per run. Source, funding, maintainer, linked-PR and own-PR changes produce deduplicated notifications; stale claims receive a reminder. No expensive AI request runs during scheduled classification. Expand discovery diagnostics for query failures, partial runs, exclusions and timestamps.

## YouTube public research

1. Create a Google Cloud project, enable **YouTube Data API v3**, and create an API key restricted to that API. Keep it server-side in `YOUTUBE_API_KEY`.
2. Set `YOUTUBE_DAILY_QUOTA_BUDGET` (default 2000; maximum 10000). The app reserves 100 units before a search and one before a detail request, including OAuth Data API requests. This local UTC-day budget is conservative; Google's actual quota remains authoritative. A provider rejection never causes a fake fallback result.
3. Search keywords or a public `UC…` channel ID, optionally with date and duration filters. The API returns up to 20 candidates per page with a next-page token.
4. Save public video/channel references. Video facts are source-provided metadata and available public counts. A 30-second video is not automatically labeled a Short. Metadata research separates observable metadata from interpretations and cannot claim footage/audio analysis.
5. Use the initial editable **Bruno AI Football** profile or create other niches. Add/edit/remove saved topics. The displayed starter topics are suggestions until saved. Existing profile data is not replaced.
6. Generate 1–5 original ideas from a topic/profile and selected saved video metadata, or write one manually. Save/edit/reject/approve concepts, then add approved ideas to the plan.
7. Create an editable five-part Kling prompt, save immutable versions, copy saved prompts, or generate multiple publishing-metadata variations. Reference tags @Image1–@Image3 are text mappings you provide; this does not upload assets or invoke Kling. Mark external video generation complete yourself.
8. Use Kanban or the month calendar to plan production, link prompts/metadata, set a target date and record the final published URL. Scheduled means planned, **not uploaded or auto-published**.

No YouTube custom competitor scores, virality ratios, inferred private analytics, third-party video downloads, footage copying or statistical histories are implemented. Policy exception permissions are not assumed. Public snapshots are replaced on refresh and expire at 29 days; every read excludes expired data even before MongoDB TTL cleanup runs. Saved original plans and user notes are independent of source snapshots.

## Optional owned-channel OAuth and analytics

Required variables:

```dotenv
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=https://your-domain.example/api/workspace/oauth/callback
OAUTH_ENCRYPTION_KEY=...
```

Generate the encryption key once with `openssl rand -base64 32`. Keep it stable and private. Losing or rotating it makes stored grants unreadable; reconnect channels. The key is separate from APP_PASSWORD.

In Google Cloud:

1. Enable **YouTube Data API v3** and **YouTube Analytics API**.
2. Create a **Web application** OAuth client; register the exact redirect URI above. Local HTTP redirect is accepted only in development on localhost or 127.0.0.1.
3. Configure the consent screen, authorized domain, public `/privacy` URL and scopes. Add test users while the OAuth app is in Testing. Google may require app verification before a wider release; this repository cannot grant that approval.
4. Request only `youtube.readonly` and `yt-analytics.readonly`. Upload, financial and write scopes are not requested. Both permissions must be granted; partial consent fails clearly.
5. Open Analytics → Connect my YouTube channel. Select the appropriate Google/Brand account. Repeat to connect another owned channel.

Inactive channel connections expire after 29 days without token renewal and must be reconnected; grants used regularly are revalidated during token refresh. The flow uses a short-lived browser-bound state, single-use database state, PKCE S256 and AES-256-GCM-encrypted tokens. Analytics queries require a stored owner-scoped grant. A video-specific retention query first verifies the video's channel ID. Tokens never appear in UI responses or logs.

Supported source reports: channel totals, views/watch minutes/subscriber gains and losses, per-video performance, daily views/watch time, traffic sources and per-video audience retention where returned. Returning-viewer reports are explicitly unavailable in this implementation. Empty rows or provider restrictions stay unavailable. Private retention is never estimated from public views. AI recommendations use the freshly authorized source reports, disclose uncertainty and avoid new derived scores or causality claims.

Disconnect revokes the Google grant where reachable, deletes all local channel connections covered by the grant, and deletes private snapshots and AI caches. If remote revocation is unavailable, the UI points to https://myaccount.google.com/permissions . The app never substitutes public competitor statistics for missing private reports.

## AI provider

Existing `AI_PROVIDER`, `OPENAI_API_KEY`/`OPENAI_MODEL` or `GEMINI_API_KEY`/`GEMINI_MODEL` settings are reused. Calls use the existing token limits and timeouts. New module outputs are schema-validated before saving or using them and cached for at most one day. Explicit Generate/Analyze actions trigger AI calls; scheduled refresh does not generate creative content or recommendations. Missing AI credentials yield a configuration message; manual idea writing and work tracking still work.

## Scheduled work

The existing `/api/cron` endpoint and daily Vercel cron are reused. Keep `CRON_SECRET` configured. Bounty and YouTube refresh switches default off and can be enabled in each tab's settings. A minimum refresh interval gates the existing daily trigger; it does not change the hosting plan's cron frequency. New high-match bounty candidates and changes to saved issues use existing dashboard notifications, with unverified funding labeled.

Requests use bounded timeouts, one retry for transient failures, provider reset messages, local quotas, discovery cooldowns and database leases. Task groups run independently; one provider failure is collected as a diagnostic rather than failing Job Finder. The current daily runner handles bounded batches (up to 8 saved bounty checks, 10 saved YouTube references and 3 owned-channel syncs); it is not a durable queue. Larger-scale processing needs a separate queue/deployment decision. Public API snapshots expire regardless of refresh switches. Private scheduled reports replace previous snapshots and expire after one day.

## API surface

All `/api/workspace/*` routes use existing session authentication and no-store responses. Writes also enforce same-origin requests. The fixed server owner is never taken from JSON.

- `GET state`: saved workspace snapshot and safe connection/configuration metadata.
- `POST bounties/{discover,import,analyze,verify-saved}`.
- `POST youtube/{search,save-video,save-channel,research,analytics,learn,disconnect}`.
- `DELETE youtube/reference?id=…&kind=video|channel`.
- `GET oauth/{start,callback}`.
- `POST ideas/{generate,prompt,metadata,save-metadata}`.
- `POST records/{profiles,topics,tracked,payments,reward,ideas,prompts,entries,journal,settings}`.
- `DELETE records/{profiles,topics,tracked,payments,ideas,entries,journal}?id=…` with relationship checks.

## Validation commands

```bash
npm run lint
npm run typecheck
npm test
# Set TEST_MONGODB_URI to a disposable MongoDB instance to include persistence tests.
TEST_MONGODB_URI=mongodb://127.0.0.1:27018 npm test
npm run build
# Supported alternate bundler if this environment denies Turbopack's local worker port:
npm run build -- --webpack
npx playwright install chromium
npm run test:e2e
npm run test:cv
TEST_MONGODB_URI=mongodb://127.0.0.1:27018 npm run test:builder
npm run test:auth
```

Tests use explicit development fixtures and mock upstream providers. Production screens contain no invented opportunities, receipts, videos or analytics. Live credential validation, Google consent/verification and actual account reports require the deployment operator's own API project and grants; they cannot be verified by fixtures.

See `modules-architecture.md` for the inspected architecture and primary provider references.
