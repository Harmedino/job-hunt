# Launchpad workflow improvements — implementation and verification

Implemented in `Harmedino/job-hunt` on branch `feat/launchpad-workflow-improvements`, with separate incremental pushes for the registry audit, discovery, manual imports, CV workflows, interface and final checks. Production deployment is a separate step.

## Discovery fixes and matching

- Recognizes frontend, backend, full-stack, software engineering, React, Angular, Next.js, Node.js, Express, Laravel, PHP, JavaScript, TypeScript and security roles. Senior and freelance roles are selectable instead of silently discarded. Himalayas now searches seventeen role terms with three workers and a bounded request deadline.
- Retains a 30-day publication pool with 24-hour, 3-day, 7-day, 14-day and 30-day views. The initial view remains three days. Undated employer postings have a separate active view; discovery time is never fabricated as publication time. Expiration and confirmed closure remain distinct from publication age.
- Adds full-time, part-time, contract, freelance and internship filters, plus internship, entry, junior, mid and senior levels. Missing source metadata stays unknown.
- Classifies Nigeria coverage, worldwide/Africa coverage, uncertain eligibility and confirmed restrictions. Structured country/timezone lists and explicit authorization restrictions take precedence. Vague remote listings remain visible with a review label. Confirmed restrictions are excluded and counted in source diagnostics.
- Explains separate role (25), skill (35), experience (15), location (15) and freshness (10) components. Skill/requirement checks compare actual profile mentions; they are not proof of proficiency, legal work authorization or a hiring probability. Unestablished qualifications are never created to improve a score.
- Vacancy identity uses original URL, employer, location and requisition ID, with click-tracking removed. Different vacancies at the same employer survive. Source attribution and original application links are retained.
- Source reports retain fetched, accepted, role/date/remote/location exclusions, duplicates, source failures and setup requirements. Board counts distinguish candidates, checks, verification, failures and unvisited companies.

## Public employer boards and scheduling

The registry contains 146 cited board candidates. A subsequent official-API verification on 2026-10-27 verified **135 boards across 134 distinct company labels**, fetching **13,226 listings**. This includes nonmatching, older and location-restricted jobs: it is not a count of jobs eligible for this user. The dated metadata and eleven failed-board diagnostics are stored in `src/data/public-board-verification.json`; static job descriptions are not shipped as live vacancies.

Greenhouse and Ashby use their single-list public endpoints. Lever supports global/EU endpoints and skip/limit pagination. SmartRecruiters paginates and enriches relevant remote postings with full descriptions. These APIs need no paid keys. Automatic directory discovery is cached daily; only actual ATS links are harvested. Per-platform batches check up to fifty companies with six workers and a forty-second deadline, rotating coverage hourly. Public request caching, in-flight coalescing, bounded retries and rate-limit cooldowns prevent repeated immediate requests. Long Retry-After windows also apply to incomplete paginated responses.

MongoDB retains verification history, discovered boards, last-seen information and closure evidence. Only a complete successful company inventory can close a missing vacancy. Outages and incomplete pagination do not infer closure, and application history is preserved. The existing authenticated `/api/cron` and GitHub Actions schedule remain the background entry point; batch deadlines fit inside the existing sixty-second Vercel handler and five-minute Actions limit. Requests never claim complete platform-wide coverage.

Nigerian/African applicants are prioritized through source-provided applicant coverage, not employer nationality. Jobberman, MyJobMag and other sites without an available authorized feed remain direct-browsing entries. No unsupported scraping or invented publisher API was added. LinkedIn integration was not added.

## Social, WhatsApp and Indeed workflows

Reddit communities include r/forhire, r/remotejobs, r/remotejs and cybersecurity hiring discussions. Reddit developer access is not configured/approved for this application, so it makes no automated Reddit requests; users import original post URLs and text manually and must respect community rules.

