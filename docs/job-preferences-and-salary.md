# Career, salary and vacancy preferences

These changes extend the existing finder; they do not migrate or delete profile, job or application records.

## Defaults and separate paths

**Development Jobs** targets junior and intermediate development. Senior, staff, lead, principal, architect and management titles, advanced responsibilities, and minimum requirements beyond the configured level are excluded. A generic Software Engineer title does not establish intermediate experience. Unknown levels retain an explicit review label.

**Cybersecurity Internships** accepts actual security internships and structured beginner trainee/apprentice placements. SOC, information-security, security-operations, blue-team, network-security and IT-security terminology is included. Regular SOC jobs are excluded even if their descriptions mention entry-level skills. Professional security experience requirements and advanced responsibilities are excluded. Unpaid security internships remain available with an explicit compensation label.

Development employment is not counted as security employment. Matching uses separate cybersecurity skills/experience/projects, with relevant declared beginner skills and explicitly security-related projects. Skills mentioned only in the vacancy are not added to the profile.

Each path remembers its own filters. My Profile exposes maximum development level, security target level, separate security evidence, relative ranking weights and per-path default searches. Current defaults apply to older profiles without requiring a destructive migration. Changes are retained when the profile is saved. No professional experience is invented to satisfy a level setting.

Existing Himalayas queries now interleave development and nine internship variants within the same bounded three-worker/30-second search budget. Existing bulk public feeds and ATS registries retain broad inventories; personal career restrictions govern recommendations. No new job API or paid service was added.

## Salary rules

- Junior/entry frontend and frontend internships need a guaranteed monthly lower amount of **₦300,000**, configurable in My Profile. Confirmed lower pay is excluded. Undisclosed amounts appear under Salary Unknown; ambiguous periods, currencies, upper-only ranges or missing/current-rate evidence go to Salary Needs Review / Needs Review.
- Intermediate frontend jobs remain eligible subject to other requirements. Junior/intermediate backend and full-stack remain eligible. Node.js/Express backend internships must be explicitly paid. Unpaid backend internships and unrelated backend internship stacks are excluded; uncertain backend pay stays review-only.
- Original salary text is preserved. Annual amounts divide by twelve; weekly amounts multiply by 52/12. Hourly amounts convert only when weekly working hours are advertised. Amounts are normalized to currency minor units to avoid floating-point threshold errors. No working hours, currencies or salary period are guessed.
- Native NGN needs no exchange rate. Foreign amounts require a manually configured rate, source reference and checked date in My Profile. There are **no default exchange rates**. A bare $ sign does not establish USD. Rates older than thirty days require review. Estimated NGN amounts show the rate/source/date and do not change the original advertisement.
- Use the guaranteed lower range for qualification. A range whose upper end alone meets the minimum stays Needs Review. Minimum monthly salary/currency, highest/lowest salary, skills, freshness, experience and confirmed-location sorting remain user controlled. Missing or stale conversions do not sort as established naira amounts.

Best Match uses configurable relative weights for career fit, actual skills, level fit, salary basis, location, freshness and link evidence. Hard exclusions take precedence. Scores are explainable relevance, not hiring probabilities or employment guarantees. Official ATS URL evidence is not a guarantee that an employer or offer is legitimate.

## Duplicates and handled jobs

Exact official vacancy URLs, ATS identifiers and compatible requisition evidence group advertisements into one card. Tracking parameters and Greenhouse host variants are normalized; employer suffixes are normalized conservatively. Sources and alias IDs are retained. Different requisitions, incompatible employment types and materially different specific locations remain distinct. Similar titles without enough identity evidence are flagged for review, not automatically deleted.

Saved or applied equivalents disappear from new opportunities immediately, including later advertisements with different provider IDs. **Show saved/applied jobs** is off by default. Saved Jobs and Applied Jobs remain separate; original source, URL, description, CV versions, letters and submitted snapshots remain preserved. Unsave changes only a saved flag and retains work history. An unsaved job returns to new results only while it is still in current discovery and meets the active rules. Previously applied jobs cannot be unsaved into new opportunities. Saving alone never records submission.

Discovery adds `vacancy_groups` and grouping metadata. It marks absent/expired records closed instead of deleting their original data; submitted application records are not rewritten. GET results also group legacy duplicates before display. No production database was attached to this cloud checkout, so production-record cleanup is not claimed; the additive behavior is exercised in disposable database tests and applies on the next discovery refresh.

## Configuration and validation

No new environment variables or paid keys. Salary rates are private profile settings with explicit provenance. Existing MongoDB and production password requirements continue to apply. Run lint, TypeScript, all unit/database tests, desktop/mobile browser tests, and the webpack production build as documented in README. The new regressions cover cross-provider saved aliases, unsave, immutable submission history, development/security separation, seniority, paid Node.js exceptions, salary conversions/ranges/unknowns and independent career filters.
