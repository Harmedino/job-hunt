# CV Builder, manual jobs and 2027 application readiness

This upgrade extends the existing Job Finder, Applications and CV Builder on `master`. It does not reset MongoDB, replace saved CVs or change the Coding Bounties/YouTube modules. Existing development seniority, cybersecurity internship, salary and applicant-location preferences remain in place.

## What already existed

Live job connectors, public company-board discovery, saved searches, social/manual review leads, PDF/DOCX/TXT extraction, a text master profile, evidence-based AI tailoring, Basic Layout, templates, editable CV sections, immutable saved versions, recovery copies and application tracking were retained.

## What was fixed

- Saved and applied history is independent of current discovery filters and expired postings. Unsave no longer means an application was deleted; submitted history remains handled after rediscovery.
- Opening an employer website never records submission. Mark as Applied requires explicit confirmation and accepts the actual submission date separately from record creation.
- CV generation succeeds independently of an optional cover letter. Overload cannot replace a successful CV with a basic or incomplete AI result. Completed generation stages can be retried without repeating them when the input and provider match.
- Imports show conflicting old/new values before changing the master profile. Public upload/import endpoints are proposal-only. Approving fields fills the form; Save profile persists the chosen changes.
- Unsupported known technologies and numeric facts are rejected before the AI factual check. Structured employment/project rewrites must retain their exact heading/date identity and cite their own record. Keyword requests are never candidate evidence.
- Short documents no longer gain a nearly empty second page. Employment, education and project records have distinct headings, metadata and editable bullet lists; the target role is explicitly labeled.
- The saved PDF page preview renders the downloadable PDF. The optional HTML approximation is labeled separately. Unsaved edits require saving and refreshing the PDF preview.

## What was added

### Manual jobs and keywords

**Add Job Manually** is available from Job Finder, Applications and CV Builder. Only a job title is required to save a private job. Description-based suggestions are reviewed before use. Company, original URL, location, work arrangement, type, level, salary/currency, deadline, required/preferred skills, technologies, responsibilities, employer requirements, notes, keywords and custom fields remain editable.

**My Added Jobs** keeps these records visibly user-supplied. No URL, salary, publication date or eligibility is invented. They can create CVs and applications without appearing in a connector feed or having a job URL. An application package is saved as Ready to Apply; it is never automatically Submitted. Master CVs cannot become fake vacancies/application packages.

The keyword editor supports required/preferred/custom terms, priorities, removal, manual entry and reusable CV keyword presets. It shows terms lacking profile support. These presets are separate from saved Job Finder searches. Search presets now also accept role-title lists, technologies and required/excluded terms; rerunning refreshes the existing connectors and applies the saved filters. Fixed-inventory feeds do not become unrestricted full-text provider search APIs.

### Career records and independent CV tracks

My Profile supports editable, reorderable employment, projects, education, contributions, training and certifications, plus grouped skills and custom fields. Dates may be exact, partial or unknown; Present is explicit. Legacy text stays available. Unconfirmed proposals do not silently replace verified source information. Confirmed structured sections are used for new CVs; deleting them does not rewrite earlier CVs.

Development and Cybersecurity Internship tracks share actual source history but have separate summaries/record selections and master CV versions. Development work remains accurately labeled; beginner security learning is not professional SOC employment. Per-CV evidence selection controls what is considered. AI can prioritize/rewrite genuine responsibilities and achievements; Basic mode retains source wording and ranks relevant records.

Individual entries and bullets can be edited, added, removed, reordered and restored from original wording. Source and proposed statements can be compared, approved or rejected. Manual edits are labeled and are not automatically fact-checked. **Update Master Experience** is a separate confirmed action that checks the current employer/role/date identity and profile revision before saving permanent changes.

Master history can be reviewed/restored into the form, then deliberately saved as a new current version. CV history supports category filters, pagination, comparison and restoration as a new immutable version. Autosave recovery retains options and owner review decisions separately from completed CVs.

### NYSC and custom fields

NYSC defaults to Not specified and unconfirmed. In progress, Completed or Exempted must be entered and confirmed by the owner. Completion dates/details are optional. Employer NYSC requirements can prompt a suggestion, but inclusion remains off until deliberately enabled for that CV. Completion claims inconsistent with the saved confirmed status are rejected, including in cover letters. NYSC appears in Additional Information, not as an invented certification. Availability/ready-from date is a separate setting.

Custom fields support named values, editing, ordering and removal in My Profile, manual jobs, CV Builder and saved applications. CV inclusion is a separate explicit selection of confirmed fields. Search/employer requirements do not become master qualifications.

### Documents and applications

