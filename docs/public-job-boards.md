# Public employer job boards

Greenhouse, Lever, Ashby and SmartRecruiters use official public job-listing APIs. No API keys or paid search service are required. All other Job Finder connectors, CV tools, applications, bounties, social research and YouTube features remain in place.

## Registry and verification

`src/data/public-board-candidates.json` contains 146 distinct public board links, representing more than 100 company names. Each entry records the actual board URL, its token, region and a citation to the public directory where it was found. Sources are SimplifyJobs/New-Grad-Positions, poteto/hiring-without-whiteboards and remoteintech/remote-jobs. The seed includes technology companies such as Anduril, Quora, Graphcore, Pure Storage, Harvey, Scale AI, Qumulo, Klaviyo, InterSystems, Notion, Applied Intuition, Cerebras, Addepar, Duolingo, Snowflake, Sentry, CircleCI, Deel and Sketch. A cited link is a **candidate**, not a claim that its API is currently reachable, hiring, remote or Nigeria-friendly.

At runtime, actual public board links are extracted from the current SimplifyJobs and hiring-without-whiteboards directories daily. Company identifiers are never generated from names. Only recognized HTTPS ATS hostnames and validated tokens are accepted. New candidates must return a schema-valid response from their official API before they count as verified. An existing but empty board can be verified without inventing vacancies. The public APIs do not provide an exhaustive global company directory.

Each refresh checks up to 50 boards per platform, with six workers per platform and a 40-second deadline. Coverage rotates hourly, rather than quietly limiting every search to the same first eight companies. The first ten optional custom boards are prioritized; remaining custom boards join the rotation. Search activity reports discovered, checked, verified, failed and unvisited counts. API outages are errors, not “setup required” or successful empty results.

With MongoDB, checks and their citations are upserted in `public_board_registry`. Previously discovered boards survive process restarts. Without MongoDB, the built-in seed, daily discovery, per-process cache and Next.js public response cache still work; persistent verification history is unavailable. GET `/api/public-boards` returns candidates and saved checks separately, with timestamps and honest status. The existing application authentication applies to this endpoint.

## API behavior

- Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`. The API returns the board as a single list; artificial pagination is not added. HTML descriptions are converted to plain text. `updated_at` never substitutes for a publication date.
- Lever: `GET https://api.lever.co/v0/postings/{token}?mode=json&limit=100&skip={offset}`. EU boards use `api.eu.lever.co`. Pagination continues up to ten pages, with incomplete coverage reported honestly. Requirements and additional description sections are retained. The public API often omits publication dates.
- Ashby: `GET https://api.ashbyhq.com/posting-api/job-board/{token}`. This API supplies one complete board response; unlisted jobs are removed and secondary locations retained.
- SmartRecruiters: `GET https://api.smartrecruiters.com/v1/companies/{token}/postings?limit=100&offset={offset}`, followed by official posting-detail requests for relevant remote roles. Full descriptions are required before accepting those roles, so country restrictions are not lost. Arbitrary upstream `ref` URLs are never fetched. Pagination is bounded to ten pages.

Public requests use a one-hour Next.js fetch cache and a bounded 15-minute per-process board cache. Concurrent reads coalesce. Failed boards have a short cooldown; successful pages survive later-page outages. Temporary server errors get one bounded retry. Long `Retry-After` windows are respected without repeated immediate requests. No authentication headers are sent to these public APIs. TLS verification stays enabled.

## Roles, location and dates

Frontend, backend, full-stack, React, Angular, JavaScript, TypeScript and Node.js roles pass the shared relevance filter. Experience levels and employment types are selectable. Senior and freelance development roles are included; mobile, office/hybrid and unrelated-role exclusions remain.

Source locations and explicit applicant statements determine eligibility. Nigeria, Africa-wide and worldwide coverage are recognized; “global company” alone does not establish eligibility. Country-specific restrictions override broad labels. Generic remote and ambiguous EMEA roles require location review. A company having a remote board does not imply that every vacancy hires in Nigeria.

