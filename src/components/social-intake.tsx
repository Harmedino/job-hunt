"use client";
import { useState } from "react";
import { ExternalLink, Plus, ShieldCheck, X } from "lucide-react";
import type { SocialLead } from "@/lib/social";
async function leadsRequest(method = "GET", body?: unknown) {
  const r = await fetch("/api/leads", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Could not load social posts.");
  return data;
}
export default function SocialIntake({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<SocialLead[]>([]);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    if (connected) setLeads(await leadsRequest());
  }
  return (
    <section className="social-intake panel">
      <div className="social-heading">
        <div>
          <h2>Opportunities travel beyond job boards.</h2>
          <p>
            Bring in job posts from X, Facebook, Reddit, and WhatsApp channels.
          </p>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            setOpen(!open);
            if (!open) {
              try {
                await load();
              } catch (e) {
                setMessage((e as Error).message);
              }
            }
          }}
        >
          {open ? <X size={15} /> : <Plus size={15} />}{" "}
          {open ? "Close social inbox" : "Add social post"}
        </button>
      </div>
      {open && (
        <>
          <div className="eligibility-note">
            <ShieldCheck size={17} />
            <span>
              Social posts need verification. Check the original employer,
              posting date, Nigeria eligibility, and application link before
              applying. These posts are kept outside recommended jobs. Automated
              social monitoring is not connected.
            </span>
          </div>
          {!connected && <p>Connect MongoDB before saving posts.</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await leadsRequest("POST", { url, text });
                await load();
                setUrl("");
                setText("");
                setMessage(
                  "Post saved for verification. No application has been submitted.",
                );
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Social post or channel link
              <input
                type="url"
                required
                maxLength={2000}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label>
              Job post text
              <textarea
                required
                minLength={30}
                maxLength={20000}
                rows={4}
                placeholder="Paste the job details, employer link, posting date, and location restrictions. Leave out unrelated messages and other people’s personal details."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy || !connected}>
              {busy ? "Saving…" : "Save for verification"}
            </button>
          </form>
          {message && <p role="status">{message}</p>}
          <div className="social-leads">
            {leads.map((lead) => (
              <article key={lead.id}>
                <div>
                  <b>{lead.platform}</b>
                  <span>Needs verification</span>
                </div>
                <p>{lead.text}</p>
                <div className="application-actions">
                  <a
                    className="secondary"
                    href={lead.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Check source post <ExternalLink size={13} />
                  </a>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await leadsRequest("PATCH", { id: lead.id });
                        await load();
                      } catch (e) {
                        setMessage((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