PDF and editable Word exports retain selectable single-column text, meaningful filenames, section order, and ordinary contact/project hyperlinks. Body text remains readable; longer content may occupy more than two pages rather than being silently removed. Readability checks report actual PDF page count, contact/heading/reading-order/date/bullet extraction, duplicate/long-content warnings and recovered Word content. There is no ATS percentage or acceptance guarantee.

Applications have explicit stages, counts, manual entry, search/year filters, actual submission dates, notes, follow-ups, interview dates/notes, employer responses, next actions, archive and CSV/JSON history export. Existing in-app notifications show upcoming/overdue actions. No paid notification service was added. Availability and year filters support the 2027 hunt without a new account or clearing history.

At first submission, the chosen available CV/letter source version is snapshotted and its PDF/Word renderings frozen. Actual externally submitted PDF/DOCX/TXT files can be attached separately with owner confirmation. Original bytes, filename and SHA-256 are retained privately. A correction requires a reason and confirmation; earlier originals stay downloadable. Uploaded originals take precedence, and an unavailable original is never replaced by a newer CV. Historical source-only snapshots remain downloadable using their retained source content; old rendering bytes cannot be reconstructed retroactively.

## Persistence and setup

No new dependencies, required API keys, paid search services or environment variables were introduced. Existing MongoDB/production password configuration remains required; AI writing uses the existing server-side Gemini or OpenAI connection. Basic Layout and manual editing do not require AI. Public company-board sources still need no paid API keys.

Additive collections include `manual_jobs`, `keyword_presets`, `profile_history`, `application_files` and expiring `resume_writing_recovery`. Existing profile/application/resume documents gain optional fields. Profile writes use revisions to reject stale overwrites. Uploads are limited to 4 MB, PDF page count is bounded, and DOCX compressed/expanded content is checked before parsing. This is file validation, not a malware-scanner certification. Back up MongoDB as before; application-history export is metadata, not a complete binary-document backup.

## Verification

Validated on 2026-10-28 with Node 24, MongoDB 8 and Chromium:

| Check                                                                                   | Result                                                                                                                  |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                     | Passed                                                                                                                  |
| `npm run lint`                                                                          | Passed                                                                                                                  |
| `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test`                                   | **154 passed; 0 failed, skipped or cancelled**                                                                          |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2` | **82 passed**, desktop and mobile                                                                                       |
| `npm run build -- --webpack`                                                            | Production build passed, including Next's TypeScript check                                                              |
| `npm run test:auth`                                                                     | Unconfigured/configured production authentication passed                                                                |
| `npm run test:cv`                                                                       | Authenticated PDF/DOCX/TXT proposal-only imports and malformed uploads passed                                           |
| `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:builder`                       | Authenticated generation, immutable versions, actual PDF PNG preview, readability and PDF/DOCX CV/letter exports passed |

Database integration checks executed against disposable MongoDB databases, then removed them. Tests use fictional profiles; no real applications are submitted and no personal profile is seeded. They cover manual jobs, keyword/custom-field validation, career tracks, explicit NYSC, import conflicts, unsupported/cross-record claims, independent letter failure/retry, section-only restoration, exact original-file bytes, confirmed corrections, frozen submission renderings and historical source preservation. UTF-16 imports and DOCX embedded-code/external-template/expansion rejection are also checked.

Representative one- and two-page PDF/Word exports were generated and extracted. Actual PDF PNG pages were visually inspected for readable typography, wrapping, margins and page breaks. Browser tests cover manual entry/editing, profile records, NYSC reconfirmation, bullet editing, independent cover-letter retry, preview pagination and horizontal overflow. Existing discovery, matching, saved/applied tracking, bounty and YouTube regression checks also passed. No bounty/YouTube implementation files were changed.

Production tracing contains the PDF fonts, worker modules and native canvas binary needed by the actual preview. Local builds use webpack for this cloud environment; the normal GitHub/Vercel build command remains unchanged. No new installation or startup step is required beyond the existing README environment instructions. The implementation was pushed in separate service (`b266898`) and interface (`2e3daf0`) commits, followed by this documentation update.

## Practical limits

- Scanned/image-only CVs need OCR outside this workflow; automatic OCR was considered and not added. Ambiguous/multicolumn extraction requires owner review.
- Automated factual checks can miss semantic errors. Review every employer, date, technology and achievement before applying. Manually entered claims are owner-provided information.
- Provider quota, overload and model availability remain external. The tests simulate Gemini errors/retries; they do not guarantee live AI service uptime.
- Text extraction cannot prove visual layout quality or every ATS's behavior. Use the actual PDF preview, especially after long manual edits. Word pagination also depends on the installed fonts/Word renderer.
- Local production smoke checks and deployment-provider status are different evidence; live-domain behavior is only claimed when directly observed.
