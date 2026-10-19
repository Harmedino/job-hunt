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

For production, set a strong `APP_PASSWORD`, then run `npm run build && npm start` behind HTTPS. The sign-in page at `/login` asks for that password; no username is needed. A successful login creates an HTTP-only session cookie lasting eight hours (Secure in production, SameSite=Lax). Changing APP_PASSWORD invalidates existing sessions. Production keeps private pages and APIs locked when it is unset, while the sign-in page explains how to finish configuration. After setting or changing a Vercel environment variable, redeploy and open the newest deployment URL; Production and Preview variables have separate scopes. This is a single-owner tool, not a multi-user SaaS. Development is unprotected unless `APP_PASSWORD` is set. Protect database backups and restrict access to the deployment.

## What works in this stage

- Responsive Job Finder, Applications, CV Builder, and My Profile navigation.
- Real Remotive and Arbeitnow public feeds, Remote OK JSON, We Work Remotely full RSS, and Himalayas keyword search; source links, company, salary when provided, description, posting date, recency filters, and duplicate removal.
- Worldwide employers and fully remote openings only; explicit onsite/hybrid title/location labels and office-work requirements are excluded. Hybrid-cloud technical skills are not confused with hybrid work. Junior/mid-level development and security title filtering. Source location evidence is checked for Nigeria: explicit global/Africa/Nigeria locations are candidates; ambiguous remote locations require review and are hidden by default. Some location restrictions are rejected automatically. **This is conservative text screening, not an immigration/work-authorization guarantee.** Confirm the employer's original posting.
- Jobs older than 30 days are excluded. Successful source refreshes remove postings no longer present in that source's current feed; application history is retained. Feed pagination limitations can also remove still-open jobs from discovery, so always retain original application links. Preparation rechecks the current sources and blocks when the posting cannot be confirmed. Bounded Himalayas search results are not treated as an exhaustive feed: missing listings are retained until expiry or the 30-day cutoff, and source outages retain cached jobs.
- Profile editing and PDF/DOCX/TXT CV text import (4 MB maximum, below Vercel’s function request-size limit; scanned PDFs need OCR). The picker opens even before storage is configured. Uploads populate empty contact, skills, experience, education, and project fields from recognised CV content, and retain the raw text. Existing profile entries and browser edits are preserved. For earlier uploads, use **Fill profile from saved CV**. Saved versus unsaved state is shown explicitly. MongoDB is still required for durable storage. Original file bytes are not retained. Review imported text before use.
- Explainable skill-overlap match scores. These scores are a heuristic, **not AI suitability judgments**. Save skills and refresh discovery to update scores.
- Optional Google Gemini or OpenAI CV extraction, job-specific CV and cover-letter writing, and evidence ranking. Profile import requires exact excerpts. The CV Builder writes source-cited paragraphs, rejects unsupported numbers and dates, and uses a separate factual-checking request against the original evidence before accepting rewrites. Rejected rewrites are omitted or fall back to the original profile section, with visible feedback. Without a configured provider key, an explicitly labelled profile-based builder still works. Provider errors are surfaced.
- A CV Builder with editable contact details, summary, skills, experience, projects, education and optional named sections for contributions, training and certifications; live preview; immutable saved versions; and formatted A4 PDF export. Embedded DejaVu fonts preserve supported accented characters and long CVs paginate. Legacy preparation PDFs retain their basic Latin font behavior. Saved builder versions can be linked to eligible, currently confirmed applications; linking is blocked after submission to preserve the submitted package.
- Saved/Preparing/Ready for review/Submitted/Interview/Rejected/Offer tracking and follow-up notes. Submitted is a user-reported status, not proof that an employer received anything.
- New strong matches posted within 72 hours generate a deduplicated in-app notification. Notifications are read when the dashboard opens or discovery finishes; email/push delivery is not implemented.

## Why an empty finder can happen

The dashboard now starts a search on first visit or when the last stored search is older than six hours. After a complete source outage it retries on a later visit after 15 minutes. Scheduled discovery still needs a deployed scheduler and its credential. Without MongoDB, the first search runs on each visit and results are not saved.

