"use client";
import { useEffect, useState, useCallback } from "react";
import {
  applicationTarget,
  factKeys,
  type BankAnswer,
} from "@/lib/assisted-apply";
import type { publicAttempt } from "@/lib/assisted-store";
import type { AssistantPolicy } from "@/lib/assistant-policy";
import type { ResumeDraft, ResumeListItem } from "@/lib/resume-types";
import type { Application, Job } from "@/lib/types";
import { applicationWasApplied } from "@/lib/vacancy-groups";
type PublicAttempt = ReturnType<typeof publicAttempt>;
type Dashboard = {
  recommended: Job[];
  attempts: PublicAttempt[];
  policy: AssistantPolicy;
  counts: Record<string, number>;
  actions: {
    applicationId: string;
    company: string;
    title: string;
    kind: string;
    date: string;
    overdue: boolean;
  }[];
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || "Application Assistant unavailable.");
  return data;
}
function supported(app: Application) {
  try {
    applicationTarget(app.job.url);
    return !applicationWasApplied(app);
  } catch {
    return false;
  }
}
const stateLabels = {
  "awaiting-user": "Awaiting your action",
  "verified-ready": "Verified and ready for approval",
  "uncertain-submission": "Submission uncertain — do not retry",
  "confirmed-submission": "Submission confirmed",
};
const countLabels: Record<string, string> = {
  discovered: "Jobs stored from discovery",
  eligible: "Location-supported jobs",
  shortlisted: "Shortlisted jobs",
  packages: "Approved CV packages",
  filled: "Forms with verified readback",
  intervention: "Companion attempts needing action",
  browserConfirmed: "Browser-observed confirmations",
  ownerReconciled: "Submissions reconciled by you",
  ownerReported: "Other manually recorded submissions",
  responses: "Employer responses recorded by you",
  interviews: "Interviews recorded",
  offers: "Offers recorded",
  rejections: "Rejections recorded",
  followUps: "Follow-ups due or upcoming",
};
export default function ApplicationAssistant({
  active,
  applications,
  selectedId,
  onSelect,
  openBuilder,
  onApplications,
  onProfile,
}: {
  active: boolean;
  applications: Application[];
  selectedId: string;
  onSelect: (id: string) => void;
  openBuilder: (job: Job, app?: Application) => void;
  onApplications: () => Promise<void>;
  onProfile: () => void;
}) {
  const [dashboard, setDashboard] = useState<Dashboard>(),
    [drafts, setDrafts] = useState<ResumeListItem[]>([]),
    [draft, setDraft] = useState<ResumeDraft>(),
    [answerSnapshot, setAnswerSnapshot] = useState<BankAnswer[]>([]),
    [draftId, setDraftId] = useState(""),
    [firstName, setFirstName] = useState(""),
    [lastName, setLastName] = useState(""),
    [verifiedFacts, setVerifiedFacts] = useState<string[]>([]),
    [approved, setApproved] = useState(false),
    [includeLetter, setIncludeLetter] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [extensionId, setExtensionId] = useState(""),
    [handoff, setHandoff] = useState(""),
    [reason, setReason] = useState(""),
    [decisionConfirmed, setDecisionConfirmed] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [board, setBoard] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const load = useCallback(async () => {
    const [data, versions] = await Promise.all([
      api<Dashboard>("assisted-apply/dashboard"),
      api<ResumeListItem[]>("resumes"),
    ]);
    setDashboard(data);
    setDrafts(versions);
  }, []);
  useEffect(() => {
    if (!active) return;
    const initial = setTimeout(
      () => void load().catch((e) => setMessage(e.message)),
      0,
    );
    const timer = setInterval(
      () => void load().catch((e) => setMessage(e.message)),
      10000,
    );
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [active, load]);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = applications.find((a) => a.id === selectedId),
    attempts = dashboard?.attempts || [],
    current = attempts.find(
      (a) => a.applicationId === selectedId && !a.closedAt,
    );
  function select(id: string) {
    onSelect(id);
    setDraft(undefined);
    setDraftId("");
    setApproved(false);
    setVerifiedFacts([]);
    setHandoff("");
  }
  async function chooseDraft(id: string) {
    setApproved(false);
    setVerifiedFacts([]);
    setDraftId(id);
    if (!id) {
      setDraft(undefined);
      return;
    }
    await work(async () => {
      const [cv, answers] = await Promise.all([
        api<ResumeDraft>(`resumes/${id}`),
        api<BankAnswer[]>("assisted-apply/answers"),
      ]);
      setDraft(cv);
      setAnswerSnapshot(answers);
      const names = cv.content.name.trim().split(/\s+/);
      setFirstName(names[0] || "");
      setLastName(names.slice(1).join(" "));
    });
  }
  async function command(
    a: PublicAttempt,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    await api(`assisted-apply/${a.id}`, "POST", { action, ...extra });
    await onApplications();
    setHandoff("");
    setDecisionConfirmed(false);
  }
  const reviewedAnswers = answerSnapshot.filter(
    (a) =>
      !a.invalidated &&
      !a.disabled &&
      (a.vacancyKey === "*" ||
        (() => {
          try {
            return (
              !!selected &&
              a.vacancyKey === applicationTarget(selected.job.url).key
            );
          } catch {
            return false;
          }
        })()),
  );
  const filtered = attempts.filter(
    (a) =>
      (filter === "all" || a.state === filter) &&
      (board === "all" || (a.target.platform || "Greenhouse") === board) &&
      (!from || a.approvedAt.slice(0, 10) >= from) &&
      (!to || a.approvedAt.slice(0, 10) <= to) &&
      (!query ||
        `${a.company} ${a.title}`.toLowerCase().includes(query.toLowerCase())),
  );
  if (!active) return null;
  return (
    <section aria-label="Application Assistant" className="assistant-workspace">
      <p>
        Choose a saved CV, approve its exact documents and facts, then use the
        Launchpad Chrome companion on the employer page. Every submission needs
        your explicit approval. Discovery and preparation never submit
        applications.
      </p>
      <div className="module-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void work(load)}
        >
          Refresh assistant
        </button>
        <button className="secondary" onClick={onProfile}>
          Edit Application Answers in My Profile
        </button>
        <a
          className="secondary"
          href="https://github.com/Harmedino/job-hunt/blob/master/docs/assisted-apply.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Install companion / setup guide
        </a>
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <h2>Needs your attention</h2>
        {!attempts.some(
          (a) =>
            !a.closedAt &&
            ["awaiting-user", "uncertain-submission"].includes(a.state),
        ) &&
          !dashboard?.actions.length && (
            <p>No recorded companion blockers or application reminders.</p>
          )}
        {attempts
          .filter(
            (a) =>
              !a.closedAt &&
              ["awaiting-user", "uncertain-submission"].includes(a.state),
          )
          .map((a) => (
            <article key={a.id}>
              <button
                className="secondary"
                onClick={() => select(a.applicationId)}
              >
                {a.company} — {a.title}
              </button>
              <p>{stateLabels[a.state]}</p>
              {a.report?.blockers.map((b) => (
                <p key={b}>{b}</p>
              ))}
            </article>
          ))}
        {applications
          .filter(
            (a) =>
              !applicationWasApplied(a) &&
              a.saved !== false &&
              a.job.eligibility === "review",
          )
          .map((a) => (
            <p key={a.id}>
              <button className="secondary" onClick={() => select(a.id)}>
                {a.job.company} — {a.job.title}
              </button>{" "}
              Eligibility needs your review: {a.job.eligibilityReason}
            </p>
          ))}
        {dashboard?.actions.map((a) => (
          <p key={`${a.applicationId}-${a.kind}`}>
            {a.kind} {a.date} {a.overdue ? "(overdue)" : ""}: {a.company} —{" "}
            {a.title}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2>Ready for your final review</h2>
        {!attempts.some((a) => !a.closedAt && a.state === "verified-ready") && (
          <p>No companion form has a completed verified readback yet.</p>
        )}
        {attempts
          .filter((a) => !a.closedAt && a.state === "verified-ready")
          .map((a) => (
            <p key={a.id}>
              <button
                className="secondary"
                onClick={() => select(a.applicationId)}
              >
                {a.company} — {a.title}
              </button>{" "}
              Values were verified. Review and authorize submission in the
              companion.
            </p>
          ))}
      </section>
      <section className="panel">
        <h2>Today’s recommended applications</h2>
        <p>
          Uses your saved career, stack, salary and location evidence, plus the
          application policy below. Remote eligibility does not establish legal
          work authorization.
        </p>
        {!dashboard?.recommended.length && (
          <p>
            No stored jobs currently pass this policy. Use Job Finder to refresh
            discovery or adjust your editable preferences.
          </p>
        )}
        {dashboard?.recommended.map((job) => (
          <article key={job.id}>
            <h3>
              {job.company} — {job.title}
            </h3>
            <p>
              {job.score}% evidence match ·{" "}
              {job.eligibility === "eligible"
                ? "Location supported"
                : "Location needs verification"}{" "}
              · {job.eligibilityReason}
            </p>
            <details>
              <summary>Matching evidence</summary>
              {job.matchReasons?.map((r) => (
                <p key={r}>{r}</p>
              ))}
            </details>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const app = await api<Application>("applications", "POST", {
                    jobId: job.id,
                  });
                  await onApplications();
                  select(app.id);
                })
              }
            >
              Prepare this application
            </button>
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Prepare and approve an application</h2>
        <label>
          Saved supported application
          <select value={selectedId} onChange={(e) => select(e.target.value)}>
            <option value="">Choose application</option>
            {applications.filter(supported).map((app) => (
              <option key={app.id} value={app.id}>
                {app.job.company} — {app.job.title}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <p>{selected.job.eligibilityReason}</p>
            <a
              href={selected.job.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Review original employer posting
            </a>
            <button
              className="secondary"
              onClick={() => openBuilder(selected.job, selected)}
            >
              Open existing CV Builder for this job
            </button>
          </>
        )}
        {selected && !current && (
          <>
            <label>
              Saved tailored CV version
              <select
                value={draftId}
                disabled={busy}
                onChange={(e) => void chooseDraft(e.target.value)}
              >
                <option value="">Choose saved CV</option>
                {drafts
                  .filter((d) => !d.kind?.startsWith("master-"))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.target.company} — {d.target.title} ·{" "}
                      {new Date(d.createdAt).toLocaleString()} ·{" "}
                      {d.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
            {draft && (
              <>
                <div className="module-actions">
                  <a
                    className="secondary"
                    href={`/api/resumes/${draft.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Review exact CV PDF
                  </a>
                  <a
                    className="secondary"
                    href={`/api/resumes/${draft.id}/export?format=docx&document=cv`}
                  >
                    Download Word version
                  </a>
                </div>
                <p>
                  {draft.method} · {draft.warnings.join(" ")}{" "}
                  {draft.requirementsToReview.join(" ")}
                </p>
                <div className="form-grid">
                  <label>
                    Verified first name
                    <input
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        setApproved(false);
                      }}
                    />
                  </label>
                  <label>
                    Verified last name
                    <input
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        setApproved(false);
                      }}
                    />
                  </label>
                </div>
                {factKeys.map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={verifiedFacts.includes(key)}
                      onChange={(e) => {
                        setVerifiedFacts(
                          e.target.checked
                            ? [...verifiedFacts, key]
                            : verifiedFacts.filter((k) => k !== key),
                        );
                        setApproved(false);
                      }}
                    />{" "}
                    I verified {key}:{" "}
                    {key === "firstName"
                      ? firstName
                      : key === "lastName"
                        ? lastName
                        : draft.content[key] || "Not provided"}
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={includeLetter}
                    onChange={(e) => {
                      setIncludeLetter(e.target.checked);
                      setApproved(false);
                    }}
                    disabled={!draft.coverLetter}
                  />{" "}
                  Include this saved cover letter (optional)
                </label>
                {includeLetter && (
                  <details>
                    <summary>Review saved cover letter</summary>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {draft.coverLetter}
                    </p>
                  </details>
                )}
                <p>
                  These confirmed private answers will be frozen with the
                  package. Stale and disabled answers are excluded.
                </p>
                {reviewedAnswers.map((a) => (
                  <p key={a.id}>
                    {a.question}: <strong>{a.answer}</strong> · {a.source}
                  </p>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />{" "}
                  I reviewed this CV, selected facts, private answers and
                  employer eligibility. I approve this immutable package for
                  form preparation. This does not authorize submission.
                </label>
                <button
                  className="primary"
                  disabled={busy || !approved}
                  onClick={() =>
                    void work(async () => {
                      await api("assisted-apply", "POST", {
                        applicationId: selected.id,
                        draftId: draft.id,
                        firstName,
                        lastName,
                        verifiedFacts,
                        includeLetter,
                        approved,
                        reviewedAnswers,
                      });
                      setApproved(false);
                    })
                  }
                >
                  Approve immutable package
                </button>
              </>
            )}
          </>
        )}
        {current && (
          <>
            <h3>{stateLabels[current.state]}</h3>
            <p>
              CV version {current.draftId} · Package {current.packageHash}
            </p>
            <p>
              Frozen documents:{" "}
              {current.files.map((f) => `${f.kind}: ${f.name}`).join(", ")}
            </p>
            <a
              className="secondary"
              href={`/api/assisted-apply/${current.id}/file?kind=cv`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Review approved frozen CV PDF
            </a>
            <details>
              <summary>Approved facts and answers</summary>
              {Object.entries(current.facts).map(([k, v]) => (
                <p key={k}>
                  {k}: {v}
                </p>
              ))}
              {current.answers.map((a) => (
                <p key={a.id}>
                  {a.question}: {a.answer}
                </p>
              ))}
            </details>
            {!["uncertain-submission", "confirmed-submission"].includes(
              current.state,
            ) && (
              <>
                <label>
                  Installed Chrome extension ID
                  <input
                    autoComplete="off"
                    value={extensionId}
                    onChange={(e) => setExtensionId(e.target.value.trim())}
                    placeholder="Copy from chrome://extensions"
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      const data = await api<{ code: string }>(
                        `assisted-apply/${current.id}/handoff`,
                        "POST",
                        { extensionId },
                      );
                      setHandoff(data.code);
                    })
                  }
                >
                  Create two-minute companion handoff
                </button>
                {handoff && (
                  <label>
                    One-time private handoff — paste into the Launchpad
                    extension
                    <textarea
                      readOnly
                      rows={4}
                      value={handoff}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                )}
              </>
            )}
            {current.report && (
              <>
                <h3>Readback review</h3>
                <div className="assistant-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Expected</th>
                        <th>Observed</th>
                        <th>Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.report.fields.map((f, i) => (
                        <tr key={`${f.id}-${i}`}>
                          <td>{f.label || f.id}</td>
                          <td>{f.expected}</td>
                          <td>
                            {f.kind === "file"
                              ? f.files
                                  ?.map(
                                    (file) => `${file.name} (${file.sha256})`,
                                  )
                                  .join(", ") || "No attachment"
                              : f.value || "Empty"}
                          </td>
                          <td>{f.verification}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {current.report.blockers.map((b) => (
                  <p key={b}>{b}</p>
                ))}
              </>
            )}
            {current.receipt && (
              <p>
                Confirmation evidence: {current.receipt.text} ·{" "}
                {current.receipt.observedAt} ·{" "}
                <a
                  href={current.receipt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source URL
                </a>
              </p>
            )}
            {current.syncWarning && (
              <>
                <p role="alert">{current.syncWarning}</p>
                <button
                  className="secondary"
                  onClick={() => void work(() => command(current, "sync"))}
                >
                  Retry tracking synchronization only
                </button>
              </>
            )}
            {current.leaseActive && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void work(() =>
                    command(current, "revoke", { confirmed: true }),
                  )
                }
              >
                Stop and revoke companion access
              </button>
            )}
            {(current.state === "uncertain-submission" ||
              (!current.submissionIntentAt &&
                current.state !== "confirmed-submission")) && (
              <details>
                <summary>
                  {current.state === "uncertain-submission"
                    ? "Reconcile uncertain submission"
                    : "Close unsubmitted attempt to approve a revised package"}
                </summary>
                <p>
                  Check the employer’s actual confirmation or response. Missing
                  confirmation alone does not prove that submission failed.
                </p>
                <label>
                  Evidence or reason
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={decisionConfirmed}
                    onChange={(e) => setDecisionConfirmed(e.target.checked)}
                  />{" "}
                  I verified this decision and understand the
                  duplicate-application risk.
                </label>
                {current.state === "uncertain-submission" ? (
                  <>
                    <button
                      className="secondary"
                      disabled={busy || !decisionConfirmed}
                      onClick={() =>
                        void work(() =>
                          command(current, "reconcile", {
                            confirmed: true,
                            outcome: "confirmed",
                            reason,
                          }),
                        )
                      }
                    >
                      Record my confirmed submission evidence
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || !decisionConfirmed}
                      onClick={() =>
                        void work(() =>
                          command(current, "reconcile", {
                            confirmed: true,
                            outcome: "not-submitted",
                            reason,
                          }),
                        )
                      }
                    >
                      I verified no submission occurred; allow fresh review
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary"
                    disabled={busy || !decisionConfirmed}
                    onClick={() =>
                      void work(() =>
                        command(current, "close", { confirmed: true, reason }),
                      )
                    }
                  >
                    Close without submission
                  </button>
                )}
              </details>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>Application activity and analytics</h2>
        <p>
          Counts come from stored records; companion activity is limited to the
          latest 500 attempts. User-entered outcomes remain distinct from
          browser confirmation evidence.
        </p>
        <div className="assistant-counts">
          {Object.entries(dashboard?.counts || {}).map(([key, value]) => (
            <p key={key}>
              {countLabels[key] || key}: <strong>{value}</strong>
            </p>
          ))}
        </div>
        <div className="form-grid">
          <label>
            Employer or role
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            Companion status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All outcomes</option>
              {Object.entries(stateLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Board
            <select value={board} onChange={(e) => setBoard(e.target.value)}>
              {["all", "Greenhouse", "Lever", "Ashby"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <p>{filtered.length} companion attempts match these filters.</p>
        {filtered.map((a) => (
          <details key={a.id}>
            <summary>
              {a.company} — {a.title} · {stateLabels[a.state]}
              {a.closedAt ? " · Closed" : ""}
            </summary>
            <button
              className="secondary"
              onClick={() => select(a.applicationId)}
            >
              Review attempt
            </button>
            {a.history.map((h, i) => (
              <p key={i}>
                {h.at}: {stateLabels[h.state]} — {h.reason}
              </p>
            ))}
          </details>
        ))}
      </section>
      {dashboard && (
        <AssistantSettings
          policy={dashboard.policy}
          busy={busy}
          save={(p) =>
            work(async () => {
              await api("assisted-apply/settings", "PUT", p);
              setMessage(
                "Preparation policy saved. Unattended submissions remain disabled.",
              );
            })
          }
        />
      )}
    </section>
  );
}
function AssistantSettings({
  policy,
  save,
  busy,
}: {
  policy: AssistantPolicy;
  save: (policy: AssistantPolicy) => Promise<void>;
  busy: boolean;
}) {
  const [value, setValue] = useState(policy);
  return (
    <details className="panel">
      <summary>Automation and preparation settings</summary>
      <p>
        The existing authenticated cron can discover and shortlist suitable
        jobs. CV generation, form filling and submission require you. Operating
        hours and the daily submission-attempt limit are checked before each
        companion submission. AI limits below apply only to optional
        form-mapping suggestions.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(value);
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={value.preparationEnabled}
            onChange={(e) =>
              setValue({ ...value, preparationEnabled: e.target.checked })
            }
          />{" "}
          Enable scheduled shortlisting after existing discovery
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.eligibleOnly}
            onChange={(e) =>
              setValue({ ...value, eligibleOnly: e.target.checked })
            }
          />{" "}
          Recommend confirmed location-supported jobs only
        </label>
        <div className="form-grid">
          {(
            [
              "minScore",
              "maxPerDay",
              "maxAgeDays",
              "startHour",
              "endHour",
              "aiMaxCallsPerDay",
            ] as const
          ).map((k) => (
            <label key={k}>
              {
                {
                  minScore: "Minimum evidence match (%)",
                  maxPerDay: "Daily application-attempt / shortlist limit",
                  maxAgeDays: "Maximum job age (days)",
                  startHour: "Operating start hour (0–23)",
                  endHour: "Operating end hour (1–24)",
                  aiMaxCallsPerDay:
                    "Maximum form AI suggestion requests per day (0 disables)",
                }[k]
              }
              <input
                type="number"
                value={value[k]}
                onChange={(e) =>
                  setValue({ ...value, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <label>
            Timezone
            <input
              value={value.timezone}
              onChange={(e) => setValue({ ...value, timezone: e.target.value })}
            />
          </label>
        </div>
        <label>
          Preferred role phrases (comma separated; blank uses current career
          preferences)
          <input
            value={value.preferredRoles.join(",")}
            onChange={(e) =>
              setValue({
                ...value,
                preferredRoles: e.target.value.split(",").filter(Boolean),
              })
            }
          />
        </label>
        <label>
          Excluded employers (comma separated)
          <input
            value={value.excludedCompanies.join(",")}
            onChange={(e) =>
              setValue({
                ...value,
                excludedCompanies: e.target.value.split(",").filter(Boolean),
              })
            }
          />
        </label>
        {["Greenhouse", "Lever", "Ashby"].map((b) => (
          <label key={b}>
            <input
              type="checkbox"
              checked={value.allowedBoards.includes(b)}
              onChange={(e) =>
                setValue({
                  ...value,
                  allowedBoards: e.target.checked
                    ? [...value.allowedBoards, b]
                    : value.allowedBoards.filter((x) => x !== b),
                })
              }
            />{" "}
            Allow {b}
          </label>
        ))}
        <p>
          Unattended submissions: disabled. No additional paid service is
          required.
        </p>
        <button className="primary" disabled={busy}>
          Save preparation policy
        </button>
      </form>
    </details>
  );
}