The default view is still the last three days, with 24-hour, 7-day, 14-day and 30-day choices. “Active public boards” in the Posting age selector includes older or undated postings verified on an official board within 24 hours. Undated jobs say “Posting date unavailable”; no discovery/check time is fabricated as publication time. After 24 hours without successful verification they leave the active view. Known expirations are still enforced. Applicant eligibility and timezone requirements should be confirmed on the employer's original listing.

Vacancy identity uses canonical original URLs, company, requisition IDs and locations, preserving distinct openings at the same employer. Board-level deduplication also retains distinct requisitions and locations. Client results paginate in groups of 24 after filtering. Original employer application links are retained. Incomplete board inventories never trigger wholesale deletion of stored source jobs.

## Environment variables

**No values are required for these four variables.** Leave them unset to use the automatic registry. Existing values continue to work as additions to it:

```dotenv
# Optional, comma-separated exact tokens from real public employer board URLs.
GREENHOUSE_BOARDS=
LEVER_BOARDS=
ASHBY_BOARDS=
SMARTRECRUITERS_BOARDS=
```

Format: `token1,token2`, without quotes inside the value, full URLs, paths or API keys. Tokens allow ASCII letters, digits, `_` and `-`; preserve their case. Lever additionally supports `eu:token` for `https://jobs.eu.lever.co/token`. Up to 200 custom tokens per platform are accepted. Incorrect formats fail clearly rather than triggering arbitrary network requests. There is no fixed mandatory company list to copy into Vercel. Deploy the implementation to enable the automatic registry; setting empty variables on the old deployment does not install this change.

Optional examples from the dated official-API verification (already present in the registry; setting these does not establish applicant eligibility):

```dotenv
GREENHOUSE_BOARDS=twitch,graphcore
LEVER_BOARDS=bloomon,palantir
ASHBY_BOARDS=brainco,quora
SMARTRECRUITERS_BOARDS=NextCenturyCorporation,MarlabsInc1
```

The recommended required value for all four remains **unset**. These are public board tokens, not API keys. The registry refreshes automatically during manual discovery, within the documented cache and request budget.

## Verification commands and current limitation

```sh
npm run registry:verify -- /tmp/public-board-verification.json
npm run lint
npm run typecheck
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
npm run build -- --webpack
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2
```

The verification script visits every discovered candidate, records checked times, successful API validation, listing counts, errors and relevant real-job examples. It writes no synthetic jobs and exits unsuccessfully when fewer than 100 distinct company labels have verified boards. Its output is a report, not automatic promotion of unverified seed data.

The initial verification was blocked by the proxy, but a subsequent live run on 2026-10-27 succeeded: **146 candidates, 135 verified boards, 134 distinct company labels, 13,226 fetched listings**. The dated response metadata and failed-board diagnostics are retained in `src/data/public-board-verification.json`. These counts describe the verification run, not current vacancies, eligible roles or application outcomes. Runtime requests continue to revalidate boards. The necessary domain additions were saved to the environment configuration draft, preserving existing domains; they require saving and publication in environment settings. This draft does not modify the Vercel deployment.

Required API hosts: `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co`, `api.ashbyhq.com`, `api.smartrecruiters.com`. Automatic discovery uses `raw.githubusercontent.com`. Company links use `job-boards.greenhouse.io`, `boards.greenhouse.io`, `jobs.lever.co`, `jobs.eu.lever.co`, `jobs.ashbyhq.com`, `jobs.smartrecruiters.com`. Node 24 in this cloud workspace must run with `NODE_USE_ENV_PROXY=1`; do not disable TLS or bypass the proxy.

Official references: https://docs.greenhouse.io/job-board , https://github.com/lever/postings-api , https://developers.ashbyhq.com/docs/public-job-posting-api , https://developers.smartrecruiters.com/docs/posting-api .

## Local regression results

On 2026-10-27: lint, TypeScript, 100 unit/database tests (zero skipped), the webpack production build, all 52 desktop/mobile browser checks, and production authentication, CV-upload and CV-builder/export checks passed. Browser tests use explicitly named fixtures; these results do not establish live ATS connectivity or the 100-company verification target.