**Search activity** reports each source's checked and accepted counts, unavailable APIs, and exclusions for role, remote work, age, location and duplicates. Ambiguous applicant locations stay hidden by default, with a visible count and **Review location requirements** action. A failed search has its own error state. An AI API key is not required for job discovery. MongoDB failures preserve live results with an explicit unsaved warning.

Himalayas searches ten role keywords rather than scanning unrelated newest postings. The source's documented empty country list means worldwide; country lists and UTC+1 timezone restrictions are independently checked for an applicant based in Nigeria. The employer search remains worldwide. Searches request entry-level and mid-level source metadata so senior listings do not fill each result page. Each query checks up to three result pages, continues past short pages until an empty result, and retains earlier pages if a later page fails. Three workers bound concurrent requests and the search has a 30-second budget. Coverage remains limited. Search upgrades trigger one refresh on the next visit. Senior-only source metadata, founders/executives, sales, mobile-only React Native roles, future-position talent pools, volunteer positions, freelancer titles, explicit office arrangements and geographic restrictions are excluded. A generic software-engineer title can qualify when its description identifies frontend technologies.

Outbound source fetches use Next.js caching: six hours for Remotive (whose public feed is delayed 24 hours and advises at most four calls daily), and 15 minutes for the other feeds. Sources are attributed on job cards and link to their original listing URLs. No first-day coverage or continuous availability is guaranteed.

## Build a job-specific CV

1. Import your CV in My Profile, review the extracted details and save your qualifications.
2. Open **CV Builder** and paste a role title and job description, or choose **Build tailored CV** from a discovered job or saved application. Pasted descriptions do not become verified job listings or applications.
3. Choose AI writing when connected, or create a profile-based draft. AI uses your saved qualifications, not assumed skills from the job description. The profile-based mode keeps project records together, uses an existing source summary when present, and otherwise creates a summary from matching saved skills.
4. Edit any CV section and check the live preview. Review source qualifications and any requirements marked for checking. Automated factual checks reduce unsupported claims but do not establish perfect accuracy; review the wording. Manual edits are your own assertions and are not automatically fact-checked.
5. Save a new version or download the formatted PDF. Edits are saved as separate immutable versions. Existing profile details and older CVs remain unchanged; unsaved edits are preserved when generating or opening another version. The editor stays mounted when switching dashboard tabs, but refresh loses unsaved browser edits.
6. When opened from a saved application, **Use this CV for application** links the selected saved version after checking the current job and location evidence. The application's PDF downloads that version. Once an application is marked submitted or later, its linked version cannot be replaced. No application is submitted by the builder.

MongoDB is required for CV drafts and versions. Up to 50 recent versions appear in the history; saved records retain the target description, source profile snapshot and edited content. The bundled DejaVu font license is in `src/assets/fonts/LICENSE.txt`; no fonts are downloaded during PDF generation. The layout uses selectable text, clear headings and a single column; no ATS acceptance is guaranteed.

## Connect the AI résumé assistant

One connection to **Google Gemini or OpenAI** supports CV-to-profile extraction, job-specific CV and cover-letter writing, factual verification and evidence ranking. You must create your own provider key; the app cannot generate credentials or reuse a ChatGPT/Gemini app subscription.

