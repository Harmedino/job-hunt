"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileText, History, Save, Sparkles } from "lucide-react";
import {
  resumeContactFields,
  resumeSections,
  type BuilderJob,
  type ResumeContent,
  type ResumeDraft,
  type ResumeListItem,
} from "@/lib/resume-types";
type TargetForm = {
  title: string;
  company: string;
  description: string;
  url: string;
  jobId?: string;
  applicationId?: string;
};
const blankTarget: TargetForm = {
  title: "",
  company: "",
  description: "",
  url: "",
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/resumes${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your session expired. Sign in again to continue."
        : data?.error || "The CV request could not be completed. Try again.",
    );
  return data;
}
export default function CvBuilder({
  active,
  connected,
  ai,
  jobs,
  initialJob,
  onProfile,
  onAttached,
}: {
  active: boolean;
  connected: boolean;
  ai: boolean;
  jobs: BuilderJob[];
  initialJob?: BuilderJob;
  onProfile: () => void;
  onAttached: () => Promise<void>;
}) {
  const [target, setTarget] = useState<TargetForm>(blankTarget);
  const [choice, setChoice] = useState("manual");
  const [mode, setMode] = useState<"auto" | "ai" | "profile">("auto");
  const [draft, setDraft] = useState<ResumeDraft>();
  const [content, setContent] = useState<ResumeContent>();
  const [history, setHistory] = useState<ResumeListItem[]>([]);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const revealEditor = useRef(false);
  const useAi = ai && mode !== "profile";
  const dirty =
    !!draft &&
    !!content &&
    JSON.stringify(content) !== JSON.stringify(draft.content);
  useEffect(() => {
    if (!active || !draft || !revealEditor.current) return;
    revealEditor.current = false;
    const editor = document.getElementById("cv-builder-editor");
    editor?.scrollIntoView({ behavior: "smooth", block: "start" });
    editor?.focus({ preventScroll: true });
  }, [active, draft]);
  useEffect(() => {
    if (!active || !connected) return;
    let current = true;
    request<{ drafts: ResumeListItem[] }>("")
      .then((data) => {
        if (current) setHistory(data.drafts);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [active, connected]);
  const [previousJob, setPreviousJob] = useState<BuilderJob>();
  if (initialJob !== previousJob) {
    setPreviousJob(initialJob);
    if (initialJob) {
      setTarget({
        title: initialJob.title,
        company: initialJob.company,
        description: initialJob.description,
        url: initialJob.url,
        jobId: initialJob.id,
        applicationId: initialJob.applicationId,
      });
      setChoice(initialJob.applicationId || initialJob.id);
      setFeedback(
        initialJob.draftId
          ? "Application loaded. Open its saved CV below, or generate a new draft."
          : "Job description loaded. Generate a CV draft to tailor your saved qualifications.",
      );
    }
  }
  function editTarget(changes: Partial<TargetForm>) {
    setTarget((value) => ({
      ...value,
      ...changes,
      jobId: undefined,
      applicationId: undefined,
    }));
    setChoice("manual");
  }
  function remember(value: ResumeDraft) {
    setDraft(value);
    setContent(value.content);
    setHistory((items) =>
      [
        {
          id: value.id,
          familyId: value.familyId,
          createdAt: value.createdAt,
          target: value.target,
          method: value.method,
          manualEdits: value.manualEdits,
        },
        ...items.filter((item) => item.id !== value.id),
      ]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50),
    );
  }
  async function work(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError("");
    setFeedback("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "CV action failed.");
    } finally {
      setBusy("");
    }
  }
  async function saved(): Promise<ResumeDraft> {
    if (!draft || !content) throw new Error("Create a CV draft first.");
    if (!dirty) return draft;
    const value = await request<ResumeDraft>("", {
      action: "save",
      draftId: draft.id,
      content,
    });
    remember(value);
    return value;
  }
  async function generate() {
    await work("generate", async () => {
      if (dirty) await saved();
      const value = await request<ResumeDraft>("", {
        action: "generate",
        useAi,
        ...(target.jobId
          ? { jobId: target.jobId, applicationId: target.applicationId }
          : { target }),
      });
      revealEditor.current = true;
      remember(value);
      setFeedback(
        "CV draft created and saved. Edit the sections, check the preview and download your PDF.",
      );
    });
  }
  async function load(id: string) {
    await work("load", async () => {
      if (dirty) await saved();
      const value = await request<ResumeDraft>(`/${encodeURIComponent(id)}`);
      revealEditor.current = true;
      remember(value);
      setTarget({ ...value.target });
      setChoice(value.target.applicationId || value.target.jobId || "manual");
      setFeedback(
        "Saved CV version opened. Your edits will be saved as a separate version.",
      );
    });
  }
  async function download() {
    await work("download", async () => {
      const value = await saved();
      const response = await fetch(`/api/resumes/${value.id}/pdf`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || "PDF export failed. Your CV is saved; try again.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "tailored-cv.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setFeedback(
        "PDF downloaded from your saved CV version. Review it before applying.",
      );
    });
  }
  const labels = {
    name: "Full name",
    email: "Email",
    phone: "Phone",
    location: "Location",
    github: "GitHub URL",
    linkedin: "LinkedIn URL",
    portfolio: "Portfolio URL",
  };
  return (
    <section className="cv-builder" aria-label="CV builder">
      <div className="builder-intro">
        <FileText size={23} />
        <div>
          <h2>A CV built for the job.</h2>
          <p>
            Choose a role, tailor your actual qualifications, then edit and
            export a professional CV.
          </p>
        </div>
      </div>
      {!connected && (
        <div className="notice">
          Connect MongoDB and save your profile to create and keep CV versions.{" "}
          <button onClick={onProfile}>Open My Profile</button>
        </div>
      )}
      {error && (
        <div className="cv-feedback error" role="alert">
          {error}
        </div>
      )}
      {feedback && (
        <div className="cv-feedback success" role="status">
          {feedback}
        </div>
      )}
      <div className="builder-layout">
        <div className="builder-controls">
          <form
            className="panel builder-target"
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
          >
            <h3>1. Choose the job</h3>
            <label>
              Job to tailor for
              <select
                aria-label="Job to tailor for"
                value={choice}
                disabled={!!busy}
                onChange={(event) => {
                  const value = event.target.value;
                  setChoice(value);
                  const selected = jobs.find(
                    (job) => (job.applicationId || job.id) === value,
                  );
                  setTarget(
                    selected
                      ? {
                          title: selected.title,
                          company: selected.company,
                          description: selected.description,
                          url: selected.url,
                          jobId: selected.id,
                          applicationId: selected.applicationId,
                        }
                      : blankTarget,
                  );
                }}
              >
                <option value="manual">Paste a job description</option>
                {jobs.map((job) => (
                  <option
                    key={job.applicationId || job.id}
                    value={job.applicationId || job.id}
                  >
                    {job.title} — {job.company}
                    {job.applicationId ? " (saved application)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target role
              <input
                required
                value={target.title}
                maxLength={500}
                disabled={!!busy}
                onChange={(e) => editTarget({ title: e.target.value })}
              />
            </label>
            <label>
              Company
              <input
                value={target.company}
                maxLength={500}
                disabled={!!busy}
                onChange={(e) => editTarget({ company: e.target.value })}
              />
            </label>
            <label>
              Job description
              <textarea
                aria-label="Job description"
                required
                minLength={50}
                maxLength={25000}
                rows={9}
                value={target.description}
                disabled={!!busy}
                onChange={(e) => editTarget({ description: e.target.value })}
                placeholder="Paste the responsibilities and requirements…"
              />
            </label>
            {!target.jobId && (
              <label>
                Original job link (optional)
                <input
                  type="url"
                  value={target.url}
                  maxLength={500}
                  disabled={!!busy}
                  onChange={(e) =>
                    setTarget({ ...target, url: e.target.value })
                  }
                />
              </label>
            )}
            <label className="builder-ai">
              <input
                type="checkbox"
                checked={useAi}
                disabled={!ai || !!busy}
                onChange={(e) => setMode(e.target.checked ? "ai" : "profile")}
              />
              Use AI to write and tailor this CV
            </label>
            <p className="builder-help">
              {ai
                ? "AI drafts are checked against your saved evidence. Your profile and this description are sent to OpenAI when enabled."
                : "AI is not connected. The profile-based builder still works; connect OPENAI_API_KEY in Vercel to enable AI writing."}
            </p>
            <button className="primary" disabled={!!busy || !connected}>
              <Sparkles size={16} />
              {busy === "generate"
                ? "Building your CV…"
                : useAi
                  ? "Build tailored CV"
                  : "Create profile-based CV"}
            </button>
            <button
              type="button"
              className="builder-profile-link"
              onClick={onProfile}
            >
              Update the qualifications in My Profile
            </button>
          </form>
          {initialJob?.draftId && initialJob.draftId !== draft?.id && (
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => void load(initialJob.draftId!)}
            >
              Open this application’s saved CV
            </button>
          )}
          <section className="panel builder-history">
            <h3>
              <History size={16} /> Recent saved versions
            </h3>
            {history.length ? (
              history.map((item) => (
                <button
                  key={item.id}
                  className={draft?.id === item.id ? "selected" : ""}
                  disabled={!!busy}
                  onClick={() => void load(item.id)}
                >
                  <b>{item.target.title}</b>
                  <span>
                    {item.target.company || "Pasted description"} ·{" "}
                    {new Date(item.createdAt).toLocaleString("en-NG", {
                      timeZone: "Africa/Lagos",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    WAT
                  </span>
                  <small>
                    {item.manualEdits ? "Edited version" : item.method}
                  </small>
                </button>
              ))
            ) : (
              <p>Your saved CV versions will appear here.</p>
            )}
          </section>
        </div>
        <div className="builder-workspace">
          {draft && content ? (
            <>
              <section
                id="cv-builder-editor"
                tabIndex={-1}
                className="panel builder-editor"
              >
                <div className="builder-editor-heading">
                  <div>
                    <h3>2. Edit your CV</h3>
                    <p>
                      {draft.manualEdits ? "Manually edited CV" : draft.method}{" "}
                      · {dirty ? "Unsaved edits" : "Saved version"}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      document
                        .getElementById("cv-builder-preview")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Preview CV
                  </button>
                </div>
                <p>
                  Keep every qualification accurate. Edits you type are treated
                  as your own information. New versions preserve earlier CVs and
                  submitted applications. Manual edits are not automatically
                  fact-checked.
                </p>
                <div className="form-grid">
                  {resumeContactFields.map((key) => (
                    <label key={key}>
                      {labels[key]}
                      <input
                        value={content[key]}
                        type={key === "email" ? "email" : "text"}
                        disabled={!!busy}
                        onChange={(e) =>
                          setContent({ ...content, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                {(
                  Object.keys(resumeSections) as (keyof typeof resumeSections)[]
                ).map((key) => (
                  <label key={key}>
                    {resumeSections[key]}
                    <textarea
                      aria-label={resumeSections[key]}
                      rows={key === "summary" || key === "skills" ? 3 : 6}
                      maxLength={20000}
                      value={content[key]}
                      disabled={!!busy}
                      onChange={(e) =>
                        setContent({ ...content, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                {draft.warnings.map((warning) => (
                  <p key={warning} className="location-warning">
                    {warning}
                  </p>
                ))}
                {draft.requirementsToReview.length > 0 && (
                  <div className="builder-gaps">
                    <h4>Requirements to check</h4>
                    <p>
                      The draft did not establish evidence for these
                      requirements. Confirm your qualifications before adding
                      them.
                    </p>
                    <ul>
                      {draft.requirementsToReview.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <details className="builder-evidence">
                  <summary>Source qualifications used for this draft</summary>
                  {draft.evidence.map((evidence, index) => (
                    <p key={index}>
                      <b>{resumeSections[evidence.section]}</b>
                      <br />
                      {evidence.text}
                    </p>
                  ))}
                </details>
                <div className="builder-actions">
                  <button
                    className="secondary"
                    disabled={!!busy || !dirty}
                    onClick={() =>
                      void work("save", async () => {
                        await saved();
                        setFeedback(
                          "New CV version saved. Earlier versions are preserved.",
                        );
                      })
                    }
                  >
                    <Save size={15} />
                    {busy === "save" ? "Saving…" : "Save new version"}
                  </button>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => void download()}
                  >
                    <Download size={15} />
                    {busy === "download"
                      ? "Exporting…"
                      : dirty
                        ? "Save & download PDF"
                        : "Download CV PDF"}
                  </button>
                </div>
                {draft.target.applicationId && (
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void work("attach", async () => {
                        const value = await saved();
                        await request(`/${value.id}/attach`, {});
                        await onAttached();
                        setFeedback(
                          "This saved CV version is linked to the application. Review the package before submitting on the employer’s website.",
                        );
                      })
                    }
                  >
                    {busy === "attach"
                      ? "Checking application…"
                      : "Use this CV for application"}
                  </button>
                )}
              </section>
              <section
                id="cv-builder-preview"
                className="builder-preview"
                aria-label="CV preview"
              >
                <div className="builder-preview-label">
                  3. Preview your CV{" "}
                  <button
                    className="builder-profile-link"
                    onClick={() =>
                      document
                        .getElementById("cv-builder-editor")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Back to editor
                  </button>
                </div>
                <article className="resume-paper">
                  <h2>{content.name}</h2>
                  <p className="resume-contact">
                    {[content.email, content.phone, content.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {[content.github, content.linkedin, content.portfolio]
                    .filter(Boolean)
                    .map((url, index) => (
                      <p className="resume-url" key={index}>
                        {url}
                      </p>
                    ))}
                  <p className="resume-target">
                    Application: {draft.target.title}
                    {draft.target.company ? ` · ${draft.target.company}` : ""}
                  </p>
                  {(
                    Object.keys(
                      resumeSections,
                    ) as (keyof typeof resumeSections)[]
                  ).map(
                    (key) =>
                      content[key].trim() && (
                        <section key={key}>
                          <h3>{resumeSections[key]}</h3>
                          <div>{content[key]}</div>
                        </section>
                      ),
                  )}
                </article>
              </section>
            </>
          ) : (
            <div className="panel builder-empty">
              <FileText size={38} />
              <h3>Your next CV starts here.</h3>
              <p>
                Pick a job or paste its description, then create a draft from
                your saved profile. You can edit every section and download a
                formatted PDF.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
