import type { Bounty, SourceState } from "@/lib/modules/types";
import { bountyClassification, fundingStatuses } from "@/lib/modules/bounty-verification";
export function BountyDiagnostics({ bounties, sources, displayed }: { bounties: Bounty[]; sources: SourceState[]; displayed: number }) {
  const source = sources.find((s) => s.id === "github");
  return <details className="module-panel">
    <summary>Discovery diagnostics</summary>
    <p>GitHub: {source ? source.success === false ? "Failed or unavailable" : source.success ? "At least one query succeeded" : "Legacy report; refresh for detailed diagnostics" : "Not queried yet"}.</p>
    <p>Algora / Opire / IssueHunt: manual import only. No working authorized live API has been verified. They are not counted as queried providers.</p>
    <p>Last successful GitHub refresh: {source?.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString() : "Not recorded"}.</p>
    {source?.diagnostics && <>
      <p>Latest run: {source.diagnostics.raw} raw · {source.diagnostics.duplicates} duplicates · {source.diagnostics.rejected} rejected · {source.diagnostics.saved} unique saved.</p>
      <p>Search coverage: {source.diagnostics.bounded ? "Bounded / partial" : "All requested pages completed"}. Up to two pages per query; request and time budgets apply.</p>
      {source.diagnostics.queries.map((q, i) => <p key={i}><code>{q.query}</code> · page {q.page} · {q.success ? `${q.returned} returned` : `failed: ${q.error}`}</p>)}
    </>}
    <p>Current saved workspace (up to 500 records; includes previous successful runs): {bounties.length} tasks.</p>
    {[...fundingStatuses, "Inactive"].map((status) => <p key={status}>{status}: {bounties.filter((b) => bountyClassification(b) === status).length}</p>)}
    <p>{bounties.length - displayed} excluded by active filters · {displayed} final displayed.</p>
    <p>Sponsor credibility and payout eligibility remain unverified unless documented separately. Historical payouts never prove a new task is funded.</p>
  </details>;
}