The inbox supports WhatsApp text with or without a source URL, Reddit/social URLs, and manually pasted Indeed alerts. It extracts explicit roles, employer, skills, date evidence and original application links. Forwarding headers, email addresses and phone contacts are removed from saved text. Alert-message dates are not treated as vacancy publication dates. Missing/anonymous employers and suspicious payment claims are flagged. Structured multi-job alert messages can be split into separate review leads; unstructured messages may need manual correction.

Leads remain unverified until the user checks an employer/job-board evidence URL, confirms the current advertisement, and reviews restrictions. Promotion is explicitly labeled user-reviewed, not authenticated employer verification. Unknown location eligibility remains unknown after review. Promoted opportunities enter the existing jobs/applications/CV pipeline and deduplicate against saved jobs. No application is submitted automatically.

The Web App Manifest, network-only service worker and `/share` review page support Web Share Target where the browser/OS allows installed web apps as targets. Browser handoff is tested; native OS installation/share-sheet availability is device-dependent and was not certified. Manual paste is always available. Private groups and unrelated messages are never scraped.

Indeed searches can be named and saved as original search links. There is no Indeed crawler, unrestricted search API dependency or Gmail connection. Original applications remain on Indeed or the employer site.

## CV preparation and document integrity

Existing PDF/DOCX/TXT imports, AI writing, basic layouts, CV/letter editing, templates, PDF/Word downloads and version history remain. My Profile stays the master source; tailored copies do not modify it. Saved/discovered jobs and application records can open CV Builder with their original descriptions.

Required and preferred skill mentions are separated; unsupported skills, experience durations and credentials require review. Basic layouts reorder genuine evidence by relevance. Existing AI writing still cites profile evidence and runs unsupported-claim checks.

Unfinished edits autosave to private server-side working copies, separate from immutable saved CVs. Recovery is explicit. Out-of-order autosave requests cannot overwrite newer copies, and working copies expire after thirty days. Compare with master CV shows the current profile beside the tailored version. PDF readability checks actually extract selectable generated text and check contact information, section headings, obvious layout/text problems and length. They provide no ATS pass rate or hiring guarantee.

New tailored versions retain the target job/application linkage. On submission, document data is snapshotted. Subsequent profile edits, new CV versions or moving an application back to Saved cannot replace its submitted documents. Preparation and attachment endpoints retain that lock.

## Environment and permissions

No new required environment variables or API keys were introduced. The existing MongoDB connection is required for persistence; APP_PASSWORD and HTTPS remain required for production. Existing optional AI credentials are used only server-side. No Reddit, Indeed, Gmail or WhatsApp credentials are required for these manual workflows.

`GREENHOUSE_BOARDS`, `LEVER_BOARDS`, `ASHBY_BOARDS` and `SMARTRECRUITERS_BOARDS` are optional additions to the automatic registry. Format is comma-separated exact public tokens, without full URLs. Lever supports `eu:token`. Leave them unset to use the registry. See `docs/public-job-boards.md` for hosts, caching and configuration details. Network-policy observations reported an unknown state; actual official API requests succeeded in this session. Future environments should retain the saved domain additions rather than assume unrestricted access.

## Verification evidence

- Lint and TypeScript checks passed.
- **110 unit/database integration tests passed, zero failed or skipped.** Disposable databases were removed afterward.
- **60 Playwright checks passed** across desktop and mobile, including date/type/experience filters, visible uncertain jobs, social review, share handoff, autosave/recovery, profile comparison and existing modules.
- The production webpack build passed.
- Production authentication, CV upload, CV builder, PDF/Word and cover-letter checks passed. The production readability endpoint returned selectable extracted text; serverless font/worker tracing was checked.
- A real-data discovery run accepted **269 listings: 121 with source eligibility evidence, 148 requiring location review**. This was a dated run before the final additional Himalayas terms, not a permanent inventory or an application outcome.
- A browser rendered the real Greenhouse “Sr. Software Engineer - AI Platform” listing from Addepar, preserved its application URL and raised no browser errors. This posting needs applicant-location review; its display is not proof of Nigeria eligibility. Live source data was supplied to the browser without writing fixtures or personal data into the application database.

