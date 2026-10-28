"use client";
import { useState, useEffect } from "react";
import { ExternalLink, Plus, ShieldCheck, X } from "lucide-react";
import { extractLead } from "@/lib/lead-extraction";
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
export default function SocialIntake({ connected, openRequest }: { connected: boolean; openRequest?: { id: number; platform?: string } }) {
  const [platform, setPlatform] = useState("Social URL");
  const [reviewId, setReviewId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchUrl, setSearchUrl] = useState("");
  const [searches, setSearches] = useState<
    { id: string; name: string; url: string }[]
  >([]);
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<SocialLead[]>([]);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!openRequest) return;
    // Retain early dashboard clicks through child hydration instead of losing a one-shot window event.
    const timer = setTimeout(() => {
      if (openRequest.platform === "Manual job") setPlatform("Manual job");
      setOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [openRequest]);
  useEffect(() => {
    const reveal=()=>{document.getElementById("manual-intake-panel")?.setAttribute("open","");};
    const show = (event:Event) => {reveal();const source=(event as CustomEvent).detail?.platform;if(source==='Manual job')setPlatform(source);setOpen(true);};
    window.addEventListener("open-social-inbox", show);
    const timer = setTimeout(() => {
      try {
        const shared = sessionStorage.getItem("launchpad-shared-lead");
        if (shared) {
          const data = JSON.parse(shared);
          setText(String(data.text || "").slice(0, 20000));
          setUrl(String(data.url || "").slice(0, 2000));
          setPlatform("WhatsApp");
          reveal();setOpen(true);
          sessionStorage.removeItem("launchpad-shared-lead");
        }
      } catch {
        /* Manual paste remains available. */
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("open-social-inbox", show);
    };
  }, []);
  useEffect(() => {
    if (!open || !connected) return;
    let current = true;
    void leadsRequest()
      .then((items) => {
        if (current) setLeads(items);
      })
      .catch((e) => {
        if (current) setMessage(e.message);
      });
    void fetch("/api/job-searches")
      .then((r) => (r.ok ? r.json() : []))
      .then((items) => {
        if (current) setSearches(items.filter((item:{url?:string})=>!!item.url));
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [open, connected]);
  async function load() {
    if (connected) {
      setLeads(await leadsRequest());
      const r = await fetch("/api/job-searches");
      if (r.ok) setSearches((await r.json()).filter((item:{url?:string})=>!!item.url));
    }
  }
  return (
    <section
      id="social-inbox"
      className="social-intake panel"
      aria-label="Social opportunity inbox"
    >
      <div className="social-heading">
        <div>
          <h2>Opportunities travel beyond job boards.</h2>
          <p>
            Paste Reddit, WhatsApp and other social leads, or Indeed job-alert
            messages.
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
          <label>
            Import source
            <select
              aria-label="Import source"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option>Social URL</option>
              <option>WhatsApp</option>
              <option>Indeed alert</option><option>Manual job</option>
            </select>
          </label>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await leadsRequest("POST", { url, text, platform });
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
                required={platform === "Social URL"}
                maxLength={2000}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label>
              Job post text
              <textarea
                aria-label="Job post text"
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
          <details>
            <summary>Saved Indeed searches</summary>
            <p>
              Open searches on Indeed. Alerts are imported by pasting their
              text; no mailbox connection or scraping is used.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const r = await fetch("/api/job-searches", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: searchName, url: searchUrl }),
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error);
                  setSearchName("");
                  setSearchUrl("");
                  await load();
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            >
              <label>
                Search name
                <input
                  required
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </label>
              <label>
                Indeed search URL
                <input
                  type="url"
                  required
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  placeholder="https://ng.indeed.com/jobs?q=remote+developer"
                />
              </label>
              <button className="secondary" disabled={!connected}>
                Save search link
              </button>
            </form>
            {searches.map((s) => (
              <p key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.name} ↗
                </a>{" "}
                <button
                  className="secondary"
                  onClick={async () => {
                    await fetch("/api/job-searches", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: s.id }),
                    });
                    await load();
                  }}
                >
                  Remove search
                </button>
              </p>
            ))}
          </details>
          <div className="social-leads">
            {leads.map((lead) => (
              <article key={lead.id}>
                <div>
                  <b>{lead.platform}</b>
                  <span>Needs verification</span>
                </div>
                <p>{lead.text}</p>
                {(
                  lead.details || extractLead(lead.text, lead.url)
                ).warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <p>
                  Extracted skills:{" "}
                  {(
                    lead.details || extractLead(lead.text, lead.url)
                  ).skills.join(", ") || "Not supplied"}
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    setReviewId(reviewId === lead.id ? "" : lead.id)
                  }
                >
                  Review and verify lead
                </button>
                {reviewId === lead.id && (
                  <LeadReview
                    lead={lead}
                    onVerified={async () => {
                      await load();
                      setReviewId("");
                      setMessage(
                        "User-reviewed opportunity added to Job Finder. Location eligibility is still based on the posting.",
                      );
                      window.dispatchEvent(new Event("lead-promoted"));
                    }}
                    onError={setMessage}
                  />
                )}

                <div className="application-actions">
                  {lead.url && (
                    <a
                      className="secondary"
                      href={lead.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Check source post <ExternalLink size={13} />
                    </a>
                  )}
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

function LeadReview({
  lead,
  onVerified,
  onError,
}: {
  lead: SocialLead;
  onVerified: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const details = lead.details || extractLead(lead.text, lead.url);
  const [fields, setFields] = useState({
    title: details.title,
    company: details.company,
    location: details.location,
    postedAt: details.postedAt?.slice(0, 10) || "",
    applicationUrl: details.applicationUrl,
    evidenceUrl: details.applicationUrl,
  });
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      aria-label="Verify imported opportunity"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await leadsRequest("PATCH", {
            id: lead.id,
            action: "verify",
            ...fields,
            employerConfirmed: confirmed,
            vacancyConfirmed: confirmed,
            locationReviewed: confirmed,
          });
          await onVerified();
        } catch (error) {
          onError((error as Error).message);
        }
      }}
    >
      <p>
        Open the employer’s original listing and check it yourself. This records
        your review, not an automatic employer verification.
      </p>
      {Object.entries(fields).map(([key, value]) => (
        <label key={key}>
          {
            {
              title: "Advertised role",
              company: "Employer",
              location: "Applicant location",
              postedAt: "Advertised posting date (optional)",
              applicationUrl: "Original application URL",
              evidenceUrl: "Employer or job-board evidence URL",
            }[key]
          }
          <input
            type={
              key.endsWith("Url") ? "url" : key === "postedAt" ? "date" : "text"
            }
            required={key !== "postedAt"}
            value={value}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          required
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I checked the employer identity, confirmed this vacancy is advertised as
        open, and read the location restrictions.
      </label>
      <button className="primary" disabled={!confirmed}>
        Add reviewed opportunity to Job Finder
      </button>
    </form>
  );
}
