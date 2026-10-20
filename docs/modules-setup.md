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

1. Set your matching skills in **My Profile**. Suggested skills for this use case: React, Next.js, Angular, JavaScript, TypeScript, Node.js, Express.js, MongoDB, Firebase, HTML, CSS, Tailwind CSS, PHP and Laravel. If the shared skills field is blank, the bounty module uses those supplied development skill defaults. Saving skills in My Profile replaces this fallback. Existing skills are never overwritten by module installation.
2. Optionally set `BOUNTY_GITHUB_TOKEN` to a read-only token for public repository metadata. Anonymous official GitHub search is supported with lower limits. Never use a write-scoped token.
3. Refresh in Discover, or import a GitHub, Algora or IssueHunt task link. GitHub issue imports verify source metadata through the official API. Algora and IssueHunt imports are explicitly manual; an optional linked GitHub issue enables status verification.
4. **Verified Funded** is the default view requested for this workspace. Discovery and saving do not require funding or historical payout proof. Use the Funding verification control to explicitly view all potentially paid tasks, reward announcements, unverified candidates, unpaid issues or inactive tasks. Reset filters restores verified-only mode.
5. **Verified Funded** requires a positive confirmed reward, escrow/deposit evidence, acceptance conditions and an explicit manual check of an authoritative current-funding source for this exact task. Name that authority when recording evidence. Checks expire after seven days; older records and expired evidence are not silently promoted. A past payout URL is optional and never establishes current funding. Verification records a manual check, not an independently executed provider escrow check or a payment guarantee. Eligibility remains a separate concern.
6. **Analyze Task** computes technical match separately from financial verification. If the AI provider fails, the metadata analysis is saved and displayed with its error; no AI plan or effort estimate is invented. AI sees the current classification and advertised versus confirmed amounts separately. It has issue/repository metadata, not fetched code, and never claims work or submits a PR.
7. Track work and record actual receipts separately. Currency totals respect precision and never combine different currencies. Marking Paid requires a received payment record.

Funding filters cover Verified Funded, Reward Announced, Unverified Bounty, Unpaid / No Reward Found, Inactive and all paid/potentially paid. Reward ranges use confirmed or explicitly advertised amounts in a selected currency. Unknown currency or reward is not converted to zero or USD. Technical relevance ranks first by default, followed by funding class and recent activity; currency groups remain separate. Other controls cover technologies, keyword, language, difficulty, platform, repository, availability and update date. UI results paginate within the server’s 500-record workspace window. Diagnostics separate the latest discovery run from the current saved workspace and show raw hits, duplicates, classifications, query failures and active-filter exclusions.

### Provider investigation and limits

- GitHub: six independent official search variations, up to two pages each, deduplication before insertion, optional repository enrichment and active saved-issue rechecks. Multiple technology keywords rotate across independent searches rather than requiring every skill simultaneously. Bounded anonymous/token request and time budgets prevent runaway calls; reports mark partial runs and quotas explicitly. Existing valid data and the last successful refresh survive outages.
- Algora: the official published legacy controller at https://github.com/algora-io/algora/blob/main/lib/algora_web/controllers/api/bounty_controller.ex returns an empty list. No working authorized funding endpoint has been verified. Manual original-link import remains available.
- IssueHunt: no documented, authorized live discovery/funding contract was verified. Manual original-link import remains available; no scraping or invented endpoint is used.
- No integration automatically confirms escrow or sponsor credibility. GitHub owner/member/collaborator reward announcements are classified as advertised, never funded. Bounty labels and untrusted monetary mentions stay unverified; ordinary price examples are classified separately as unpaid.
- Language enrichment is bounded to six repositories per run; missing values stay Unknown. Difficulty uses source labels, AI effort remains uncertain, and assignees do not reveal all competitors. Refresh checks up to eight active saved issues. No expensive AI request is used for routine classification.

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
