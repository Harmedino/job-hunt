# Application Assistant and Assisted Apply v1

Launchpad remains the same single-owner Next.js/MongoDB application. The new **Application Assistant** sidebar area connects existing discovered/saved jobs, CV Builder versions, profile facts, application history and a first-party Chrome Manifest V3 companion in `browser-extension/`. No employer submission API, external automation service, new paid API or server-side browser is used.

## Audit and implementation plan

Reviewed `AGENTS.md`, README, Next route/client documentation, discovery and ranking, public-board feeds/registry, saved searches, career preferences, profile/import history, CV Builder/evidence/recovery/PDF/Word services, application storage/file snapshots, cookie authentication/proxy, cron and existing unit/database/browser/production tests.

Reused `evaluateJobPreferences`, `jobAvailable`, `sameVacancy`, `ensureJobApplication`, `applicationWasApplied`, the existing CV/version/export routes and `resumePdf`, `statusHistory`, `applicationActions`, `calendarToday`, MongoDB connection and existing authentication. Existing jobs, CVs, application statuses and Coding Bounties/YouTube workflows remain in place.

The missing pieces were an approved document handoff, employer-form readback, private confirmed answers, duplicate browser-claim protection and a distinct uncertain-submission record. Incremental changes introduce: (1) immutable packages and conservative outcomes; (2) scoped browser handoffs and the companion; (3) integrated queue/answer bank/settings/analytics and regression checks. Greenhouse is the primary v1 workflow. Lever and Ashby are limited single-page adapters; unsupported layouts fail visibly.

## Install and start

Use Node 24 and the existing MongoDB connection:

```sh
npm ci
npm run extension:build
npm run dev
# For production:
npm run build
npm start
```

Required existing server environment: `MONGODB_URI`; production additionally requires `APP_PASSWORD`. Optional: `MONGODB_DB`, `CRON_SECRET` (existing scheduled discovery/shortlisting), `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL` (existing provider and optional contact-mapping suggestions). The normal `PORT` startup setting is unchanged. There are **no new required environment variables or browser-exposed provider keys**. Public-board environment variables remain optional registry additions; they are not application credentials. See the main README for other existing job-feed integrations.

In this cloud execution environment, the verified build uses `npm run build -- --webpack` because of its Turbopack worker restriction; normal deployment/CI still uses `npm run build`.

In your local desktop Chrome:

1. Pull the current `master` checkout, run the installation/build commands above, and open `chrome://extensions`.
2. Enable Developer mode → **Load unpacked** → choose this repository's `browser-extension/` folder. No Chrome Web Store publishing is needed.
3. Copy its extension ID. Pin **Launchpad Application Companion** if convenient.
4. Sign in to Launchpad normally. Choose **Application Assistant**, or open it from a saved supported application.
5. Choose a saved tailored CV for the exact vacancy. Open its actual PDF/Word export; use the existing CV Builder to edit/save another version if needed. Check the first/last name, selected contact facts, optional cover letter and the displayed private answers, then approve the immutable package.
6. Review the **approved frozen CV PDF** link. Its bytes and SHA256 are exactly those handed to the companion; later CV/profile edits cannot replace them.
7. Enter the extension ID and create a two-minute handoff. Paste the private code into the extension popup and approve permission for your exact Launchpad origin.
8. **Open employer page** asks permission for only that ATS origin. **Fill approved fields** then **Read form values**. Complete unknown questions, custom controls and legal agreements yourself. Correct fields and verify again.
9. Review Field / Expected / Observed / Verification. Explicitly confirm any manually entered answers. A missing required answer, wrong email, missing/changed file, challenge or unsupported form blocks readiness.
10. Only after a verified readback, check submission approval, type `SUBMIT`, and click **Confirm and submit once**. Check the employer's visible result and use **Check employer confirmation**. An unrecognized confirmation stays uncertain; do not submit again.

Chrome host access is optional and requested separately for your deployment host and selected ATS host. Chrome host permissions include all ports on the granted host; the handoff and bearer checks still bind the exact Launchpad origin and attempt. The manifest permits optional Vercel origins, localhost/127.0.0.1 and the named ATS hosts. For a self-hosted domain, add its exact `https://your-domain/*` pattern to `optional_host_permissions`, rebuild/reload, then grant that origin. Do not add broad all-site access. No cookies, downloads, webRequest, employer-password or provider-key permissions are requested. Password fields are excluded from readback.

Enterprise Chrome policies may prevent unpacked extension installation. The managed Chromium in this cloud environment does so; its policy was left intact. Install in a browser where your administrator permits this extension. See validation limits below.

## Supported behavior and limits

