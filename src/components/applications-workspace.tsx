"use client";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Download,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { statuses, type Application, type Job } from "@/lib/types";
import { applicationWasApplied } from "@/lib/vacancy-groups";
import {
  applicationCounts,
  applicationActions,
  filterApplications,
} from "@/lib/application-history";
import {
  applicationStatusLabel,
  calendarToday,
} from "@/lib/application-updates";
import ApplicationEntry from "./application-entry";
async function api(path: string, method: string, body: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "Could not update application.");
  return value;
}
export default function ApplicationsWorkspace({
  applications,
  pending,
  connected,
  now,
  refreshApplications,
  save,
  unsave,
  openBuilder,
  setViewApp,
  setTab,
  onOpenApplication,
}: {
  applications: Application[];
  pending: string;
  connected: boolean;
  now: number;
  refreshApplications: () => Promise<void>;
  save: (job: Job) => Promise<void>;
  unsave: (app: Application) => Promise<void>;
  openBuilder: (job: Job, app?: Application) => void;
  setViewApp: (app: Application) => void;
  setTab: (tab: string) => void;
  onOpenApplication: (job: Job) => void;
}) {
  const [stage, setStage] = useState(""),
    [query, setQuery] = useState(""),
    [year, setYear] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [sort, setSort] = useState("updated"),
    [working, setWorking] = useState(""),
    [message, setMessage] = useState(""),
    [manual, setManual] = useState(false),
    [submitting, setSubmitting] = useState<Application>(),
    [detail, setDetail] = useState("");
  const busy = pending || working,
    counts = applicationCounts(applications),
    filtered = useMemo(
      () =>
        filterApplications(applications, {
          stage,
          query,
          year,
          from,
          to,
          sort,
        }),
      [applications, stage, query, year, from, to, sort],
    );
  const actions = applicationActions(applications, new Date(now));
  const selected = applications.find((a) => a.id === detail);
  async function task(id: string, action: () => Promise<void>) {
    setWorking(id);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setWorking("");
    }
  }
  return (
    <section aria-label="Applications workspace">
      <div className="module-actions">
        <button
          className="primary"
          disabled={!connected || !!busy}
          onClick={() => setManual(true)}
        >
          Add Application Manually
        </button>
        <a className="secondary" href="/api/applications/export?format=csv">
          Export CSV
        </a>
        <a className="secondary" href="/api/applications/export?format=json">
          Export JSON
        </a>
      </div>
      <p>
        Saved opportunities and submitted applications remain here when
        vacancies expire or your career filters change. Dates and employer
        responses are your own records.
      </p>
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      <div
        className="application-stage-tabs"
        role="group"
        aria-label="Application stages"
      >
        <button
          className={!stage ? "primary" : "secondary"}
          aria-pressed={!stage}
          onClick={() => setStage("")}
        >
          All ({applications.length})
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            className={stage === s ? "primary" : "secondary"}
            aria-pressed={stage === s}
            onClick={() => setStage(s)}
          >
            {applicationStatusLabel(s)} ({counts[s] || 0})
          </button>
        ))}
      </div>
      <div className="panel application-history-filters">
        <label>
          Search company, role or date
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Application year
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {[
              ...new Set([
                "2026",
                "2027",
                ...applications
                  .map((a) => a.applicationDate?.slice(0, 4))
                  .filter((v): v is string => !!v),
              ]),
            ]
              .sort()
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
        </label>
        <label>
          Applied from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Applied to
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Sort applications
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">Last update</option>
            <option value="applied">Date applied</option>
            <option value="followUp">Follow-up date</option>
          </select>
        </label>
      </div>
      {actions.length > 0 && (
        <section
          className="panel application-reminders"
          aria-label="Upcoming and overdue application actions"
        >
          <h3>Upcoming and overdue actions</h3>
          {actions.map((action) => (
            <button
              key={action.app.id + action.kind}
              className="secondary"
              onClick={() => setDetail(action.app.id)}
            >
              {action.kind} {action.overdue ? "overdue" : "upcoming"} ·{" "}
              {action.date} · {action.app.job.company} — {action.app.job.title}
            </button>
          ))}
        </section>
      )}
      {filtered.length ? (
        <div className="application-list">
          {filtered.map((app) => (
            <article className="panel application" key={app.id}>
              <div className="application-heading">
                <span className="company-logo">{app.job.company[0]}</span>
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
                      if (status === "Submitted" && !app.applicationDate) {
                        setSubmitting(app);
                        return;
                      }
                      await api("applications", "PATCH", {
                        id: app.id,
                        status,
                        submissionConfirmed: status === "Submitted",
                        ...(status === "Submitted" && app.applicationDate
                          ? { applicationDate: app.applicationDate }
                          : {}),
                      });
                      await refreshApplications();
                    });
                  }}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {applicationStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <p>
                {app.saved === false && !applicationWasApplied(app)
                  ? "Unsaved · work history retained"
                  : applicationWasApplied(app)
                    ? "Applied job · preserved history"
                    : "Saved opportunity · not submitted"}
              </p>
              <div className="application-actions">
                <button className="secondary" onClick={() => setDetail(app.id)}>
                  Application details
                </button>
                {!applicationWasApplied(app) && (
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => setSubmitting(app)}
                  >
                    Mark as Applied
                  </button>
                )}
                {!applicationWasApplied(app) && (
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      app.saved === false ? save(app.job) : unsave(app)
                    }
                  >
                    {app.saved === false ? "Save again" : "Unsave job"}
                  </button>
                )}
                <a
                  className="secondary"
                  href={app.job.url || undefined}
                  onClick={() => onOpenApplication(app.job)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Application Page <ExternalLink size={14} />
                </a>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => openBuilder(app.job, app)}
                >
                  <Sparkles size={14} />
                  {app.cvDraftId ? "Open CV builder" : "Build tailored CV"}
                </button>
                {(app.cvFacts || app.cvDraftId) && (
                  <>
                    <a className="secondary" href={`/api/documents/${app.id}`}>
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
                        if (status === "Submitted" && !app.applicationDate) {
                          setSubmitting(app);
                          return;
                        }
                        await api("applications", "PATCH", {
                          id: app.id,
                          followUp: e.target.value,
                        });
                        await refreshApplications();
                      });
                  }}
                />
              </label>
              <p className="application-package-info">
                CV version:{" "}
                {app.cvDraftId ? app.cvDraftId.slice(0, 8) : "Not prepared"} ·
                Cover letter: {app.coverLetter ? "Saved" : "Not prepared"}
                {app.submittedAt ? " · Submitted documents preserved" : ""}
              </p>
              {app.followUpDate && (
                <p className="follow-up-reminder" role="note">
                  {app.followUpDate <= calendarToday(new Date(now))
                    ? "Follow-up due"
                    : "Follow-up planned"}
                  : {app.followUpDate}
                </p>
              )}
              <details className="application-tracking">
                <summary>
                  Application dates, notes and interview details
                </summary>
                <div className="form-grid">
                  {(
                    [
                      "applicationDate",
                      "followUpDate",
                      "interviewDate",
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {key === "applicationDate"
                        ? "Application date"
                        : key === "interviewDate"
                          ? "Interview date"
                          : "Follow-up date"}
                      <input
                        type="date"
                        aria-label={`${key === "applicationDate" ? "Application date" : key === "interviewDate" ? "Interview date" : "Follow-up date"} for ${app.job.title}`}
                        defaultValue={app[key] || ""}
                        disabled={!!busy}
                        onBlur={(e) => {
                          if (e.target.value !== (app[key] || ""))
                            void task(app.id, async () => {
                              await api("applications", "PATCH", {
                                id: app.id,
                                [key]: e.target.value,
                              });
                              await refreshApplications();
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
                {(
                  [
                    "notes",
                    "interviewInfo",
                    "employerResponse",
                    "nextAction",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {key === "notes"
                      ? "Personal notes"
                      : key === "interviewInfo"
                        ? "Interview information"
                        : key === "employerResponse"
                          ? "Employer response"
                          : "Next action"}
                    <textarea
                      rows={3}
                      maxLength={
                        key === "notes"
                          ? 8000
                          : key === "nextAction"
                            ? 2000
                            : 4000
                      }
                      aria-label={`${key === "notes" ? "Personal notes" : key === "interviewInfo" ? "Interview information" : key === "employerResponse" ? "Employer response" : "Next action"} for ${app.job.title}`}
                      defaultValue={app[key] || ""}
                      disabled={!!busy}
                      onBlur={(e) => {
                        if (e.target.value !== (app[key] || ""))
                          void task(app.id, async () => {
                            await api("applications", "PATCH", {
                              id: app.id,
                              [key]: e.target.value,
                            });
                            await refreshApplications();
                          });
                      }}
                    />
                  </label>
                ))}
                <p>
                  Dates are your own records. Setting an application date does
                  not mark it submitted. Follow-up dates appear here as
                  reminders.
                </p>
              </details>
              {app.submittedAt && (
                <small>
                  Marked submitted {new Date(app.submittedAt).toLocaleString()}
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
            Choose another view, add an outside application, or save a job from
            the finder. Prepare your CV, review your application, and keep every
            next step here.
          </p>
          <button className="primary" onClick={() => setTab("Job Finder")}>
            Explore opportunities <ArrowUpRight size={16} />
          </button>
        </div>
      )}

      {manual && (
        <ApplicationEntry
          manual
          onClose={() => setManual(false)}
          onSaved={async (app) => {
            await refreshApplications();
            if (app) setDetail(app.id);
          }}
        />
      )}
      {submitting && (
        <ApplicationEntry
          application={submitting}
          onClose={() => setSubmitting(undefined)}
          onSaved={async () => {
            await refreshApplications();
          }}
        />
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Application details"
            className="modal"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close application details"
              onClick={() => setDetail("")}
            >
              ×
            </button>
            <h2>{selected.job.title}</h2>
            <p>
              {selected.job.company} · {selected.job.location} ·{" "}
              {selected.job.salary || "Salary not recorded"}
            </p>
            <p>
              {selected.origin === "manual" ||
              selected.job.source === "Manual application"
                ? "User-reported application; employer vacancy not verified."
                : selected.job.source}
            </p>
            {selected.job.url && (
              <a
                className="secondary"
                href={selected.job.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onOpenApplication(selected.job)}
              >
                Open Application Page
              </a>
            )}
            <dl className="module-facts">
              <div>
                <dt>Actual date applied</dt>
                <dd>{selected.applicationDate || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Recorded in Launchpad</dt>
                <dd>{selected.createdAt}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{selected.updatedAt || selected.createdAt}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{applicationStatusLabel(selected.status)}</dd>
              </div>
            </dl>
            <h3>Status history</h3>
            {(
              selected.statusHistory || [
                { status: selected.status, at: selected.createdAt },
              ]
            ).map((item, i) => (
              <p key={i}>
                {applicationStatusLabel(item.status)} · {item.at}
              </p>
            ))}
            <h3>Submitted documents</h3>
            <p>
              CV:{" "}
              {selected.documentSnapshot?.cvLabel ||
                selected.documentSnapshot?.cv?.id ||
                "Original document not recorded"}{" "}
              · Cover letter:{" "}
              {selected.documentSnapshot?.coverLetterUsed || "Not recorded"}
            </p>
            {selected.documentSnapshot?.cv && (
              <div className="module-actions">
                <a
                  className="secondary"
                  href={`/api/applications/${selected.id}/documents?document=cv&format=pdf`}
                >
                  Submitted CV PDF
                </a>
                <a
                  className="secondary"
                  href={`/api/applications/${selected.id}/documents?document=cv&format=docx`}
                >
                  Submitted CV Word
                </a>
              </div>
            )}
            {selected.documentSnapshot?.coverLetter &&
              selected.documentSnapshot.coverLetterUsed !== "no" && (
                <>
                  <pre className="cover-letter">
                    {selected.documentSnapshot.coverLetter}
                  </pre>
                  <a
                    href={`/api/applications/${selected.id}/documents?document=letter&format=txt`}
                  >
                    Download original cover-letter text
                  </a>
                </>
              )}
            <h3>Notes and next actions</h3>
            <p>{selected.notes || "No personal notes recorded."}</p>
            <p>{selected.nextAction || "No next action recorded."}</p>
            <p>
              Follow-up: {selected.followUpDate || "Not scheduled"} ·{" "}
              {selected.followUp}
            </p>
            <p>
              Interview: {selected.interviewDate || "Not recorded"} ·{" "}
              {selected.interviewInfo}
            </p>
            <p>
              Employer response: {selected.employerResponse || "Not recorded"}
            </p>
            <p>
              Saved documents are immutable submission records. Newer master
              profiles and CVs do not replace them.
            </p>
          </section>
        </div>
      )}
      <p className="disclaimer">
        <ShieldCheck size={17} />
        Applications are submitted on the employer’s website. Opening a link
        never changes submission status.
      </p>
    </section>
  );
}
