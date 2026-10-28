# Paid contribution workflow — 28 October 2026

Coding Bounties now discovers paid and potentially paid development tasks without requiring an independently verified escrow record before they can be seen. Strict funding verification remains separate. No funded task, sponsor credibility, Nigeria payout support or received income was invented to populate the dashboard.

## Implemented behavior

The existing module, owner authentication, MongoDB records, GitHub connector, Gemini/OpenAI integration, scheduler and notification system were extended. Job Finder, Applications, CV Builder and YouTube Research remain in place; existing records and credentials were preserved.

- **Find Paid Tasks** defaults to advertised/potentially paid opportunities. Separate facets show Verified Funded, Paid Opportunities to Investigate, Needs Funding Verification and Inactive. Unpaid Contributions requires explicit selection. Saved filter preferences remain editable; reset uses the new defaults.
- Matching uses actual My Profile skill mentions, with JS/TS, React, Angular, Next.js, Node.js, Express, MongoDB, HTML/CSS and Tailwind fallbacks only when the profile is blank. Promotional ads, known unsuitable primary stacks, advanced architecture/security research and suspicious fee/credential demands are excluded by default. A plausible task still needs sponsor and code review.
- **Best Opportunity** explains funding evidence, skills, availability, reward evidence, uncertain effort, known competition, repository activity, maintainer response, acceptance criteria and Nigeria eligibility. Additional sorts cover verified reward, estimated effort, estimated reward/hour, competition, freshness and skills. Unknown effort/competition never becomes zero. Different currencies are not treated as equivalent.
- Public GitHub searches use independent skill/query variations, bounded pagination, deduplication, request/time budgets, provider retry/reset guidance, cooldowns and refresh leases. Existing cached workspace data survives outages. Technical diagnostics are expandable.
- GitHub, Algora, Opire and IssueHunt URLs can be imported. Manual imports remain labeled manual, and unavailable source reads do not establish availability or funding. Known private repositories are rejected. No undocumented provider endpoint was added.
- Canonical repository/issue identity groups advertisements, retains original links and keeps separate funding arrangements. Saving/working/completing a task removes it from default new opportunities. Archiving retains history and prevents rediscovery as new.
- **Analyze Task** performs basic analysis and bounded public repository inspection without AI. It lists actual files/excerpts and failed reads. At most four files are retrieved; root/test directory listings are not a full test review. Nothing from a third-party repository is executed. Optional **Generate AI implementation plan** uses the configured provider and the evidence already retrieved. AI failure preserves basic analysis and user input.
- The payment checklist separates advertised reward, exact-task secured funding, acceptance conditions, assignment/possible competing PRs, Nigeria eligibility, methods/fees/restrictions and historical payouts. Funding evidence requires an owner's explicit authoritative-source review, expires after seven days and needs re-review following a newer source update. Historical payouts never verify current escrow.
- Local progress records distinguish saving, funding review, assignment requests, coding, PR submission/review, merge, reward claim and receipt. Branch/fork, PR, feedback, deadline, notes, claim/approval evidence and effort are retained. Public issue/PR checks are read-only. An explicitly merged PR advances work status, never earnings. Closed PRs are not assumed merged.
- Notifications cover relevant candidates, saved-task/source/reward/funding changes, maintainer activity, explicitly merged linked PRs, own PR state and stale claims. IDs use source state/timestamps to suppress repeats. Linked PRs are possible competing references, not an exhaustive count or proof of relevance.
- Earnings separate available advertised rewards, current funding, submitted work, owner-approved unpaid rewards, pending claims and payments actually received. Receipts require owner confirmation, date, amount/currency and evidence. Duplicate identical receipts do not double count. Voiding retains audit history, excludes the receipt and removes unsupported Paid status. Monthly totals remain per currency. Optional NGN estimates reuse dated, owner-reviewed manual FX rates in My Profile, valid for at most 30 days; no automatic rate or combined multicurrency earnings figure is invented.

## Sources actually checked

Observed on **28 October 2026 (Africa/Lagos)**. Source content and availability can change.

