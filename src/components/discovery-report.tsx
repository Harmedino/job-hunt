import type { SourceReport } from "@/lib/discovery-types";
export default function DiscoveryReport({ sources, storageWarning }: { sources: SourceReport[]; storageWarning?: string }) {
  if (!sources.length && !storageWarning) return null;
  return <section className="panel discovery-report" aria-label="Search activity">
    <h3>Search activity</h3>
    <p>Results are checked for role, remote work, posting age and applicant location. An AI key is not required to find jobs. Feeds may be cached; Remotive delays public listings by 24 hours.</p>
    {storageWarning && <p role="alert" className="location-warning">{storageWarning}</p>}
    <div className="discovery-source-grid">
      {sources.map((s) => <details key={s.source} className={s.status === "error" ? "source-error" : ""}>
        <summary><b>{s.source}</b><span>{s.status === "error" ? `Unavailable · ${s.error || "Request failed"}` : `${s.fetched} checked · ${s.eligible} location-supported · ${s.review} need review`}</span></summary>
        {s.status !== "error" && <p>{s.excluded.role} outside your roles · {s.excluded.remote} office/hybrid or not confirmed remote · {s.excluded.location} location-restricted · {s.excluded.age} old/expired or missing date · {s.excluded.invalid} incomplete · {s.excluded.duplicate} duplicates.{s.status === "partial" ? " Only part of this feed was checked; more openings may exist on the source website." : ""}</p>}
      </details>)}
    </div>
  </section>;
}