The live source results were:

| Source | Outcome | Fetched | Accepted |
| --- | --- | ---: | ---: |
| We Work Remotely | ok | 96 | 8 |
| Remotive | ok | 10 | 0 |
| Arbeitnow | ok | 300 | 2 |
| Remote OK | ok | 99 | 9 |
| Himalayas | partial | 452 | 114 |
| Jobicy | error | 0 | 0 |
| The Muse | error | 0 | 0 |
| Get on Board | error | 0 | 0 |
| Remotely | error | 0 | 0 |
| Remote First Jobs | error | 0 | 0 |
| Hacker News Jobs | error | 0 | 0 |
| Findwork | not_configured | 0 | 0 |
| Adzuna | not_configured | 0 | 0 |
| Jooble | not_configured | 0 | 0 |
| Reed | not_configured | 0 | 0 |
| USAJOBS | not_configured | 0 | 0 |
| Web3.career | not_configured | 0 | 0 |
| ITJobs Portugal | not_configured | 0 | 0 |
| Greenhouse | partial | 5780 | 127 |
| Lever | partial | 786 | 0 |
| Ashby | partial | 1934 | 9 |
| SmartRecruiters | partial | 883 | 0 |

Sources reporting errors had network/request failures, not successful empty feeds. Optional authenticated providers were unconfigured in this environment and were not marked tested live. Listings, employer eligibility terms and provider availability can change after these checks.

## Files changed

Coding Bounties and YouTube Research implementation files were not modified. Their existing browser/domain/storage regressions passed. The complete change inventory, including the earlier public-board foundation in this same working session, is:

```text
.env.example
README.md
docs/job-platforms.md
docs/public-job-boards.md
next.config.ts
package.json
public/launchpad.svg
public/share-worker.js
scripts/verify-public-boards.ts
src/app/api/applications/route.ts
src/app/api/discover/route.ts
src/app/api/documents/[id]/route.ts
src/app/api/job-searches/route.ts
src/app/api/leads/route.ts
src/app/api/prepare/route.ts
src/app/api/public-boards/route.ts
src/app/api/resumes/[id]/attach/route.ts
src/app/api/resumes/[id]/readability/route.ts
src/app/api/resumes/working/route.ts
src/app/globals.css
src/app/layout.tsx
src/app/manifest.ts
src/app/page.tsx
src/app/share/page.tsx
src/components/cv-builder.tsx
src/components/discovery-report.tsx
src/components/share-registration.tsx
src/components/social-intake.tsx
src/data/public-board-candidates.json
src/data/public-board-verification.json
src/lib/discovery-feed.ts
src/lib/discovery-types.ts
src/lib/discovery.ts
src/lib/extended-job-feeds.ts
src/lib/job-freshness.ts
src/lib/job-identity.ts
src/lib/job-intelligence.ts
src/lib/job-platforms.ts
src/lib/job-search-links.ts
src/lib/lead-extraction.ts
src/lib/lead-verification.ts
src/lib/matching.ts
src/lib/public-board-feeds.ts
src/lib/public-board-registry.ts
src/lib/resume-builder.ts
src/lib/resume-review.ts
src/lib/run-discovery.ts
src/lib/social.ts
src/lib/source-directory.ts
src/lib/types.ts
src/proxy.ts
tests/browser/cv-builder.spec.ts
tests/browser/discovery.spec.ts
tests/browser/public-boards.spec.ts
tests/browser/workflow-improvements.spec.ts
tests/discovery.test.ts
tests/extended-job-feeds.test.ts
tests/job-intelligence.test.ts
tests/lead-import.test.ts
tests/matching.test.ts
tests/production/cv-builder.mjs
tests/public-boards.test.ts
tests/sources.test.ts
tests/storage.test.ts
tests/workflow-improvements.test.ts
docs/launchpad-workflow-report.md
```