| Source | Actual observation | Integration boundary |
| --- | --- | --- |
| [GitHub REST search](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests) | Official anonymous API reads worked. The application candidate collector made eight successful query-page requests: 230 hits, 25 repeated hits, 205 unique candidate issues, no query failures. The run stopped at its configured budget. | These are raw candidates, including irrelevant/unpaid/promotional issues; they are not 205 legitimate paid opportunities. Normal classification and scope filters still apply. |
| [Algora](https://algora.io/) | HTTP 200; current homepage title was “Algora - Hire the top 1% open source engineers.” | No working authorized public current-bounty/funding API was established. Direct browsing/manual import only. The historical empty controller does not establish every current platform service. |
| [Opire](https://opire.dev/home) | HTTP 200; public developer-bounty homepage and FAQ. The FAQ describes each sponsor arranging payment after approval. | Manual import/direct browsing; advertised rewards are not presumed escrowed. No automatic API search was claimed. |
| [IssueHunt](https://issuehunt.io/) | HTTP 200; current homepage title was “IssueHunt - #1 Bug Bounty Platform in Japan.” | Current security-program focus is outside the default beginner/intermediate development scope. No authorized general coding-task feed was verified; manual original-link import remains available. |

No current task-specific secured funding or Nigeria payout support was confirmed by this live sample. No comments, assignments, code pushes, PR submissions, payment claims or other external writes were made to third-party projects.

### Real issue and production UI check

The official API returned the open issue [Add single-flight token refresh handling](https://github.com/shaiananvari8/zeroeye/issues/1), advertised by a repository maintainer as a TypeScript task. Its title/body mention **$35**. The currency remains unresolved because a bare dollar symbol does not establish USD. It is displayed under **Paid Opportunities to Investigate**, with funding and Nigeria payout eligibility unverified.

The public root directory and [README excerpt](https://github.com/shaiananvari8/zeroeye/blob/main/README.md) were actually retrieved. The referenced implementation and test files were not retrieved in that bounded read, and no repository commands/tests were executed. This observation demonstrates source retrieval and honest evidence display; it is not a sponsor endorsement or recommendation to run the project's tooling. A separate promotional result found during research was excluded from task recommendations.

Chromium rendered the fetched issue in the local production build at 1440px and 390px. Original links, advertised/unconfirmed labels, the exact inspection scope and unknown Nigeria eligibility were checked. Both sizes had no horizontal overflow or browser page errors. This UI check supplied the genuinely fetched data through an intercepted workspace response; separate integration/production tests exercised database persistence and authentication. No fixture or research result was inserted into the user's production database.

## Validation

- `npm run lint` and `npm run typecheck`: passed.
- `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test`: **144 passed, zero skipped**. Disposable-database checks cover funding gates, retained notes/history, read-only merge handling, notification deduplication, actual receipt requirements, duplicate receipt prevention, voiding, archives and manual Opire fallback.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2`: **74 passed**, across desktop/mobile, including existing job/CV/module regression checks and the new saved-task → working → merged → approved-unpaid → received → voided-payment workflow.
- `npm run build -- --webpack`: passed. Webpack is the supported workaround for this cloud runner's Turbopack worker-port restriction; the deployment's default build configuration was not changed.
- Production `test:auth`, `test:cv`, and `test:builder`: passed for protected login/logout, authenticated PDF/DOCX/TXT uploads, malformed files, persisted CV versions, PDF/Word exports and serverless worker/font tracing.
- Live official GitHub search, bounded repository read and desktop/mobile production rendering: checked as described above. External provider behavior is not simulated by the normal browser fixtures and is reported separately.

A regression run also exposed an intermittent early-click race in the social inbox. Dashboard open requests now persist in React state through child hydration, preserving the existing manual/social intake behavior.

MongoDB had to be restarted after environment restoration; after `docker compose up -d --wait mongodb`, all database checks passed. No test was skipped or weakened to bypass the missing service.

## Configuration and startup

**No new required environment variable or paid API key was introduced.** Existing `BOUNTY_GITHUB_TOKEN` is optional for authorized higher public-read quotas. Basic matching, classification, tracking and accounting need no AI key. Optional AI plans reuse the existing configured Gemini/OpenAI integration; provider overload/quota can still interrupt those calls. GitHub API reads and Git push authentication are separate capabilities.

MongoDB and the existing production `APP_PASSWORD` remain required for persistent private work. Follow [installation, migrations and startup](modules-setup.md). Never overwrite an existing `.env.local`, expose keys through `NEXT_PUBLIC_`, or paste credentials into chat.

The four public employer-board variables are optional extensions to the automatic registry, not API keys. Exact formats and verified registry examples remain in [public job board configuration](public-job-boards.md). Earlier career, salary, duplicate, saved-job and CV workflow changes are documented in [job preferences](job-preferences-and-salary.md) and the [workflow report](launchpad-workflow-report.md).

The reusable environment installation script was retained. Startup instructions were updated to include current networking evidence, MongoDB readiness, checks and the no-automatic-external-actions boundary, and saved as an environment configuration draft. Review/save and publish that draft in environment settings to reuse the updated instructions in future tasks. Saving a draft does not itself publish or restart the environment.

## Remaining limits

No authorized source in this implementation independently proves escrow, sponsor honesty or Nigeria payment-provider support. These remain explicit evidence-review steps. Estimated hours are uncertain AI suggestions, not guaranteed completion time or income. Public searches, comments, timelines, review lists, repository reads and the 500-record workspace snapshot are bounded and can miss evidence. Scheduled checks use the existing daily hosting trigger, not continuous polling or a durable queue. Claims, assignments and submissions remain manual external actions unless separately authorized.

Changes are pushed incrementally to `master`. GitHub confirmed that Vercel received code commit `ba73e31` and began deploying it. Functional checks in this report ran locally; the deployed production domain was not exercised. A deployment request alone does not establish successful deployment. Existing provider configuration in Vercel is separate from cloud development bindings.
