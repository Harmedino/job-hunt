"use client";
import { useState } from "react";
import { ExternalLink, Globe2, RefreshCw } from "lucide-react";
import type { ResearchSource } from "@/lib/source-directory";
export default function SourceDirectory() {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function request(method: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/sources", { method });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Source checks failed");
      setSources(data.sources);
      if (method === "POST") {
        const confirmed = data.sources.filter(
          (s: ResearchSource) =>
            s.status === "Publisher-linked" ||
            s.status === "Website accessible" ||
            s.status === "Community exists",
        ).length;
        setMessage(
          confirmed
            ? `${confirmed} source records checked. Read each verification note before using a source.`
            : "Source checks could not confirm any candidates. Review network access or retry later.",
        );
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="source-directory panel">
      <div className="social-heading">
        <div>
          <h2>Find worldwide remote job sources.</h2>
          <p>
            Employers worldwide, fully remote roles, and development or
            cybersecurity communities.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setOpen(!open);
            if (!open) await request("GET");
          }}
        >
          <Globe2 size={15} />
          {open ? "Hide sources" : "Browse job sources"}
        </button>
      </div>
      {open && (
        <>
          <p>
            Social accounts are discovered only when linked from a publisher’s
            own website. A community or publisher can host misleading posts;
            every opportunity still needs employer, date, and location checks.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => request("POST")}
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} />
            {busy ? "Checking public sources…" : "Find publisher social links"}
          </button>
          {message && <p role="status">{message}</p>}
          <div className="source-cards">
            {sources.map((source) => (
              <article key={source.id}>
                <div>
                  <b>{source.name}</b>
                  <span
                    className={
                      source.status === "Check failed" ? "source-failed" : ""
                    }
                  >
                    {source.status}
                  </span>
                </div>
                <small>
                  {source.platform}
                  {source.checkedAt
                    ? ` · Checked ${new Date(source.checkedAt).toLocaleDateString()}`
                    : ""}
                </small>
                <p>{source.note}</p>
                <div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondary"
                  >
                    Open source <ExternalLink size={12} />
                  </a>
                  {source.provenanceUrl !== source.url && (
                    <a
                      href={source.provenanceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="secondary"
                    >
                      Source evidence <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
