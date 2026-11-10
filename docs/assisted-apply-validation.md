# Assisted Apply v1 validation

The implementation reuses the existing private owner account, CV Builder and MongoDB records. No real employer application was submitted during development or testing.

| Check | Result |
| --- | --- |
| Full unit/database regression suite | 181 passed; 0 failed or skipped. Includes immutable packages, duplicate/concurrent claims, exact answer mapping, file hashes, handoff scope/expiry, profile invalidation, uncertain recovery, concurrent daily limits, provider failure and contact-rule caching without personal answers. |
| Existing plus new desktop/mobile browser suite | 90 passed. Includes CV/application history regressions and integrated Assistant approval, handoff, reconciliation and My Profile answer controls. |
| Companion fixture suite | 6 passed. Executes shipped background/popup/content scripts with a test-only Chrome API transport and real DOM controls/files: Greenhouse workflow, changed-value refusal, upload failure, login/CAPTCHA/password privacy, and limited Lever/Ashby fixtures. |
| TypeScript and ESLint | Passed. |
| Production build | Passed with `npm run build -- --webpack` in this cloud environment. Default CI/Vercel build remains `npm run build`. |
| Production authentication smoke | Passed, including private Assistant routes and token-only companion boundary. |
| Production CV import/export checks | Passed: existing authenticated uploads, CV/letter PDF/Word versions, worker/font tracing and original-document preservation. |
| Production Assistant API smoke | Passed: authenticated approval, actual frozen PDF bytes, duplicate prevention, one-use handoff, extension CORS/scope, persisted verification, revocation, and preservation of the original Saved application/notes. Uses an isolated temporary MongoDB database; never opens an employer page. |

Greenhouse public job metadata/questions and current public form markup were inspected read-only. Lever public posting metadata and standard form markup were inspected. Ashby public posting metadata was inspected, but its live client-rendered application form was not validated. No live submission is inferred from these reads.

The system Chromium has an enterprise policy blocking unpacked extensions. The policy was not changed. Consequently the fixture suite validates the shipped companion engine and browser DOM behavior, rather than a completed native MV3 installation. Follow [installation and safe demonstration](assisted-apply.md) in a local Chrome where the extension is permitted. A fixture pass does not establish support for every employer layout, multi-step flow or upload widget.

Existing Coding Bounties and YouTube Research implementation files were not modified. The shared cron still invokes their existing scheduler; the additional Assistant scheduling only shortlists jobs and never submits them.
