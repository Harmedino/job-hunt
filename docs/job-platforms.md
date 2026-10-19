# Expanded job discovery and Gemini recovery

The Job Finder now has **33 platform entries and 22 implemented search connectors**. Eleven connectors use public APIs/feeds without new credentials; seven need the operator's API credentials and four need public employer-board slugs. The eleven other platform entries are links for direct browsing, including LinkedIn, Indeed, Wellfound, Y Combinator, FlexJobs, Careerjet, Jobberman, MyJobMag and Hot Nigerian Jobs. Manual sites are not described as automatically searched.

The catalog and credentials checklist live in `src/lib/job-platforms.ts`; `/api/platforms` returns safe enabled flags, never credential values. The dashboard's source count is based on actual completed sources. Search activity distinguishes success/partial coverage, upstream failure and setup-required states. Existing stored discovery snapshots are invalidated by discovery revision 4 so open dashboards request the expanded search.

## Public search connectors

Existing: We Work Remotely, Remotive, Arbeitnow, Remote OK and Himalayas.

Added: Jobicy, The Muse, Get on Board, Remotely, Remote First Jobs, and Hacker News Jobs. Public discovery uses original source links for attribution. Remotive's public feed has a 24-hour delay; Jobicy's public feed has a 3-hour delay. Remotely and Remote First Jobs content is not syndicated to other job boards; the app only reads it into the private workspace.

All sources still pass through the same role, remote-work, publication-age and applicant-location checks. Remote without explicit Nigeria/global coverage remains a review candidate. "Anywhere in the U.S." is now explicitly excluded from worldwide eligibility. No missing publication timestamp is replaced with the discovery time. In particular Jooble update timestamps and Greenhouse updated_at do not establish original publication; missing dates are excluded from the 72-hour results. Employer-board metadata uses original/last-published dates where supplied; Lever dates are used only if its source response supplies a valid creation timestamp.

Coverage is bounded: Jobicy up to three 200-item cursor pages, The Muse one newest software-engineering page, Get on Board one programming page with bounded company enrichment, Remotely 100 newest records, Remote First Jobs the React/cybersecurity RSS feeds, and Hacker News up to 25 job stories. Bounded source reports are partial, so an absent job is not incorrectly treated as closed. Requests time out and fail independently.

## Optional server configuration

Add only credentials you obtained through each provider's authorized registration process, then redeploy. Keys remain on the server and authenticated requests are not stored in the public fetch cache.

| Connector | Environment variables | Official documentation |
| --- | --- | --- |
| Findwork | FINDWORK_API_KEY | https://findwork.dev/developers/ |
| Adzuna | ADZUNA_APP_ID, ADZUNA_APP_KEY; optional ADZUNA_COUNTRY (default gb) | https://developer.adzuna.com/docs/search |
| Jooble | JOOBLE_API_KEY for the documented jooble.org market | https://jooble.org/api/about |
| Reed | REED_API_KEY | https://www.reed.co.uk/developers/jobseeker |
| USAJOBS | USAJOBS_API_KEY, USAJOBS_EMAIL | https://developer.usajobs.gov/api-reference/get-api-search |
| Web3.career | WEB3_CAREER_TOKEN | https://web3.career/web3-jobs-api |
| ITJobs Portugal | ITJOBS_API_KEY | https://www.itjobs.pt/api/docs/job |
| Greenhouse | GREENHOUSE_BOARDS | https://docs.greenhouse.io/job-board |
| Lever | LEVER_BOARDS | https://github.com/lever/postings-api |
| Ashby | ASHBY_BOARDS | https://developers.ashbyhq.com/docs/public-job-posting-api |
| SmartRecruiters | SMARTRECRUITERS_BOARDS | https://developers.smartrecruiters.com/docs/posting-api |

Board settings are comma-separated tokens from actual employers' public careers pages, not arbitrary URLs. At most eight boards are fetched per platform in one refresh. These APIs are employer-board networks, not global searchable indexes. Unconfigured board lists are explicitly labeled. Careerjet remains direct browsing because its partner API requires accurate per-request end-user context that the background scheduler does not fabricate.

More platforms do not bypass role, freshness, location or work-authorization rules. Country-specific providers can legitimately return no supported roles. Live credentials, external permissions, quotas, publisher outages and runtime network policies can affect availability; no source is marked checked just because it exists in the directory.

## Gemini error handling

The previous generic "could not complete this request; check the configured model" message covered upstream server failures as well as other errors. The shared AI client now retries temporary network/408/500/502/503/504 failures once, with a short delay and a single total request deadline. It stays on the selected provider/model. Authentication, invalid-model and quota errors do not cause repeated calls or automatic switches to another provider.

Persistent errors now distinguish provider overload, internal errors, deadline exhaustion and configuration errors without displaying raw upstream error bodies, keys or CV data. This improves recovery and diagnostics; it cannot guarantee availability of Google's service. Job discovery still requires no AI key.

Provider guidance: https://ai.google.dev/gemini-api/docs/troubleshooting and https://ai.google.dev/gemini-api/docs/api-errors . Public source references: https://jobicy.com/jobs-rss-feed , https://www.themuse.com/developers/api/v2 , https://getonbrd.com/api-doc.html , https://tryremotely.com/api , https://remotefirstjobs.com/rss , https://github.com/HackerNews/API .

## Checks

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build -- --webpack`, and `npm run test:e2e`. Use a disposable `TEST_MONGODB_URI` to include persistence regression tests. Tests cover source inventory, honest configuration states, normalization, date preservation, partial outages, bounded pagination, URL injection, credential isolation and Gemini retry behavior.

Validation for this change: lint and TypeScript passed; all 82 unit/MongoDB tests passed with no skips; the four new platform browser checks passed on desktop/mobile, alongside existing discovery and Gemini/CV browser regressions; the webpack production build passed. Live optional providers still require operator credentials and successful provider/network access.
