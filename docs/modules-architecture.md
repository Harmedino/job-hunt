# Workspace extensions: architecture and integration decisions

Inspected before implementation: Next.js 16 App Router with React 19 and TypeScript; MongoDB via `src/lib/db.ts`; password login, signed HttpOnly session cookie, and origin checks via `src/proxy.ts`; existing single-owner profile and application collections; server-only `aiJson` supporting OpenAI/Gemini; CSS variables and sidebar tabs in `src/app/page.tsx`; authenticated `/api/cron` on a daily Vercel schedule. No queue or multi-user identity provider exists.

Both new modules are separate sidebar tabs and components. Existing job, CV, application and profile APIs keep their behavior. New persisted records use an explicit server-selected `owner` workspace identity; clients cannot select another owner. This preserves the app's single-owner security model. Supporting multiple independent users requires a separate authentication migration, not session IDs as user IDs.

New collections use owner-scoped unique keys and foreign references. Index creation is additive and idempotent. OAuth secrets use AES-256-GCM with a separately configured encryption key. No OAuth tokens are returned to the browser. Public YouTube snapshots expire before 30 days and are replaced, never accumulated into competitor histories. Ideas and user-authored plans are retained independently of source metadata. Private analytics are fetched only for authorized channels and never inferred from competitor data.

External requests use fixed provider hosts, validated identifiers, request timeouts, bounded results, rate-limit errors and bounded retries. Manual bounty import never fetches arbitrary URLs. An issue label or dollar amount is not funding verification. Algora, Opire and IssueHunt manual imports remain explicitly unverified unless a supported official funding response is available. No claims, external code changes, submissions or publishing are automated.

Bounty analysis can retrieve bounded public repository file excerpts through the official GitHub API. Actual inspection scope is stored and displayed; issue metadata alone is never described as a code review. Funding, work status, advertised/approved rewards and actual received-payment records remain separate. See the [current paid contribution report](bounty-paid-workflow-report.md).

Provider references reviewed:
- https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests
- https://api.docs.algora.io/ (public reference located; inaccessible during investigation)
- https://oss.issuehunt.io/ (no documented authorized public discovery API verified)
- https://developers.google.com/youtube/v3/docs/search/list
- https://developers.google.com/youtube/analytics/channel_reports
- https://developers.google.com/youtube/analytics/sample-requests
- https://developers.google.com/youtube/terms/developer-policies-guide
- https://developers.google.com/youtube/terms/derived-metrics-policy

YouTube custom competitor scores, virality ratios and historical statistics are disabled. No policy exception is assumed. Research is metadata-only. OAuth uses read-only Data and Analytics scopes. Revenue scopes and video uploads are excluded.