- **Greenhouse:** original `boards.greenhouse.io` and `job-boards.greenhouse.io` vacancy URLs; native controls in `application-form` / `application_form`, including the current public form markup inspected during development.
- **Lever:** original global/EU posting URLs; standard name/email/resume controls, native text/select/checkbox/radio/date fields. Public page markup was inspected. Employer-specific JavaScript, attachment processing and custom questions can require manual action.
- **Ashby:** original job URLs and accessible single-page application forms exposing stable system fields. Public posting metadata was checked; the live client-rendered form was not validated in this restricted environment. This adapter is experimental, with fixture coverage only. Changed, embedded, inaccessible or unmatched forms stop with a blocker.
- Standard fields use deterministic mappings to **explicitly reviewed** contact facts. Skills, employment/education, authorization, salary, availability, relocation, dates and professional statements require exact confirmed answers or manual entry. Software experience never becomes security experience or legal eligibility.
- Native dropdowns use one exact option; radio/checkbox groups use exact labels. Known custom comboboxes are read back when their selected label is accessible, but are completed manually. Unsupported date/number/custom controls remain reviewable. Intermediate pages are completed manually; v1 only certifies a final form when all required identity/document controls can be verified together. It does not claim universal multi-step support.
- Legal agreements are never automatically accepted, including when an answer exists in the bank. Login and CAPTCHA stop filling. No challenge token is written and no challenge is bypassed.
- The serialized package is capped at 3.5 MB for the serverless handoff; individual documents are capped at 3 MB. PDF upload uses the approved bytes and dispatches normal input/change events. Verification reads the actual `FileList` back and hashes its bytes. If an ATS clears/transforms the file input, the upload is not called successful: download the approved file, upload manually and recheck. Forms that cannot expose verifiable attachment bytes require manual completion; v1 will not certify them ready or silently send a different file.
- A content-script guard blocks ordinary form-submit events and recognized submit controls until the approved companion action. The companion only clicks the actual browser submit control after durable intent is acknowledged. It never calls private employer submission endpoints. This is not a defense against a malicious employer's own JavaScript; only use legitimate original employer pages and inspect the final summary.
- The companion retains the current package/token in extension **session** storage, not durable sync/local storage. Disconnect removes it. Its token is restricted to one attempt, expires after ten idle minutes, and can be revoked in Launchpad. Handoffs are random, hashed, one-use, extension-ID-bound and expire after two minutes. No cross-site messaging integration or externally connectable extension entry point is exposed.

## Answer memory, AI and technical knowledge

**My Profile → Application Answers** supports confirmed answers with source, confirmation time, update time, disabling, editing/reconfirmation and deletion. Scope is the exact vacancy; explicitly reusable non-sensitive questions can span vacancies. Equivalence is deliberately conservative: the complete normalized question must match. Sensitive eligibility, compensation and legal answers cannot be globally reusable. Conflicting matches stay unresolved. A saved master-profile change invalidates existing answers and prevents stale-package pairing or continued filling/verification/submission. Reconfirm or create a new approved package rather than overwriting historical evidence. Deleting an answer does not erase evidence already frozen into an earlier package.

Unambiguous standard fields need no AI. Optional contact-mapping suggestions reuse the existing provider abstraction, send field labels and available contact-key names (not personal answer values), and never fill automatically. Review/approve each proposed mapping, then manually verify the observed value. Authorization, qualifications and legal questions are excluded from AI mapping. No-provider errors preserve deterministic/manual work. Cache keys include the exact package/form/profile context, and successful suggestions expire after one day. The opt-in daily **form AI suggestion-request** limit defaults to zero; failed attempted calls consume the limit. Call counts are reported, not invented monetary estimates. Provider retries can involve multiple HTTP attempts; this is a suggestion-request budget, not a currency billing cap. These controls do not change existing CV Builder/provider usage.

`assisted_form_knowledge` stores versioned technical shapes (hashed IDs/labels, control kinds, required flags, option counts and observed verification outcome), without personal answers, entered values or credentials. Changed layouts produce a different hash and require fresh inspection. After an owner approves an ambiguous contact mapping and verifies the actual value, the technical store can remember the field/label hashes and contact-key name. An identical later form can propose that mapping without another AI request, using only the new approved package's facts and requiring owner approval again. No personal answer is saved in that rule. This is a cache of observed form characteristics, not model training or guaranteed support for an employer's next form.

## Outcomes, duplicate prevention and recovery

The existing Saved / Preparing / Ready for review / Submitted / Interview / Rejected / Offer / Archived application statuses are preserved. New companion records separately track:

| Companion state | Meaning |
| --- | --- |
| `awaiting-user` | Package approved; form needs filling, corrections, manual answers or a fresh readback. |
| `verified-ready` | Actual entered values passed readback; final owner submission approval is still required. |
| `uncertain-submission` | Intent was persisted before a possible click; receipt has not been established. A timeout/crash cannot reset this to unsubmitted. |
| `confirmed-submission` | An explicit recognized employer confirmation was observed, or the owner deliberately reconciled documented evidence. The audit trail distinguishes the two. |

