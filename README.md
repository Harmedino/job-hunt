# Launchpad — personal job finder

A private Next.js + TypeScript + Tailwind workspace for remote development and entry-level security opportunities. MongoDB stores your profile, job records, application packages, and deduplicated in-app alerts. There are no sample jobs in the application.

## Run locally

Requires Node.js 24 (see `.node-version`), npm, and MongoDB 8 or a MongoDB Atlas connection.

```sh
npm ci
cp .env.example .env.local
# Either start the supplied MongoDB service, or set MONGODB_URI to your existing database:
docker compose up -d mongodb
npm run dev
```

Set `MONGODB_URI` in `.env.local` before saving personal data. The default local MongoDB port binds only to loopback. Use an authenticated MongoDB connection for hosted deployments. Without MongoDB the finder can still fetch live jobs, but saving and preparation are disabled. This repository does not include your personal credentials or CV.

For production, set a strong `APP_PASSWORD`, then run `npm run build && npm start` behind HTTPS. HTTP Basic auth accepts any username and requires that password. Production fails closed when it is unset. This is a single-owner tool, not a multi-user SaaS. Development is unprotected unless `APP_PASSWORD` is set. Protect database backups and restrict access to the deployment.

## What works in this stage

- Responsive Job Finder, Applications, and My Profile navigation.
- Real Remotive and Arbeitnow public feeds; source links, company, salary when provided, description, posting date, recency filters, and duplicate removal.
- Junior/mid-level development and security title filtering. Source location evidence is checked for Nigeria: explicit global/Africa/Nigeria locations are candidates; ambiguous remote locations require review and are hidden by default. Some location restrictions are rejected automatically. **This is conservative text screening, not an immigration/work-authorization guarantee.** Confirm the employer's original posting.
- Jobs older than 30 days are excluded. Successful source refreshes remove postings no longer present in that source's current feed; application history is retained. Feed pagination limitations can also remove still-open jobs from discovery, so always retain original application links. Preparation rechecks the current feed and blocks when the posting cannot be confirmed.
- Profile editing and PDF/TXT CV text import (5 MB maximum; scanned PDFs need OCR). Original file bytes are not retained; extracted text is saved in MongoDB. Review imported text before use.
- Explainable skill-overlap match scores. These scores are a heuristic, **not AI suitability judgments**. Save skills and refresh discovery to update scores.
- Optional OpenAI evidence ranking during application preparation. AI can only select existing evidence blocks by index; generated factual claims are never accepted. PDFs and cover letters use these exact facts. Without `OPENAI_API_KEY`, preparation clearly uses a profile-based template. Provider errors are surfaced rather than silently pretending AI succeeded.
- Per-application downloadable PDF, reviewable cover letter, and profile snapshot. Preparation is blocked after submission to preserve the submitted package. Basic PDF output uses built-in Latin fonts; unsupported Unicode characters are replaced with spaces. Check the downloaded PDF before submission.
- Saved/Preparing/Ready for review/Submitted/Interview/Rejected/Offer tracking and follow-up notes. Submitted is a user-reported status, not proof that an employer received anything.
- New strong matches posted within 72 hours generate a deduplicated in-app notification. Notifications are read when the dashboard opens or discovery finishes; email/push delivery is not implemented.

## Scheduling

`GET /api/cron` requires `Authorization: Bearer <CRON_SECRET>`. Set a strong secret in the deployment environment. Unlike the dashboard, that endpoint uses only its bearer token so external schedulers can call it.

`vercel.json` uses a daily schedule (`0 6 * * *`, approximately 07:00 WAT), which is compatible with Vercel Hobby. Hobby execution can occur within the scheduled hour. Set `CRON_SECRET` in Vercel before deployment. Deploying configuration and adding a secret are separate steps; **the app does not install a live schedule itself**.

For discovery throughout the day without upgrading Vercel, the optional `.github/workflows/discover.yml` runs every six hours and can also be started manually in GitHub Actions. Enable it by adding repository Actions secrets `JOB_HUNT_URL` (your HTTPS deployment URL) and `CRON_SECRET` (the same value configured in Vercel). Without both secrets, it skips the request. GitHub schedules can be delayed and are not an exact-time guarantee; normal Actions usage limits apply. The daily Vercel run remains a fallback, and notification deduplication prevents repeat alerts. Do not paste secrets into workflow files, committed crontabs, logs, or chat.

For another host, configure a scheduler to call `scripts/discover.sh` every six hours with those variables supplied securely by the host.

Respect public source rate limits and terms. Manual discovery is available; do not repeatedly poll. The current sources may delay listings, omit eligible roles, or fail. No first-24-hours coverage is guaranteed.

## Network access

Allow outbound HTTPS to `remotive.com`, `www.arbeitnow.com`, and optionally `api.openai.com`. npm uses `registry.npmjs.org`. GitHub pull-request creation also needs `api.github.com`; Git transport alone does not imply API access. When the host requires a proxy, launch Node 24 with `NODE_USE_ENV_PROXY=1` to honor its supplied proxy variables. Do not disable TLS verification.

## Validation

```sh
npm run lint
npm test
# Runs the storage/API integration test against a separate disposable test database:
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
npm run build
npx playwright install chromium
npm run test:e2e
# Or use a trusted system Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Storage tests use a temporary `job_hunt_test_<pid>` database and drop it afterward. Integration fixtures are confined to tests and never seed the application database. Browser tests exercise both desktop and mobile navigation, error/empty states, and setup behavior with mocked unavailable feeds. These tests do not establish live source or AI-provider connectivity.

## Next stages / deliberate limitations

Direct company-career adapters, semantic AI job matching, email/push alerts, OCR/DOCX import, full Unicode PDF typography, and platform-specific browser form filling remain future stages. Current application actions open the original job page and prepare downloadable materials. No browser automation or automatic submission is enabled. A future adapter must verify platform permission, keep unknown answers pending, and stop for your review before any submission. It must not bypass CAPTCHAs, logins, or platform rules.
