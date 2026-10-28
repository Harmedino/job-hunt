# Manual job search and preparation

Job Finder opens saved discovery results. **Find new jobs** checks the existing connectors only when you choose it. The dashboard does not run a recurring search. Any separately installed cron remains independent.

Filters apply to the retained results: keywords (title, company and description), role, employment type, experience, posting age and location eligibility. Select **All available postings** to include recent dated results and employer boards verified within 24 hours. Unknown dates are never called new. Strong match means a profile similarity score of at least 65/100; Fresh this week means seven days. Neither count is a hiring probability. Expired and known closed jobs are excluded from current results.

Filters persist in this browser. Save named searches in MongoDB using **Save or repeat a search**; **Run** restores those filters and manually refreshes the existing feeds. No new provider or credentials are needed. A new `job_filter_searches` collection keeps these records separate from existing saved alert URLs.

**Add job for review** accepts a link and/or description. Manual and social imports stay in the verification inbox until reviewed. They do not become confirmed opportunities or submitted applications automatically. Company board configuration and connection diagnostics are available below the opportunities in an expandable panel.

Job cards show the source, location eligibility, type, level, salary, posting age and profile match. Expand **Why this match?** or **View Details** to review evidence and requirements. **Apply** opens the original page; it does not submit or update application status.

## CV preparation

1. Choose a discovered job, saved application or manual description. Existing descriptions are collapsed by default.
2. Review required/preferred skills, profile mentions, missing evidence and exact relevant experience/projects. Mentions do not prove proficiency, years or credentials.
3. Select AI writing or Basic Layout explicitly; edit entries and bullets beside the actual saved-PDF preview. Cover letters are optional and generated separately. Empty sections collapse. Use the arrows to reorder sections; the same order is retained in saved versions, autosaves, PDF, Word and readability exports. Compare with the master, check selectable PDF text, or open the actual saved PDF layout. Revert clears unfinished edits with a newer revision so delayed autosaves cannot restore them.
4. Save a version and application package, download either document, open the original page and track status. A manually added or pasted target can be saved without a URL; missing links remain unknown. It stays labeled as a manual, unverified job and is not inserted into discovery as a confirmed vacancy.

## Applications

Track Saved → Preparing → Ready to Apply → Submitted → Interview / Rejected / Offer manually. Existing `Ready for review` database records display as Ready to Apply without a destructive migration. Notes, application date, follow-up date and interview information save on leaving each field. Follow-up dates appear as dashboard reminders; there are no new email/notification services. A date alone never changes submission status.

Submission requires explicit confirmation in the interface and its API request. The original submitted CV and letter are snapshotted. Generating another version or moving the status backward does not replace that package.

No new environment variables, paid search keys or services are required. MongoDB adds `job_filter_searches` and private TTL-limited `resume_generation_recovery` records alongside existing data. Production still needs its existing database, password and optional server-side AI credentials.

See [the CV and application upgrade guide](cv-and-application-upgrade.md) for structured records, import approval, career tracks, NYSC, keyword presets, original submission files and validation evidence.