An official normalized ATS vacancy key has one active attempt. Repeated approvals/claims are blocked atomically. Existing manually submitted applications also block browser duplicates. Only one companion holds the lease. A fresh claim invalidates prior readiness. Values are read again immediately before a confirmed click; any change requires another review. No automatic retry is performed after intent, a lost acknowledgement, navigation failure or missing confirmation.

Use **Stop and revoke companion access** after a stuck session. For uncertainty, inspect the employer result/email or obtain employer confirmation, record evidence and explicitly reconcile as submitted or verified not submitted. Missing confirmation alone is not evidence of failure. An unsubmitted attempt can be closed to approve revised documents; its package/history remain stored. If a submission was confirmed but tracking synchronization failed, retry **tracking synchronization only**, never the employer submission.

Confirmed tracking copies the exact approved bytes into the existing original-file store, with a frozen selected CV snapshot, document hashes and the actual attempt date. It preserves existing notes and never replaces a prior submission snapshot. A storage/concurrent-history conflict remains visible. Manual owner-reported applications, owner-reconciled companion outcomes and browser-observed confirmations are distinguishable in history/analytics.

## Queue, policies and analytics

Recommendations reuse career/stack/salary/location evidence and explainable matches. Unknown eligibility remains a separate review task; the default policy recommends confirmed location-supported jobs only. Recommendations also enforce freshness, chosen boards, score threshold, preferred role phrases, employer exclusions and already-handled vacancies. Location support is not proof of country-specific work authorization.

The existing authenticated cron still runs discovery/reminders/modules. Optional scheduled preparation only **shortlists** suitable jobs using existing storage; it does not claim a generated CV or a completed form. Shortlisting has a daily budget/lease and configurable operating hours/timezone. Before a companion submission, current board/employer policy, hours and an atomic daily intent budget are checked. A reserved intent can consume a slot even if subsequent storage/browser work fails; this conservative behavior prevents overshooting the limit. Unattended submissions cannot be enabled.

Needs Your Attention contains real blockers, eligibility reviews, uncertain outcomes, follow-ups and interview reminders. Activity can be filtered by employer/role, board, companion status and date. Aggregate metrics report stored discoveries/location eligibility, shortlists, packages, verified values, interventions, browser confirmations, manually tracked outcomes, responses, interviews, offers/rejections and follow-ups. Companion history/counts currently cover the latest 500 attempts and recommendations the top 50; historical MongoDB records are retained. Filters narrow the displayed activity; overall metric totals remain labeled separately. No hiring probabilities or invented results are calculated.

## Data and APIs

No destructive migration is needed. New collections/indexes are created lazily: `assisted_attempts`, `assisted_answers`, `assisted_handoffs` (TTL), `assistant_settings`, `assistant_preparation_runs`, `assisted_daily_limits`, `assisted_ai_usage`, `assisted_mapping_cache` (TTL), `assisted_form_knowledge`. Existing collections are not renamed, cleared or backfilled. Only a confirmed submission deliberately updates its existing application and stores its approved files. Back up MongoDB as usual before deployment.

Owner-cookie APIs under `/api/assisted-apply` expose approvals, immutable files, answers, handoffs, review/reconciliation, dashboard and settings. Existing cookie/origin protection covers them. `/api/assisted-companion/*` is a separate, narrowly scoped bearer boundary: it validates hashed token, attempt, extension audience/origin and expiry, has no cookie-auth fallback, and cannot read arbitrary profiles, bank entries or other applications. Permitted operations are package retrieval, readback, optional suggestions, heartbeat, explicit intent, receipt, failure and release. Public preflight responses grant only extension origins; there is no wildcard credentialed CORS.

## Safe demonstration and checks

```sh
npm run extension:build
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
npm run typecheck
npm run lint
npm run test:companion
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:assistant
npm run test:e2e
npm run build
```

The companion suite uses valid fictional PDFs, fictional ATS pages and a local recording server. It runs the shipped background/popup/content code with a **Chrome API transport shim** because this environment's managed Chromium blocks unpacked installations. It checks real browser control/file readback, native events/options, manual legal acceptance, missing/changed fields, explicit approval, one click, uncertain/confirmed receipt handling, login/CAPTCHA and upload failure. It never sends a real application. Database tests separately cover actual route/handoff permissions, immutable documents, concurrency/duplicates, profile invalidation and crash/reconciliation behavior in an isolated test database. Desktop/mobile tests cover integrated navigation and approval controls.

For a safe live check, select a real supported Greenhouse vacancy, prepare/approve a package and fill/review in your permitted local Chrome, but **do not type SUBMIT or confirm submission**. Correct inputs, verify readback, then disconnect/close the unsubmitted attempt. A fixture pass does not prove every live employer form, Chrome installation or confirmation layout is supported. A real submission is outside automated testing and always your explicit decision.
