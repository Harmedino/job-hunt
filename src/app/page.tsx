"use client";
import Link from "next/link";
import SocialIntake from "@/components/social-intake";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  LayoutGrid,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import {
  emptyProfile,
  statuses,
  type Application,
  type Job,
  type Profile,
} from "@/lib/types";
type Health = {
  database: boolean;
  ai: boolean;
  scheduler: boolean;
  protected: boolean;
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
const ago = (value: string, now: number) => {
  const hours = Math.max(0, Math.floor((now - Date.parse(value)) / 3600000));
  return hours < 24
    ? `${hours || "<1"}h ago`
    : `${Math.floor(hours / 24)}d ago`;
};
export default function Home() {
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState("Job Finder");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [health, setHealth] = useState<Health>();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All opportunities");
  const [fresh, setFresh] = useState("30");
  const [review, setReview] = useState(false);
  const [selected, setSelected] = useState<Job>();
  const [notices, setNotices] = useState<{ id: string; title: string }[]>([]);
  const [showNotices, setShowNotices] = useState(false);
  const [viewApp, setViewApp] = useState<Application>();
  const [checked, setChecked] = useState("");
  const refreshApplications = useCallback(
    async () => setApplications(await api<Application[]>("applications")),
    [],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const h = await api<Health>("status");
        if (!active) return;
        setHealth(h);
        const data = await api<{ jobs: Job[] }>("discover");
        if (active) setJobs(data.jobs);
        if (h.database) {
          const [p, a, n] = await Promise.all([
            api<Profile>("profile"),
            api<Application[]>("applications"),
            api<{ id: string; title: string }[]>("notifications"),
          ]);
          if (active) {
            setProfile({ ...emptyProfile, ...p });
            setApplications(a);
            setNotices(n);
          }
        }
      } catch (e) {
        if (active) setMessage((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function task(name: string, work: () => Promise<void>) {
    setBusy(name);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function findJobs() {
    await task("discovery", async () => {
      const data = await api<{
        jobs: Job[];
        failures: string[];
        checkedAt: string;
        persisted: boolean;
      }>("discover", "POST");
      setJobs(data.jobs);
      setChecked(data.checkedAt);
      setMessage(
        data.failures.length
          ? data.failures.join(" · ")
          : `Discovery complete. ${data.jobs.length} relevant openings found.${data.persisted ? "" : " Connect MongoDB to save jobs."}`,
      );
      if (health?.database) setNotices(await api("notifications"));
    });
  }
  async function save(job: Job) {
    await task(job.id, async () => {
      await api("applications", "POST", { jobId: job.id });
      await refreshApplications();
      setMessage("Job saved to your applications.");
    });
  }
  async function prepare(application: Application) {
    await task(application.id, async () => {
      const result = await api<{ method: string }>("prepare", "POST", {
        id: application.id,
      });
      await refreshApplications();
      setMessage(
        `Application prepared using ${result.method.toLowerCase()}. Review the CV and cover letter before applying.`,
      );
    });
  }
  const filtered = useMemo(
    () =>
      jobs.filter(
        (j) =>
          `${j.title} ${j.company} ${j.description}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (review || j.eligibility === "eligible") &&
          (category === "All opportunities" ||
            (category === "Development"
              ? /front|react|angular|javascript|typescript|next/i.test(j.title)
              : /security|soc/i.test(j.title))) &&
          now - Date.parse(j.postedAt) <= Number(fresh) * 86400000,
      ),
    [jobs, query, category, review, fresh, now],
  );
  const freshCount = jobs.filter(
    (j) =>
      now - Date.parse(j.postedAt) < 72 * 3600000 &&
      j.eligibility === "eligible",
  ).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </span>
          launchpad<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">YOUR PERSONAL WORKSPACE</div>
        <nav>
          {[
            { name: "Job Finder", icon: Search },
            { name: "Applications", icon: BriefcaseBusiness },
            { name: "My Profile", icon: UserRound },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${tab === name ? "active" : ""}`}
              onClick={() => setTab(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Applications" && applications.length > 0 && (
                <span className="nav-count">{applications.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <span className="small-spark">
            <Sparkles size={19} />
          </span>
          <h3>
            Your next chapter
            <br />
            starts here.
          </h3>
          <p>
            A little preparation.
            <br />A world of possibilities.
          </p>
          <button onClick={() => setTab("My Profile")}>
            Complete your profile <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="private">
            <ShieldCheck size={16} />
            Private. Personal. Yours.
          </div>
          <button className="account" onClick={() => setTab("My Profile")}>
            <span className="avatar">
              {profile.name ? profile.name.slice(0, 2).toUpperCase() : "ME"}
            </span>
            <span>
              <b>{profile.name || "Your workspace"}</b>
              <small>Personal account</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{tab}</strong>
          </div>
          <div className="header-actions">
            <span className="local-time">
              <span className="status-dot" />
              Built for your next move
            </span>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setShowNotices(!showNotices)}
            >
              <Bell size={19} />
              {notices.length > 0 && <i />}
            </button>
            <button
              className="avatar small"
              aria-label="Open profile"
              onClick={() => setTab("My Profile")}
            >
              {profile.name ? profile.name.slice(0, 2).toUpperCase() : "ME"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CAREER, IN MOTION</div>
              <h1>
                {tab === "Job Finder"
                  ? "Find your next opportunity."
                  : tab === "Applications"
                    ? "Every application. One place."
                    : "Let your experience shine."}
              </h1>
              <p>
                {tab === "Job Finder"
                  ? "Fresh opportunities. Thoughtful matches. A head start on what’s next."
                  : tab === "Applications"
                    ? "Keep your momentum, from the first save to the final offer."
                    : "Your real skills and experience power every match and application."}
              </p>
            </div>
            {tab === "Job Finder" && (
              <button className="primary" disabled={!!busy} onClick={findJobs}>
                <RefreshCw
                  size={16}
                  className={busy === "discovery" ? "spin" : ""}
                />
                {busy === "discovery"
                  ? "Finding opportunities…"
                  : "Find new jobs"}
              </button>
            )}
          </div>
          {message && (
            <div className="notice" role="status">
              <CircleHelp size={17} />
              <span>{message}</span>
              <button aria-label="Dismiss" onClick={() => setMessage("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {health && !health.database && (
            <div className="setup-banner">
              <div>
                <b>Make this workspace yours</b>
                <span>
                  {" "}
                  Connect MongoDB to save your profile, applications, and
                  notifications. Live discovery is available now.
                </span>
              </div>
              <button onClick={() => setTab("My Profile")}>
                Setup details <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          {tab === "Job Finder" && (
            <>
              <section className="stats-grid">
                <Stat
                  label="Open opportunities"
                  value={
                    jobs.filter((j) => j.eligibility === "eligible").length
                  }
                  hint="Nigeria-eligible source locations"
                  icon={<BriefcaseBusiness size={19} />}
                />
                <Stat
                  label="Fresh this week"
                  value={freshCount}
                  hint="Posted in the last 72 hours"
                  icon={<Zap size={19} />}
                />
                <Stat
                  label="Strong matches"
                  value={
                    jobs.filter(
                      (j) => j.score >= 65 && j.eligibility === "eligible",
                    ).length
                  }
                  hint={
                    profile.skills
                      ? "Based on your saved skills"
                      : "Add your skills to see matches"
                  }
                  icon={<Sparkles size={19} />}
                />
                <Stat
                  label="Applications in motion"
                  value={
                    applications.filter(
                      (a) => !["Saved", "Rejected", "Offer"].includes(a.status),
                    ).length
                  }
                  hint="Your next step is waiting"
                  icon={<ArrowUpRight size={19} />}
                />
              </section>
              <section className="discovery-note">
                <div className="discovery-orb">
                  <Globe2 size={22} />
                </div>
                <div>
                  <b>A wider search. A clearer path.</b>
                  <p>
                    Discover remote development and cybersecurity roles, with
                    Nigeria eligibility checked from source locations.
                  </p>
                </div>
                <span className="pill">
                  <span className="status-dot" />
                  {health?.scheduler
                    ? "Schedule configured"
                    : "On-demand discovery"}
                </span>
              </section>
              <SocialIntake connected={!!health?.database} />
              <div className="section-title">
                <div>
                  <h2>
                    Your opportunities <span>{filtered.length}</span>
                  </h2>
                  <p>
                    {checked
                      ? `Last checked ${new Date(checked).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })} WAT`
                      : "Real listings only. No sample jobs."}
                  </p>
                </div>
                <span className="source-label">
                  Sourced from Remotive & Arbeitnow <ExternalLink size={13} />
                </span>
              </div>
              <div className="filter-bar">
                <div className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Search jobs"
                    placeholder="Search titles, companies, or skills…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Posting age"
                  value={fresh}
                  onChange={(e) => setFresh(e.target.value)}
                >
                  <option value="30">Last 30 days</option>
                  <option value="3">Last 72 hours</option>
                  <option value="1">Last 24 hours</option>
                </select>
                <label className="review-toggle">
                  <input
                    type="checkbox"
                    checked={review}
                    onChange={(e) => setReview(e.target.checked)}
                  />
                  Include location review
                </label>
              </div>
              <div className="category-tabs">
                {["All opportunities", "Development", "Cybersecurity"].map(
                  (c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={category === c ? "selected" : ""}
                    >
                      {c}
                    </button>
                  ),
                )}
                <span>
                  <LayoutGrid size={16} />
                  Newest first
                </span>
              </div>
              {filtered.length ? (
                <div className="job-grid">
                  {filtered.map((job) => (
                    <article className="job-card" key={job.id}>
                      <div className="job-top">
                        <span
                          className={`company-logo tone-${job.company.length % 4}`}
                        >
                          {job.company.slice(0, 1)}
                        </span>
                        <div className="company-name">
                          {job.company}
                          <small>{job.source}</small>
                        </div>
                        <button
                          className={`icon-button save ${applications.some((a) => a.job.id === job.id) ? "saved" : ""}`}
                          aria-label={`Save ${job.title}`}
                          disabled={!!busy || !health?.database}
                          onClick={() => save(job)}
                        >
                          <Bookmark size={19} />
                        </button>
                      </div>
                      <button
                        className="job-title"
                        onClick={() => setSelected(job)}
                      >
                        {job.title}
                      </button>
                      <div className="job-location">
                        <MapPin size={14} />
                        {job.location || "Location not specified"}
                      </div>
                      <div className="job-tags">
                        <span>
                          <Globe2 size={12} />
                          Remote
                        </span>
                        <span>
                          {/security|soc/i.test(job.title)
                            ? "Cybersecurity"
                            : "Development"}
                        </span>
                        {now - Date.parse(job.postedAt) < 72 * 3600000 && (
                          <span className="new-tag">New</span>
                        )}
                      </div>
                      <p className="job-excerpt">
                        {job.description.slice(0, 165)}…
                      </p>
                      <div className="salary">
                        {job.salary || "Salary not disclosed"}
                      </div>
                      <div className="job-card-bottom">
                        <span
                          className={job.score >= 65 ? "match strong" : "match"}
                        >
                          <Sparkles size={13} />
                          {profile.skills
                            ? `${job.score}% skill match`
                            : "Add skills to match"}
                        </span>
                        <span>
                          <Clock3 size={12} />
                          {ago(job.postedAt, now)}
                        </span>
                      </div>
                      <button
                        className="card-action"
                        onClick={() => setSelected(job)}
                      >
                        Explore opportunity <ArrowUpRight size={15} />
                      </button>
                      {job.eligibility === "review" && (
                        <small className="location-warning">
                          Nigeria eligibility needs review
                        </small>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <Search size={29} />
                  </div>
                  <h3>
                    {jobs.length
                      ? "No opportunities match these filters"
                      : "Your next opportunity is out there."}
                  </h3>
                  <p>
                    {jobs.length
                      ? "Try a wider date range or include jobs that need a location review."
                      : "Search real job boards for fresh remote roles. Your results will appear here—no made-up listings, ever."}
                  </p>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={findJobs}
                  >
                    <Search size={16} />
                    Discover opportunities
                  </button>
                  <div className="empty-sources">
                    <Globe2 size={14} /> Remotive <span>·</span> Arbeitnow{" "}
                    <span>·</span> Remote-first
                  </div>
                </div>
              )}
              <footer>
                <ShieldCheck size={14} />
                Your career data stays in your private workspace.
                <span>One step closer to your next chapter.</span>
              </footer>
            </>
          )}
          {tab === "My Profile" && (
            <div className="profile-layout">
              <form
                className="panel profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void task("profile", async () => {
                    setProfile(await api<Profile>("profile", "PUT", profile));
                    setMessage(
                      "Profile saved. Refresh discovery to update your match scores.",
                    );
                  });
                }}
              >
                <div className="panel-heading">
                  <UserRound size={20} />
                  <div>
                    <h2>Your professional story</h2>
                    <p>Only add qualifications you actually have.</p>
                  </div>
                </div>
                <div className="form-grid">
                  {(
                    [
                      "name",
                      "email",
                      "phone",
                      "location",
                      "github",
                      "linkedin",
                      "portfolio",
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {
                        {
                          name: "Full name",
                          email: "Email address",
                          phone: "Phone number",
                          location: "Based in",
                          github: "GitHub URL",
                          linkedin: "LinkedIn URL",
                          portfolio: "Portfolio URL",
                        }[key]
                      }
                      <input
                        required={key === "name" || key === "email"}
                        type={
                          key === "email"
                            ? "email"
                            : ["github", "linkedin", "portfolio"].includes(key)
                              ? "url"
                              : "text"
                        }
                        value={profile[key]}
                        onChange={(e) =>
                          setProfile({ ...profile, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                {(
                  [
                    "skills",
                    "experience",
                    "education",
                    "projects",
                    "roles",
                    "preferences",
                    "cvText",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {
                      {
                        skills: "Skills (comma separated)",
                        experience: "Experience",
                        education: "Education",
                        projects: "Projects",
                        roles: "Preferred roles",
                        preferences: "Application preferences",
                        cvText: "Existing CV text · review extracted content",
                      }[key]
                    }
                    <textarea
                      rows={key === "cvText" ? 7 : 3}
                      value={profile[key]}
                      onChange={(e) =>
                        setProfile({ ...profile, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <button
                  className="primary"
                  disabled={!!busy || !health?.database}
                >
                  <Check size={16} />
                  Save profile
                </button>
              </form>
              <div className="profile-side">
                <section className="panel">
                  <h3>
                    <FileText size={18} />
                    Start with your CV
                  </h3>
                  <p>
                    Upload a text-based PDF or .txt file (up to 5 MB). Extracted
                    text is saved privately in MongoDB. Scanned PDFs need OCR
                    first.
                  </p>
                  <label className="upload-box">
                    <Upload size={25} />
                    <b>
                      {busy === "upload"
                        ? "Reading your CV…"
                        : "Choose your CV"}
                    </b>
                    <span>PDF or TXT · 5 MB maximum</span>
                    <input
                      type="file"
                      accept=".pdf,.txt"
                      disabled={!!busy || !health?.database}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void task("upload", async () => {
                            const form = new FormData();
                            form.set("file", file);
                            const r = await fetch("/api/cv", {
                              method: "POST",
                              body: form,
                            });
                            const data = await r.json();
                            if (!r.ok) throw new Error(data.error);
                            setProfile((p) => ({ ...p, cvText: data.text }));
                            setMessage(
                              "CV text imported. Review it and save the rest of your profile.",
                            );
                          });
                      }}
                    />
                  </label>
                </section>
                <section className="panel">
                  <h3>
                    <Settings2 size={18} />
                    Connections
                  </h3>
                  <Connection
                    name="MongoDB storage"
                    connected={!!health?.database}
                  />
                  <Connection
                    name="AI evidence ranking"
                    connected={!!health?.ai}
                  />
                  <Connection
                    name="Scheduler credential"
                    connected={!!health?.scheduler}
                  />
                  <Connection
                    name="Password protection"
                    connected={!!health?.protected}
                  />
                  <p>
                    Configure credentials in <code>.env.local</code> using{" "}
                    <code>.env.example</code>. Restart after changes. Never
                    enter API keys here.
                  </p>
                  <p>
                    Scheduling requires deploying the cron configuration or
                    installing the documented system cron. A credential alone
                    does not start a schedule.
                  </p>
                </section>
                <section className="honesty-card">
                  <ShieldCheck size={22} />
                  <h3>Your experience. Your words.</h3>
                  <p>
                    AI can prioritize your existing evidence. It cannot add
                    qualifications or submit an application for you.
                  </p>
                </section>
              </div>
            </div>
          )}
          {tab === "Applications" && (
            <>
              <div className="pipeline">
                {statuses.map((status) => (
                  <div key={status}>
                    <b>
                      {applications.filter((a) => a.status === status).length}
                    </b>
                    <span>{status}</span>
                  </div>
                ))}
              </div>
              {applications.length ? (
                <div className="application-list">
                  {applications.map((app) => (
                    <article className="panel application" key={app.id}>
                      <div className="application-heading">
                        <span className="company-logo">
                          {app.job.company[0]}
                        </span>
                        <div>
                          <h3>{app.job.title}</h3>
                          <p>
                            {app.job.company} · Saved{" "}
                            {new Date(app.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <select
                          aria-label={`Status for ${app.job.title}`}
                          value={app.status}
                          disabled={!!busy}
                          onChange={(e) => {
                            const status = e.target.value;
                            if (
                              status === "Submitted" &&
                              !window.confirm(
                                "Have you submitted this application on the employer’s website? This only updates your tracker.",
                              )
                            )
                              return;
                            void task(app.id, async () => {
                              await api("applications", "PATCH", {
                                id: app.id,
                                status,
                              });
                              await refreshApplications();
                            });
                          }}
                        >
                          {statuses.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="application-actions">
                        <a
                          className="secondary"
                          href={app.job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Original posting <ExternalLink size={14} />
                        </a>
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => prepare(app)}
                        >
                          <Sparkles size={14} />
                          {busy === app.id
                            ? "Preparing…"
                            : "Prepare application"}
                        </button>
                        {app.cvFacts && (
                          <>
                            <a
                              className="secondary"
                              href={`/api/documents/${app.id}`}
                            >
                              <Download size={14} />
                              Tailored PDF
                            </a>
                            <button
                              className="secondary"
                              onClick={() => setViewApp(app)}
                            >
                              Review package <ArrowUpRight size={14} />
                            </button>
                          </>
                        )}
                      </div>
                      <label className="follow-up">
                        Follow-up notes
                        <textarea
                          rows={2}
                          defaultValue={app.followUp}
                          placeholder="Next steps, interview dates, or questions to follow up…"
                          onBlur={(e) => {
                            if (e.target.value !== app.followUp)
                              void task(app.id, async () => {
                                await api("applications", "PATCH", {
                                  id: app.id,
                                  followUp: e.target.value,
                                });
                                await refreshApplications();
                              });
                          }}
                        />
                      </label>
                      {app.submittedAt && (
                        <small>
                          Marked submitted{" "}
                          {new Date(app.submittedAt).toLocaleString()}
                        </small>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <Bookmark size={29} />
                  </div>
                  <h3>A little organization. A lot of momentum.</h3>
                  <p>
                    Save a job from the finder to start tracking it. Prepare
                    your CV, review your application, and keep every next step
                    here.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setTab("Job Finder")}
                  >
                    Explore opportunities <ArrowUpRight size={16} />
                  </button>
                </div>
              )}
              <div className="disclaimer">
                <ShieldCheck size={17} />
                Applications open on the employer’s website for your review and
                submission. Automatic form filling is not enabled; no
                application is submitted by this app.
              </div>
            </>
          )}
        </main>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(undefined)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Job details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close job details"
              onClick={() => setSelected(undefined)}
            >
              <X />
            </button>
            <span className="eyebrow">
              {selected.source} · {ago(selected.postedAt, now)}
            </span>
            <h2>{selected.title}</h2>
            <p>
              {selected.company} · {selected.location}
            </p>
            <div className="eligibility-note">
              <ShieldCheck size={17} />
              {selected.eligibilityReason}
            </div>
            <p>
              <b>{selected.salary || "Salary not disclosed"}</b>
            </p>
            <h3>Requirements & role description</h3>
            <p className="description">{selected.description}</p>
            {selected.matchedSkills.length > 0 && (
              <p>Matching skills: {selected.matchedSkills.join(", ")}</p>
            )}
            <div className="modal-actions">
              <button
                className="primary"
                disabled={!!busy || !health?.database}
                onClick={() => save(selected)}
              >
                <Bookmark size={16} />
                Save to applications
              </button>
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="secondary"
              >
                Verify original posting <ExternalLink size={15} />
              </a>
            </div>
            <small>
              Listings may close between checks. Always verify the employer’s
              requirements before applying. Skill match is a heuristic, not an
              eligibility guarantee.
            </small>
          </section>
        </div>
      )}
      {viewApp && (
        <div className="modal-backdrop" onClick={() => setViewApp(undefined)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Application review"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close application review"
              onClick={() => setViewApp(undefined)}
            >
              <X />
            </button>
            <span className="eyebrow">REVIEW BEFORE APPLYING</span>
            <h2>{viewApp.job.title}</h2>
            <p>
              {viewApp.preparationMethod} · Snapshot saved{" "}
              {new Date(viewApp.updatedAt).toLocaleString()}
            </p>
            <h3>CV evidence</h3>
            {viewApp.cvFacts?.map((fact, i) => (
              <p className="description" key={i}>
                {fact}
              </p>
            ))}
            <h3>Cover letter draft</h3>
            <pre className="cover-letter">{viewApp.coverLetter}</pre>
            <div className="modal-actions">
              <a className="primary" href={`/api/documents/${viewApp.id}`}>
                <Download size={16} />
                Download PDF
              </a>
              <a
                className="secondary"
                href={viewApp.job.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Review & apply on employer site <ExternalLink size={15} />
              </a>
            </div>
            <p>
              Unknown answers must be supplied by you. The PDF contains only
              evidence from your saved profile.
            </p>
          </section>
        </div>
      )}
      {showNotices && (
        <div className="notification-panel">
          <div>
            <h3>Your notifications</h3>
            <button
              aria-label="Close notifications"
              className="icon-button"
              onClick={() => setShowNotices(false)}
            >
              <X size={17} />
            </button>
          </div>
          {notices.length ? (
            notices.map((n) => (
              <p key={n.id}>
                <Sparkles size={15} />
                {n.title}
              </p>
            ))
          ) : (
            <p>
              No new strong-match alerts. Add your skills and run discovery to
              get started.
            </p>
          )}
          {notices.length > 0 && (
            <button
              className="secondary"
              onClick={() =>
                void task("notifications", async () => {
                  await api("notifications", "PATCH");
                  setNotices([]);
                })
              }
            >
              Mark all as read
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <b>{value.toString().padStart(2, "0")}</b>
      <small>{hint}</small>
    </div>
  );
}
function Connection({ name, connected }: { name: string; connected: boolean }) {
  return (
    <div className="connection">
      <span>{name}</span>
      <b className={connected ? "connected" : ""}>
        {connected ? "Configured" : "Not connected"}
      </b>
    </div>
  );
}
