# CV bullet formatting and cybersecurity internship tailoring

Follow-up on 2026-10-29 to the [CV Builder upgrade](cv-and-application-upgrade.md).

## Formatting

Common PDF/Word bullets (`●`, `•`, `▪`, `◦`, `‣`, `⁃`) are recognized even when an imported paragraph puts several bullets on one line. Experience and project bullets become separate PDF lines, editable Word list items, HTML list items and individual editor fields. Date dashes, technology separators, employer/project names and ordinary prose keep their meaning. This is presentation cleanup; it does not invent or rewrite achievements.

## Career tailoring

Manually entered jobs now select the corresponding CV track when their career category changes. An explicit owner override stays editable. A mismatched job/track shows a correction action.

Cybersecurity internship CVs prioritize supported security foundations and learning, with development skills grouped as transferable skills. Development employment keeps its real employer, title and dates. The owner-supplied cybersecurity summary takes precedence over a generic imported summary. Without a dedicated summary, Basic Layout creates a concise internship-focused introduction using the actual saved evidence. A generic software-development duration is not presented as professional cybersecurity experience. Development CVs retain their own source information.

AI analysis/writing receive the selected track explicitly and continue to use cited evidence and factual verification. No new job requirement becomes a candidate skill. The change does not independently establish whether a user-provided duration or certification is true.

## Refreshing an existing saved CV

1. Open the security job and select **Cybersecurity · internship and supervised learning** in **CV career track**. Use **Use this job’s career track** if shown.
2. Build a new CV using AI or explicitly select Basic Layout. Alternatively, use **Refresh Professional summary for internship (no AI)** and **Refresh Skills for internship (no AI)** to update just those saved sections.
3. Review the actual PDF preview and download the new version.

Section refresh uses the selected career evidence, preserves earlier evidence references, and clears owner approvals for the newly rewritten section. Basic refresh is marked as an edited version rather than AI-verified writing.

Earlier CV versions, the master profile and frozen submitted documents are preserved. Their saved summary content is not silently replaced. Newly rendered editable previews/exports receive the list-formatting correction; actual original submission files remain byte-for-byte unchanged.

## Validation

- TypeScript and lint passed.
- **160 unit/database tests passed, with no failures or skips**, after starting the local MongoDB service.
- All **82 existing desktop/mobile browser checks passed**. Both new desktop/mobile checks passed after correcting their fictional profile fixture and using the accessible textbox name to inspect the individual bullets.
- The production webpack build and authenticated authentication, upload and CV Builder smoke scripts passed, including actual PDF-page rendering and PDF/Word exports.
- A fictional internship CV was exported to PDF and Word. Its actual one-page PDF render was visually inspected: grouped skills, a career-specific summary, preserved development titles/dates and separate bullets were readable without clipping.

The tests use fictional data. No personal career facts or submitted application files were changed, and no additional API keys, dependencies or paid services were introduced. Automated factual checks still require owner review; provider availability remains external.
