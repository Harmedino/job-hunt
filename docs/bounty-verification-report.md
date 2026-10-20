# Bounty discovery and verified-only results

Validated 20 October 2026. The workspace defaults to **Verified Funded**, following the user's explicit preference over the attachment's broader default. Other classifications require an explicit filter change; resetting filters restores verified-only mode.

## Root causes

- The previous frontend gate required both current funding evidence and historical payout proof. Missing payout history hid otherwise eligible tasks.
- Discovery ran two label queries on one page each. Multiple user keywords were combined, narrowing coverage. Duplicate hits were counted before deduplication.
- The technical score included financial evidence, so funding and technical relevance were not independent.
- Old proof links had no named authority, task binding or expiry. A saved link alone could look more conclusive than it was.
- Empty states did not distinguish source failures, saved candidates and active filters. Repository metadata and the saved workspace were bounded, but those limits were not sufficiently visible.

## Changes

- Discover and save real source issues without requiring current funding or past payouts. Six independent GitHub search variations cover bounty labels, bounty language, reward, paid, cash reward and `/bounty`. User technologies rotate across independent queries; public/open/issue qualifiers remain enforced.
- Retrieve up to two pages per variation, within request/time budgets, and deduplicate before insertion. Preserve existing results and last-success timestamps on failures. Routine refresh uses no AI calls.
- Classify funding separately as Verified Funded, Reward Announced, Unverified Bounty or Unpaid / No Reward Found. Closed or expired tasks appear as Inactive while their financial classification remains separate.
- Verified Funded requires positive current funding, escrow/deposit evidence, conditions, a named authority and an explicit manual confirmation tied to the exact task. Evidence expires after seven days. Historical payout proof is optional and never verifies a new reward. Legacy links do not qualify automatically.
- Technical relevance excludes financial evidence. Ranking and filters distinguish confirmed and advertised rewards without converting currencies or treating an unknown amount as zero. Generic payment-form costs and negative reward statements do not become reward announcements.
- Cards expose evidence, check dates, financial classification, risk, original links, source status, skills and available estimates. Diagnostics show actual query outcomes, duplicate counts, stored classifications, active-filter exclusions and last successful refresh. Reset restores strict defaults.
- Refresh recalculates stored technical scores and financial warnings. AI planning receives current funding classification and advertised/confirmed amounts separately. Basic task analysis remains available during AI failures.

## Live source test

The actual application discovery function, normalization, persistence and workspace snapshot ran against official GitHub endpoints and an isolated local MongoDB database. Chromium then rendered that snapshot. No generated or mocked opportunities were inserted into production.

| Measurement | Result |
| --- | ---: |
| Raw GitHub search hits | 240 |
| Duplicates removed | 54 |
| Unique issues saved and returned by the snapshot | 186 |
| Verified Funded | 0 |
| Reward Announced | 24 |
| Unverified Bounty | 74 |
| Unpaid / No Reward Found | 88 |
| Inactive in this open-issue search | 0 |
| Visible under the default verified-only filter | 0 |
| Potentially paid after explicit filter change | 98 |

All eight attempted query pages succeeded. The run was intentionally bounded by the anonymous request budget; these are sample results, not an exhaustive search of GitHub. Chromium confirmed zero cards under verified-only mode, correct candidates after explicit broadening, and zero again after returning to Verified Funded.

## Providers and limitations

- **GitHub:** live official API queries succeeded. Search results establish source metadata and, where attributable, advertised rewards. They do not establish escrow or payment guarantees. Comments are not exhaustively fetched; missing evidence remains unknown.
- **Algora:** the official published legacy controller returns an empty list: https://github.com/algora-io/algora/blob/main/lib/algora_web/controllers/api/bounty_controller.ex . No working authorized current-funding API was verified; original-link import remains manual.
- **IssueHunt:** no documented authorized live discovery/funding contract was verified. Original-link import remains manual. No prohibited scraping or guessed endpoint was added.
- No integration independently confirms current escrow, sponsor credibility or payout eligibility. Verified funding entries record an authenticated owner's manual check of authoritative evidence, displayed as such. The test found no currently funded opportunities that could be confirmed, so the strict view correctly remained empty.
- The workspace snapshot returns at most 500 saved records. Discovery enriches up to six repositories per run, and saved-task refresh checks up to eight active issues. Source failures retain prior data; partial/bounded results are labeled.

## Validation

- ESLint, TypeScript and whitespace checks passed.
- All 88 unit/database tests passed without skips; 16 relevant domain tests were rerun after tightening announcement detection.
- All 50 desktop/mobile browser checks passed after scoping an existing ambiguous Remotive selector to its source article. The other 48 checks passed in the full run; both dashboard checks passed on the targeted rerun.
- A separate live-data Chromium check passed for discovery → MongoDB → snapshot → dashboard filtering.
- Production webpack build passed. Deployment uses the existing default build configuration.
- The first GitHub run exposed an infrastructure failure: MongoDB 8 refused the moving runner kernel (Linux >= 6.19), causing database connection failures. CI now pins the documented Ubuntu 22.04 / Linux 6.8 runner image and checks MongoDB health before executing tests. No database test was removed or skipped.

Job Finder and YouTube behavior were preserved. Remaining limitation: there is no working authorized source for independent automatic funding confirmation, and no verified-funded live result was manufactured to fill the list.