1. Recommended alternative: create a Gemini key at [Google AI Studio](https://aistudio.google.com/apikey). Review provider data-use terms before sending personal CVs; quotas, availability and billing depend on your account. OpenAI keys are available at [OpenAI](https://platform.openai.com/api-keys).
2. In Vercel → Project Settings → Environment Variables, add `GEMINI_API_KEY` for Production, then redeploy. Set `AI_PROVIDER=gemini` if both provider keys exist. With only a Gemini key, the default `AI_PROVIDER=auto` selects it. For OpenAI instead, add `OPENAI_API_KEY`. Never use a `NEXT_PUBLIC_` variable or paste keys into the app, chat, Git or workflow files.
3. In My Profile → Connections, click **Test AI connection**. This sends a small request without personal data; “Configured” alone only means the key is present. Authentication, quota, model and network errors are shown without exposing credentials or raw provider responses.
4. Upload your CV or choose **Fill profile from saved CV**, review the imported fields and save edits. AI-enabled imports send extracted CV text to the selected provider. If the provider fails, clearly labelled section-based import still works.
5. Open CV Builder or choose **Build tailored CV** from an application. Enable AI writing, then review the generated summary and sections, unsupported requirements, source evidence and PDF. Writing and factual verification use two provider calls; provider usage charges apply.

`AI_PROVIDER` accepts `auto`, `gemini` or `openai`. Automatic selection preserves an existing OpenAI connection first, otherwise uses Gemini. An explicit provider requires its own key; failures never silently send your CV to another provider. Gemini uses `gemini-flash-latest`, the model alias in Google's current SDK quickstart; set `GEMINI_MODEL` to an available JSON-capable text model to pin it. OpenAI defaults to `gpt-4o-mini`, overridable with `OPENAI_MODEL`. A key with usable API access/quota is required for live writing. Server-side keys are sent only to fixed provider endpoints, never included in URLs or UI responses. Gemini blocked/truncated responses are rejected. Provider requests and connection checks are not cached.

OpenAI requests use `store: false`; Gemini requests follow Google’s data-use terms. Provider retention policies still apply. Without a key, recognised CV sections still populate the profile and preparation uses an explicit factual template. AI rewrites are grounded in cited profile evidence and checked separately; credentials and qualifications must not be invented. Automatic submission is not enabled.

## Social job posts

The Job Finder includes an inbox for individual job posts shared on X, Facebook, Reddit, and WhatsApp. Paste the source link and job text; MongoDB stores a deduplicated lead marked **Needs verification**. No social page, private group, or channel is scraped or fetched by the server. Posts never become verified jobs or submitted applications just because they were imported. Check the employer’s original listing, age, location eligibility, and application route first. Archive misleading, closed, or irrelevant posts.

The source-directory panel researches worldwide remote-job publishers Remotive, We Work Remotely, Remote OK, Himalayas, and Working Nomads, plus candidate Reddit communities r/remotejobs, r/remotejs, and r/cybersecurity. These are research candidates, not guaranteed legitimate job feeds. Click **Find publisher social links** to inspect public publisher homepages: X/Facebook accounts and public WhatsApp channel URLs are added only if their exact links are present on the publisher page. Contact-only WhatsApp links and sharing buttons are excluded. Reddit checks confirm public community metadata only, not hiring activity or job legitimacy. Failed checks remain visibly unconfirmed; no social handles or channel IDs are guessed. Research can run without MongoDB; configured MongoDB retains source records. Source research does not scrape social timelines or automatically import their jobs.

Monitoring specific accounts/groups/channels requires their verified public links and any necessary platform-authorized API access. Private content must be shared by the owner or connected through an authorized route. Do not upload unrelated conversations or third-party personal data. This inbox does not yet turn social-only posts into automated application packages.

## Scheduling

`GET /api/cron` requires `Authorization: Bearer <CRON_SECRET>`. Set a strong secret in the deployment environment. That endpoint uses only its bearer token so external schedulers can call it.

`vercel.json` uses a daily schedule (`0 6 * * *`, approximately 07:00 WAT), which is compatible with Vercel Hobby. Hobby execution can occur within the scheduled hour. Set `CRON_SECRET` in Vercel before deployment. Deploying configuration and adding a secret are separate steps; **the app does not install a live schedule itself**.

For discovery throughout the day without upgrading Vercel, the optional `.github/workflows/discover.yml` runs every six hours and can also be started manually in GitHub Actions. Enable it by adding repository Actions secrets `JOB_HUNT_URL` (your HTTPS deployment URL) and `CRON_SECRET` (the same value configured in Vercel). Without both secrets, it skips the request. GitHub schedules can be delayed and are not an exact-time guarantee; normal Actions usage limits apply. The daily Vercel run remains a fallback, and notification deduplication prevents repeat alerts. Do not paste secrets into workflow files, committed crontabs, logs, or chat.

For another host, configure a scheduler to call `scripts/discover.sh` every six hours with those variables supplied securely by the host.

Respect public source rate limits and terms. Manual discovery is available; do not repeatedly poll. The current sources may delay listings, omit eligible roles, or fail. No first-24-hours coverage is guaranteed.

## Network access

Allow outbound HTTPS to `remotive.com`, `www.arbeitnow.com`, `remoteok.com`, `weworkremotely.com`, `himalayas.app`, and optionally `api.openai.com`. npm uses `registry.npmjs.org`. GitHub pull-request creation also needs `api.github.com`; Git transport alone does not imply API access. When the host requires a proxy, launch Node 24 with `NODE_USE_ENV_PROXY=1` to honor its supplied proxy variables. Do not disable TLS verification.

## Validation

```sh
npm run lint
npm test
# Runs the storage/API integration test against a separate disposable test database:
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:auth # requires a production build and Chromium
npm run test:cv # actual production upload route and deployment tracing
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:builder # authenticated builder and font tracing
# Or use a trusted system Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Storage tests use a temporary `job_hunt_test_<pid>` database and drop it afterward. Integration fixtures are confined to tests and never seed the application database. Browser tests exercise both desktop and mobile navigation, error/empty states, and setup behavior with mocked unavailable feeds. These tests do not establish live source or AI-provider connectivity.

## Next stages / deliberate limitations

Direct company-career adapters, semantic AI job matching, email/push alerts, OCR, additional PDF font coverage, and platform-specific browser form filling remain future stages. Current application actions open the original job page and prepare downloadable materials. No browser automation or automatic submission is enabled. A future adapter must verify platform permission, keep unknown answers pending, and stop for your review before any submission. It must not bypass CAPTCHAs, logins, or platform rules.

For source research, allow HTTPS to remotive.com, weworkremotely.com, remoteok.com, himalayas.app, workingnomads.com (and their www variants for redirects), and www.reddit.com. Visiting discovered social pages may additionally require x.com, facebook.com, and whatsapp.com. The cloud draft includes these additions; it does not establish current connectivity.

## Editable CV and cover-letter documents

The CV Builder creates a CV and cover letter for a chosen listing or pasted job description. Switch between **CV** and **Cover letter** to edit either, and choose Clean professional, Modern accent or Compact minimal styling. Both documents download as PDF or editable Word (.docx), using actual Word paragraphs. Downloads save pending edits as a new immutable version. The style, CV and letter stay together in that version; existing older CVs remain usable.

AI drafting now writes cover-letter body paragraphs alongside CV claims. Each paragraph cites profile evidence and undergoes the same separate factual check as CV content. Unsupported text is omitted; without verified letter paragraphs, the letter uses profile facts and clearly remains editable. Profile-based drafts work without an AI key. Manual edits are your own claims and are not automatically verified. Linking a saved version to a pending application uses its edited cover letter; submitted versions remain unchanged.

### CV section and project layout

New CVs do not append residual uploaded-CV text under “Additional qualifications”. Only recognised, named sections are rendered. Unstructured source text remains available to the evidence checks; it is not automatically printed. Explicit Open-source contributions, Training & community and Certifications sections are kept separate from Projects and omitted when empty. Placeholder text such as “No certifications listed” is omitted.

Project records use a project name, a technologies line and achievement bullets. Names are bold, technologies use a smaller muted style, and bullets are grouped under their own project in the preview, PDF and editable Word file. Imports preserve original line breaks, including AI-quoted excerpts. Project text can be edited directly; separate entries with blank lines.

Opening an older CV in the builder prepares a cleaned editor copy, removes the catch-all and separates recognised headings previously captured inside Projects. Saving or downloading creates a new version with `layoutVersion: 2`. Stored older versions and already-linked application exports retain their earlier layout; the cleanup does not overwrite profile data or submitted documents.
