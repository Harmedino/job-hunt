# Manual job search and preparation

Job Finder opens saved discovery results. **Find new jobs** checks the existing connectors only when you choose it. The dashboard does not run a recurring search. Any separately installed cron remains independent.

Filters apply to the retained results: keywords (title, company and description), role, employment type, experience, posting age and location eligibility. Select **All available postings** to include recent dated results and employer boards verified within 24 hours. Unknown dates are never called new. Strong match means a profile similarity score of at least 65/100; Fresh this week means seven days. Neither count is a hiring probability. Expired and known closed jobs are excluded from current results.

Filters persist in this browser. Save named searches in MongoDB using **Save or repeat a search**; **Run** restores those filters and manually refreshes the existing feeds. No new provider or credentials are needed. A new `job_filter_searches` collection keeps these records separate from existing saved alert URLs.

**Add job for review** accepts a link and/or description. Manual and social imports stay in the verification inbox until reviewed. They do not become confirmed opportunities or submitted applications automatically. Company board configuration and connection diagnostics are available below the opportunities in an expandable panel.

Job cards show the source, location eligibility, type, level, salary, posting age and profile match. Expand **Why this match?** or **View Details** to review evidence and requirements. **Apply** opens the original page; it does not submit or update application status.
