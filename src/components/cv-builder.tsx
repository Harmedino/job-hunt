"use client";
import ResumeOptionsEditor from "./resume-options-editor";
import ResumeEntryEditor from "./resume-entry-editor";
import ResumeStatementReview from "./resume-statement-review";
import MasterExperienceUpdate from "./master-experience-update";
import SavedPdfPreview from "./saved-pdf-preview";
import { isEntrySection } from "@/lib/resume-layout";
import { careerPath } from "@/lib/career-policy";
import {
  materializeCareerProfile,
  nyscCvText,
  confirmedCustomEvidence,
  type CvTrack,
} from "@/lib/career-records";
import {
  validateResumeOptions,
  type ResumeOptions,
} from "@/lib/resume-options";
import { suggestJobKeywords } from "@/lib/job-keywords";
import { resumeFilename } from "@/lib/resume-filename";
import { extractRequirements, skillMention } from "@/lib/job-intelligence";
import type { Profile } from "@/lib/types";
import { cleanResumeLayout } from "@/lib/resume-layout";
import ResumeSectionBody from "@/components/resume-section-body";
import { useEffect, useRef, useState } from "react";
import { Download, FileText, History, Save, Sparkles } from "lucide-react";
import {
  resumeContactFields,
  orderedResumeSections,
  type ResumeSection,
  resumeTemplates,
  type ResumeTemplate,
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
  keywords?: import("@/lib/job-keywords").JobKeyword[];
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
  aiLabel,
  jobs,
  initialJob,
  onProfile,
  onAttached,
  onTrack,
  onAddJob,
  onMasterUpdated,
}: {
  active: boolean;
  connected: boolean;
  ai: boolean;
  aiLabel?: string;
  jobs: BuilderJob[];
  initialJob?: BuilderJob;
  onProfile: () => void;
  onAttached: () => Promise<void>;
  onTrack?: () => void;
  onAddJob?: () => void;
  onMasterUpdated?: (profile: Profile) => void;
}) {
  const [target, setTarget] = useState<TargetForm>(blankTarget);
  const [choice, setChoice] = useState("manual");
  const [mode, setMode] = useState<"ai" | "profile">("ai");
  const [draft, setDraft] = useState<ResumeDraft>();
  const [content, setContent] = useState<ResumeContent>();
  const [coverLetter, setCoverLetter] = useState("");
  const [cvOptions, setCvOptions] = useState<ResumeOptions>(() =>
    validateResumeOptions({}),
  );
  const [statementReviews, setStatementReviews] = useState<
    NonNullable<ResumeDraft["statementReviews"]>
  >({});
  const [masterUpdate, setMasterUpdate] = useState<{
    recordId: string;
    proposed: string;
  }>();
  const [mobilePanel, setMobilePanel] = useState("editor");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [comparison, setComparison] = useState<ResumeDraft>();
  const [previewRevision, setPreviewRevision] = useState(0);
  const [generationKind, setGenerationKind] =
    useState<NonNullable<ResumeDraft["kind"]>>("tailored");
  const [sectionOrder, setSectionOrder] = useState<ResumeSection[]>(
    orderedResumeSections(),
  );
  const [template, setTemplate] = useState<ResumeTemplate>("classic");
  const [documentKind, setDocumentKind] = useState<"cv" | "letter">("cv");
  const [history, setHistory] = useState<ResumeListItem[]>([]);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [failedAction, setFailedAction] = useState("");
  const [master, setMaster] = useState<Profile>();
  const [recovery, setRecovery] = useState<{
    content: ResumeContent;
    coverLetter: string;
    template: ResumeTemplate;
    sectionOrder?: ResumeSection[];
    options?: ResumeOptions;
    statementReviews?: ResumeDraft["statementReviews"];
    updatedAt: string;
  }>();
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [pdfPreview, setPdfPreview] = useState("");
  const [readability, setReadability] = useState<{
    selectableText: boolean;
    wordCount: number;
    pageCount?: number;
    wordSelectableText?: boolean;
    warnings: string[];
    notice: string;
    extractedText: string;
  }>();
  useEffect(() => {
    if (!active || !connected) return;
    let current = true;
    void fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : undefined))
      .then((p) => {
        if (current && p) setMaster(p);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [active, connected]);
  const revealEditor = useRef(false);
  const useAi = mode === "ai";
  const dirty =
    !!draft &&
    !!content &&
    (JSON.stringify(content) !== JSON.stringify(draft.content) ||
      coverLetter !== (draft.coverLetter ?? "") ||
      template !== (draft.template || "classic") ||
      JSON.stringify(sectionOrder) !==
        JSON.stringify(orderedResumeSections(draft.sectionOrder)) ||
      JSON.stringify(cvOptions) !==
        JSON.stringify(
          draft.options ||
            validateResumeOptions({
              track:
                careerPath(draft.target.title, draft.target.description) ===
                "cybersecurity"
                  ? "cybersecurity"
                  : "development",
            }),
        ) ||
      JSON.stringify(statementReviews) !==
        JSON.stringify(draft.statementReviews || {}));
  useEffect(() => {
    if (!draft) return;
    let current = true;
    void request<{ copy: typeof recovery }>(
      `/working?draftId=${encodeURIComponent(draft.id)}`,
    )
      .then((data) => {
        if (current) setRecovery(data.copy || undefined);
      })
      .catch(() => {
        if (current)
          setAutosaveStatus(
            "Recovery is unavailable; keep this tab open or save a version.",
          );
      });
    return () => {
      current = false;
    };
  }, [draft]);
  useEffect(() => {
    if (!dirty || !draft || !content || !connected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setAutosaveStatus("Autosaving unfinished edits…");
      void fetch("/api/resumes/working", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          content,
          coverLetter,
          template,
          sectionOrder,
          options: cvOptions,
          statementReviews,
          revision: Date.now(),
        }),
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          setAutosaveStatus(
            "Unfinished edits autosaved. Save a new version before linking or exporting.",
          );
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setAutosaveStatus(
              "Autosave failed. Your edits remain in this tab; save a version before leaving.",
            );
        });
    }, 1200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    dirty,
    draft,
    content,
    coverLetter,
    template,
    sectionOrder,
    cvOptions,
    statementReviews,
    connected,
  ]);
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
      setGenerationKind("tailored");
      setCvOptions((current) => ({
        ...current,
        track:
          careerPath(initialJob.title, initialJob.description) ===
          "cybersecurity"
            ? "cybersecurity"
            : "development",
        selectedRecordIds: undefined,
        keywords:
          initialJob.keywords || suggestJobKeywords(initialJob.description),
      }));
      setFeedback(
        initialJob.draftId
          ? "Application loaded. Open its saved CV below, or generate a new draft."
          : "Job description loaded. Generate a CV draft to tailor your saved qualifications.",
      );
    }
  }
  function editTarget(changes: Partial<TargetForm>) {
    setGenerationKind("tailored");
    const next = {
      ...target,
      ...changes,
      jobId: undefined,
      applicationId: undefined,
    };
    const previousPath = careerPath(target.title, target.description),
      nextPath = careerPath(next.title, next.description);
    if (previousPath !== nextPath && nextPath !== "other")
      setCvOptions((current) => ({
        ...current,
        track: nextPath,
        selectedRecordIds: undefined,
      }));
    setTarget(next);
    setChoice("manual");
  }
  function remember(value: ResumeDraft) {
    setDraft(value);
    setGenerationKind(value.kind || "tailored");
    setCvOptions(
      validateResumeOptions(
        value.options || {
          track:
            careerPath(value.target.title, value.target.description) ===
            "cybersecurity"
              ? "cybersecurity"
              : "development",
        },
      ),
    );
    setStatementReviews(value.statementReviews || {});
    setPdfPreview("");
    setReadability(undefined);
    setContent(
      value.layoutVersion === 2
        ? value.content
        : cleanResumeLayout(value.content),
    );
    setCoverLetter(value.coverLetter ?? "");
    setTemplate(value.template || "classic");
    setSectionOrder(orderedResumeSections(value.sectionOrder));
    setHistory((items) =>
      [
        {
          id: value.id,
          familyId: value.familyId,
          createdAt: value.createdAt,
          target: value.target,
          method: value.method,
          manualEdits: value.manualEdits,
          kind: value.kind,
          options: value.options,
        },
        ...items.filter((item) => item.id !== value.id),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  async function work(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError("");
    setFailedAction("");
    setFeedback("");
    try {
      await action();
    } catch (e) {
      setFailedAction(name);
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
      coverLetter,
      template,
      sectionOrder,
      options: cvOptions,
      statementReviews,
    });
    remember(value);
    return value;
  }
  async function generate(retry = false) {
    await work("generate", async () => {
      if (dirty) await saved();
      const value = await request<ResumeDraft>("", {
        action: "generate",
        useAi,
        retry,
        template,
        options: cvOptions,
        ...(generationKind.startsWith("master-")
          ? { masterTrack: cvOptions.track }
          : {}),
        ...(target.jobId
          ? { jobId: target.jobId, applicationId: target.applicationId }
          : { target }),
      });
      revealEditor.current = true;
      remember(value);
      setFeedback(
        "CV saved independently. Review and edit it before export. A cover letter is optional and can be generated separately.",
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
  async function download(
    format: "pdf" | "docx" = "pdf",
    kind: "cv" | "letter" = documentKind,
  ) {
    await work("download", async () => {
      const value = await saved();
      const path =
        kind === "cv" && format === "pdf"
          ? "pdf"
          : `export?document=${kind}&format=${format}`;
      const response = await fetch(`/api/resumes/${value.id}/${path}`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error ||
            "Document export failed. Your saved version is safe; try again.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = resumeFilename(value.content, value.target, kind, format);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setFeedback(
        "Document downloaded from your saved version. Review it before applying.",
      );
    });
  }
  async function revert() {
    if (!draft) return;
    await work("revert", async () => {
      const r = await fetch("/api/resumes/working", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, revision: Date.now() + 1 }),
      });
      if (!r.ok)
        throw new Error(
          "Could not clear unfinished edits. Your current text remains available.",
        );
      remember(draft);
      setRecovery(undefined);
      setAutosaveStatus("Reverted to the saved version.");
    });
  }
  function moveSection(key: ResumeSection, direction: number) {
    setSectionOrder((current) => {
      const next = [...current],
        index = next.indexOf(key),
        other = index + direction;
      if (other < 0 || other >= next.length) return current;
      [next[index], next[other]] = [next[other], next[index]];
      return next;
    });
  }
  const comparisonProfile = master
    ? materializeCareerProfile(master, cvOptions.track)
    : undefined;
  const requirements = comparisonProfile
    ? extractRequirements(target.description, comparisonProfile)
    : [];
  const requestedSkills = [...new Set(requirements.flatMap((r) => r.skills))];
  const relevant = (section: "experience" | "projects") =>
    (comparisonProfile?.[section] || "")
      .split(/\n\s*\n/)
      .filter((text) =>
        requestedSkills.some((skill) => skillMention(text, skill)),
      );
  async function createMaster(track: CvTrack) {
    await work("generate", async () => {
      if (dirty) await saved();
      const value = await request<ResumeDraft>("", {
        action: "generate",
        useAi: false,
        masterTrack: track,
        options: {
          ...cvOptions,
          track,
          includeNysc: false,
          selectedRecordIds: undefined,
          keywords: [],
        },
        template,
      });
      remember(value);
      setTarget(value.target);
      setChoice("manual");
      setFeedback(
        "Master CV version saved using confirmed source records. Edit it freely; your permanent profile is unchanged.",
      );
    });
  }
  async function writePart(
    section: ResumeSection | "coverLetter",
    aiWriting: boolean,
    retry = false,
  ) {
    await work("writing-" + section, async () => {
      const current = await saved();
      const value = await request<ResumeDraft>(`/${current.id}/writing`, {
        section,
        useAi: aiWriting,
        retry,
      });
      remember(value);
      if (section === "coverLetter") setDocumentKind("letter");
      setFeedback(
        section === "coverLetter"
          ? "Optional cover letter saved as a separate document version. The CV remains intact."
          : "Only the requested CV section was regenerated. Review it against its source.",
      );
    });
  }
  async function refreshPdf() {
    await work("pdf-preview", async () => {
      const current = await saved();
      setPdfPreview(`/api/resumes/${current.id}/pdf`);
      setPreviewRevision((value) => value + 1);
      setFeedback("Saved PDF preview refreshed from this document version.");
    });
  }
  function applyAdditional() {
    if (!content || !master) return;
    try {
      const text = [
        nyscCvText(master, cvOptions.includeNysc),
        confirmedCustomEvidence(
          [...(master.customFields || []), ...cvOptions.customFields],
          cvOptions.includedCustomFields,
        ),
      ]
        .filter(Boolean)
        .join("\n");
      setContent({ ...content, additionalInfo: text });
      setFeedback(
        "Selected additional information applied to this edited CV only. Save a new version before export.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
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
      {onAddJob && (
        <button className="secondary" disabled={!connected} onClick={onAddJob}>
          Add Job Manually
        </button>
      )}
      <nav className="builder-steps" aria-label="CV preparation stages">
        {[
          ["cv-stage-1", "1. Choose job"],
          ["cv-stage-2", "2. Analyze requirements"],
          ["cv-stage-3", "3. Build and edit"],
          ["cv-stage-4", "4. Save and use"],
        ].map(([id, label]) => (
          <button
            className="secondary"
            key={id}
            onClick={() =>
              document
                .getElementById(id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {!connected && (
        <div className="notice">
          Connect MongoDB and save your profile to create and keep CV versions.{" "}
          <button onClick={onProfile}>Open My Profile</button>
        </div>
      )}
      {error && (
        <div className="cv-feedback error" role="alert">
          <p>{error}</p>
          <p>Your job inputs and unfinished edits remain available.</p>
          {failedAction === "generate" && (
            <button
              className="secondary"
              disabled={!!busy || !connected || (useAi && !ai)}
              onClick={() => void generate(true)}
            >
              Retry Generation
            </button>
          )}
          <button
            className="secondary"
            disabled={!!busy}
            onClick={() => {
              setMode("profile");
              setFeedback("Basic Layout selected. Create it below without AI.");
            }}
          >
            Use Basic Layout without AI
          </button>
        </div>
      )}
      {feedback && (
        <div className="cv-feedback success" role="status">
          {feedback}
        </div>
      )}
      {draft && (
        <div
          className="builder-mobile-switch"
          role="group"
          aria-label="Editor or PDF preview"
        >
          <button
            className="secondary"
            aria-pressed={mobilePanel === "editor"}
            onClick={() => setMobilePanel("editor")}
          >
            Editor
          </button>
          <button
            className="secondary"
            aria-pressed={mobilePanel === "preview"}
            onClick={() => setMobilePanel("preview")}
          >
            Preview
          </button>
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
            <h3 id="cv-stage-1">1. Choose the job</h3>
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
                  setGenerationKind("tailored");
                  if (selected)
                    setCvOptions((current) => ({
                      ...current,
                      track:
                        careerPath(selected.title, selected.description) ===
                        "cybersecurity"
                          ? "cybersecurity"
                          : "development",
                      selectedRecordIds: undefined,
                      keywords:
                        selected.keywords ||
                        suggestJobKeywords(selected.description),
                    }));
                  setTarget(
                    selected
                      ? {
                          title: selected.title,
                          company: selected.company,
                          description: selected.description,
                          url: selected.url,
                          jobId: selected.id,
                          applicationId: selected.applicationId,
                          keywords: selected.keywords,
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
            <details
              className="builder-description"
              key={choice}
              open={choice === "manual"}
            >
              <summary>
                Job description · {target.description.length} characters
              </summary>
              <label>
                Job description
                <textarea
                  aria-label="Job description"
                  required={useAi}
                  minLength={useAi ? 50 : undefined}
                  maxLength={25000}
                  rows={5}
                  onInvalid={(event) =>
                    event.currentTarget
                      .closest("details")
                      ?.setAttribute("open", "")
                  }
                  value={target.description}
                  disabled={!!busy}
                  onChange={(e) => editTarget({ description: e.target.value })}
                  placeholder="Paste the responsibilities and requirements…"
                />
              </label>
            </details>
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
            <section
              id="cv-stage-2"
              className="builder-analysis"
              aria-label="Job requirements analysis"
            >
              <h3>2. Analyze the requirements</h3>
              <p>
                Based on mentions in your saved master profile. Duration,
                proficiency and credentials need your review.
              </p>
              {!master ? (
                <p>Save your qualifications in My Profile to compare them.</p>
              ) : !target.description ? (
                <p>Choose or paste a job to begin.</p>
              ) : (
                <>
                  <p>
                    <b>Required technical skills:</b>{" "}
                    {[
                      ...new Set(
                        requirements
                          .filter((r) => r.kind === "required")
                          .flatMap((r) => r.skills),
                      ),
                    ].join(", ") ||
                      "No explicit technical skills identified; review the original description."}
                  </p>
                  <p>
                    <b>Preferred technical skills:</b>{" "}
                    {[
                      ...new Set(
                        requirements
                          .filter((r) => r.kind === "preferred")
                          .flatMap((r) => r.skills),
                      ),
                    ].join(", ") || "Not identified"}
                  </p>
                  <p>
                    <b>Matching qualifications:</b>{" "}
                    {[
                      ...new Set(requirements.flatMap((r) => r.supported)),
                    ].join(", ") || "No supporting mentions established"}
                  </p>
                  <p>
                    <b>Missing or unverified:</b>{" "}
                    {[
                      ...new Set(requirements.flatMap((r) => r.needsReview)),
                    ].join("; ") ||
                      "Check all requirements and experience context manually."}
                  </p>
                  {(["experience", "projects"] as const).map((section) => (
                    <details key={section}>
                      <summary>Relevant {section}</summary>
                      {relevant(section).length ? (
                        relevant(section).map((text, i) => (
                          <pre className="module-pre" key={i}>
                            {text}
                          </pre>
                        ))
                      ) : (
                        <p>
                          No direct supporting text identified. Review your
                          master profile; no experience has been invented.
                        </p>
                      )}
                    </details>
                  ))}
                  <details>
                    <summary>Full requirement comparison</summary>
                    {requirements.map((r, i) => (
                      <article key={i}>
                        <p>
                          <b>{r.kind}:</b> {r.text}
                        </p>
                        <p>
                          Profile mentions: {r.supported.join(", ") || "None"}.
                          Unverified:{" "}
                          {r.needsReview.join(", ") ||
                            "Confirm context and proficiency."}
                        </p>
                      </article>
                    ))}
                  </details>
                </>
              )}
            </section>
            {careerPath(target.title, target.description) !== "other" &&
              cvOptions.track !==
                careerPath(target.title, target.description) && (
                <div className="notice" role="note">
                  <p>
                    The selected CV track differs from this job. Choose the
                    matching career profile and build a new CV, or refresh its
                    summary and skills below.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setCvOptions((current) => ({
                        ...current,
                        track:
                          careerPath(target.title, target.description) ===
                          "cybersecurity"
                            ? "cybersecurity"
                            : "development",
                        selectedRecordIds: undefined,
                      }))
                    }
                  >
                    Use this job’s career track
                  </button>
                </div>
              )}
            <ResumeOptionsEditor
              profile={master}
              options={cvOptions}
              onChange={setCvOptions}
              description={target.description}
              onMaster={(track) => void createMaster(track)}
              onApplyAdditional={content ? applyAdditional : undefined}
            />
            <h3 id="cv-stage-3">3. Build and edit the CV</h3>
            <fieldset className="builder-mode">
              <legend>Writing mode</legend>
              <label>
                <input
                  type="radio"
                  name="writing-mode"
                  checked={useAi}
                  disabled={!!busy}
                  onChange={() => setMode("ai")}
                />
                AI job analysis & writing
              </label>
              <label>
                <input
                  type="radio"
                  name="writing-mode"
                  checked={!useAi}
                  disabled={!!busy}
                  onChange={() => setMode("profile")}
                />
                Basic layout only (no AI)
              </label>
            </fieldset>
            <p className="builder-help">
              {ai
                ? `AI drafts are checked against your saved evidence. Your profile and this description are sent to ${aiLabel || "your selected AI provider"} when enabled.`
                : "AI writing needs an API key. Set up Google Gemini or OpenAI in My Profile → Connections. AI generation stays unavailable until a key is configured. Basic layout only is a separate option and does not analyse the job."}
            </p>
            {!ai && (
              <button type="button" className="secondary" onClick={onProfile}>
                Set up AI writing
              </button>
            )}
            <button
              className="primary"
              disabled={!!busy || !connected || (useAi && !ai)}
            >
              <Sparkles size={16} />
              {busy === "generate"
                ? "Analysing, writing and checking…"
                : useAi
                  ? "Build tailored CV"
                  : "Create basic layout"}
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
            <label>
              CV version category
              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
              >
                <option value="all">All saved CVs</option>
                <option value="development">Development CVs</option>
                <option value="cybersecurity">
                  Cybersecurity internship CVs
                </option>
                <option value="master">Master CVs</option>
                <option value="tailored">Job-specific CVs</option>
              </select>
            </label>
            {history.length ? (
              history
                .filter((item) =>
                  historyFilter === "all" || historyFilter === "master"
                    ? historyFilter === "all" ||
                      item.kind?.startsWith("master-")
                    : historyFilter === "tailored"
                      ? !item.kind || item.kind === "tailored"
                      : (item.options?.track ||
                          (careerPath(item.target.title) === "cybersecurity"
                            ? "cybersecurity"
                            : "development")) === historyFilter,
                )
                .map((item) => (
                  <div key={item.id} className="cv-history-item">
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
                    <div className="module-actions">
                      <button
                        className="secondary"
                        disabled={!!busy || !content}
                        onClick={() =>
                          void work("compare", async () =>
                            setComparison(
                              await request<ResumeDraft>(`/${item.id}`),
                            ),
                          )
                        }
                      >
                        Compare version
                      </button>
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() =>
                          void work("restore-version", async () => {
                            if (dirty) await saved();
                            const old = await request<ResumeDraft>(
                              `/${item.id}`,
                            );
                            const value = await request<ResumeDraft>("", {
                              action: "save",
                              draftId: old.id,
                              content: old.content,
                              coverLetter: old.coverLetter || "",
                              template: old.template || "classic",
                              sectionOrder: old.sectionOrder,
                              options: old.options,
                            });
                            remember(value);
                            setFeedback(
                              "Previous CV restored as a new version. Original and submitted documents remain unchanged.",
                            );
                          })
                        }
                      >
                        Restore as new version
                      </button>
                    </div>
                  </div>
                ))
            ) : (
              <p>Your saved CV versions will appear here.</p>
            )}
            {history.length >= 50 && (
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() =>
                  void work("history", async () => {
                    const page = await request<{ drafts: ResumeListItem[] }>(
                      `?offset=${history.length}`,
                    );
                    setHistory((current) => [
                      ...current,
                      ...page.drafts.filter(
                        (d) => !current.some((old) => old.id === d.id),
                      ),
                    ]);
                    if (!page.drafts.length)
                      setFeedback("No older saved CV versions.");
                  })
                }
              >
                Load older CV versions
              </button>
            )}
          </section>
        </div>
        <div className="builder-workspace" data-mobile-panel={mobilePanel}>
          {draft && content ? (
            <>
              <section
                id="cv-builder-editor"
                tabIndex={-1}
                className="panel builder-editor"
              >
                <div className="builder-editor-heading">
                  <div>
                    <h3>Edit your application documents</h3>
                    <p>
                      {draft.manualEdits ? "Manually edited CV" : draft.method}{" "}
                      · {dirty ? "Unsaved edits" : "Saved version"}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      (setMobilePanel("preview"), document)
                        .getElementById("cv-builder-preview")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Preview {documentKind === "cv" ? "CV" : "cover letter"}
                  </button>
                </div>
                <p aria-live="polite">{autosaveStatus}</p>
                {recovery && (
                  <div className="notice">
                    <span>
                      Unfinished edits were saved at{" "}
                      {new Date(recovery.updatedAt).toLocaleString()}.
                    </span>
                    <button
                      className="secondary"
                      onClick={() => {
                        setContent(recovery.content);
                        setCoverLetter(recovery.coverLetter);
                        setTemplate(recovery.template);
                        setSectionOrder(
                          orderedResumeSections(recovery.sectionOrder),
                        );
                        if (recovery.options) setCvOptions(recovery.options);
                        if (recovery.statementReviews)
                          setStatementReviews(recovery.statementReviews);
                        setRecovery(undefined);
                      }}
                    >
                      Restore unfinished edits
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setRecovery(undefined)}
                    >
                      Keep current version
                    </button>
                  </div>
                )}
                <details>
                  <summary>Compare with master CV</summary>
                  <p>
                    My Profile is your master source. Editing this tailored
                    version does not alter it.
                  </p>
                  {master ? (
                    (
                      ["skills", "experience", "projects", "education"] as const
                    ).map((section) => (
                      <div className="builder-comparison" key={section}>
                        <h4>{section}</h4>
                        <p>Master profile</p>
                        <pre style={{ whiteSpace: "pre-wrap" }}>
                          {master[section] || "Not supplied"}
                        </pre>
                        <p>Tailored version</p>
                        <pre style={{ whiteSpace: "pre-wrap" }}>
                          {content[section] || "Not supplied"}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <p>
                      Master profile could not be loaded. Your saved draft
                      retains its original evidence snapshot.
                    </p>
                  )}
                </details>
                <details>
                  <summary>Required and preferred skills</summary>
                  <p>
                    Text-based requirement checks show mentions in your profile,
                    not proof of proficiency or years of experience.
                  </p>
                  {extractRequirements(
                    draft.target.description,
                    master || draft.profileSnapshot,
                  ).map((r, i) => (
                    <article key={i}>
                      <b>
                        {r.kind === "required"
                          ? "Required / stated requirement"
                          : "Preferred"}
                        : {r.text}
                      </b>
                      <p>
                        Profile mentions:{" "}
                        {r.supported.join(", ") ||
                          "No supporting skill mentions"}
                      </p>
                      <p>
                        Needs review:{" "}
                        {r.needsReview.join(", ") ||
                          "Confirm context, proficiency and experience duration"}
                      </p>
                    </article>
                  ))}
                </details>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() =>
                    work("readability", async () => {
                      const current = await saved();
                      setReadability(
                        await request(
                          `/${encodeURIComponent(current.id)}/readability`,
                        ),
                      );
                    })
                  }
                >
                  Check ATS readability
                </button>
                {readability && (
                  <div aria-label="CV readability results">
                    <p>
                      {readability.selectableText
                        ? "Selectable PDF text extracted"
                        : "PDF text needs review"}{" "}
                      · {readability.wordCount} words · {readability.pageCount}{" "}
                      pages ·{" "}
                      {readability.wordSelectableText
                        ? "Editable Word text extracted"
                        : "Review Word extraction"}
                    </p>
                    {readability.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                    <p>{readability.notice}</p>
                    <details>
                      <summary>Extracted PDF text</summary>
                      <pre style={{ whiteSpace: "pre-wrap" }}>
                        {readability.extractedText}
                      </pre>
                    </details>
                  </div>
                )}
                <p>
                  Keep every qualification accurate. Edits you type are treated
                  as your own information. New versions preserve earlier CVs and
                  submitted applications. Manual edits are not automatically
                  fact-checked.
                </p>
                {draft.layoutVersion !== 2 && (
                  <p className="builder-layout-notice" role="note">
                    This editor has removed the old catch-all section and
                    separated recognised project sections. Save or download to
                    keep the cleaned copy as a new version. Earlier versions are
                    preserved.
                  </p>
                )}
                <div
                  className="builder-document-tabs"
                  role="group"
                  aria-label="Document to edit"
                >
                  <button
                    className={documentKind === "cv" ? "primary" : "secondary"}
                    aria-pressed={documentKind === "cv"}
                    onClick={() => setDocumentKind("cv")}
                  >
                    CV
                  </button>
                  <button
                    className={
                      documentKind === "letter" ? "primary" : "secondary"
                    }
                    aria-pressed={documentKind === "letter"}
                    onClick={() => setDocumentKind("letter")}
                  >
                    Cover letter
                  </button>
                </div>
                <label>
                  Document style
                  <select
                    aria-label="Document style"
                    value={template}
                    disabled={!!busy}
                    onChange={(e) =>
                      setTemplate(e.target.value as ResumeTemplate)
                    }
                  >
                    {Object.entries(resumeTemplates).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div hidden={documentKind !== "cv"}>
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
                  {sectionOrder.map((key, index) => (
                    <div key={key} className="builder-section-edit">
                      <div className="section-order-actions">
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move ${resumeSections[key]} up`}
                          disabled={!!busy || index === 0}
                          onClick={() => moveSection(key, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Move ${resumeSections[key]} down`}
                          disabled={!!busy || index === sectionOrder.length - 1}
                          onClick={() => moveSection(key, 1)}
                        >
                          ↓
                        </button>
                      </div>
                      <details open={!!content[key]?.trim()}>
                        <summary>{resumeSections[key]}</summary>
                        <label>
                          {resumeSections[key]}
                          {key === "projects" && (
                            <span className="builder-field-help">
                              Separate projects with a blank line. Put the
                              project name first, technologies next, then one
                              bullet per achievement.
                            </span>
                          )}
                          <textarea
                            aria-label={resumeSections[key]}
                            rows={key === "summary" || key === "skills" ? 3 : 6}
                            maxLength={20000}
                            value={content[key] || ""}
                            disabled={!!busy}
                            onChange={(e) =>
                              setContent({ ...content, [key]: e.target.value })
                            }
                          />
                        </label>
                        <div className="module-actions">
                          <button
                            className="secondary"
                            disabled={!!busy || !ai}
                            onClick={() => void writePart(key, true)}
                          >
                            Regenerate {resumeSections[key]} only
                          </button>
                          {cvOptions.track === "cybersecurity" &&
                            ["summary", "skills"].includes(key) && (
                              <button
                                type="button"
                                className="secondary"
                                disabled={!!busy}
                                onClick={() => void writePart(key, false)}
                              >
                                Refresh {resumeSections[key]} for internship (no
                                AI)
                              </button>
                            )}
                          {failedAction === `writing-${key}` && (
                            <button
                              className="secondary"
                              disabled={!!busy || !ai}
                              onClick={() => void writePart(key, true, true)}
                            >
                              Retry {resumeSections[key]} only
                            </button>
                          )}
                          <button
                            className="secondary"
                            disabled={!!busy}
                            onClick={() => {
                              setContent({
                                ...content,
                                [key]: draft.evidence
                                  .filter((e) => e.section === key)
                                  .map((e) => e.text)
                                  .join("\n\n"),
                              });
                            }}
                          >
                            Restore original {resumeSections[key]}
                          </button>
                        </div>
                        {isEntrySection(key) && (
                          <ResumeEntryEditor
                            section={key}
                            text={content[key] || ""}
                            draft={draft}
                            onChange={(text) =>
                              setContent({ ...content, [key]: text })
                            }
                            onUpdateMaster={(recordId, proposed) =>
                              setMasterUpdate({ recordId, proposed })
                            }
                          />
                        )}
                      </details>
                    </div>
                  ))}
                </div>
                <section
                  className="optional-letter"
                  aria-label="Optional cover-letter generation"
                >
                  <h4>Optional cover letter</h4>
                  <p>
                    The CV is saved independently. Generate a letter only when
                    you need one.
                  </p>
                  <div className="module-actions">
                    <button
                      className="secondary"
                      disabled={!!busy || !ai}
                      onClick={() => void writePart("coverLetter", true)}
                    >
                      Generate cover letter with AI
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => void writePart("coverLetter", false)}
                    >
                      Create basic cover letter (no AI)
                    </button>
                    {failedAction === "writing-coverLetter" && (
                      <button
                        className="secondary"
                        disabled={!!busy || !ai}
                        onClick={() =>
                          void writePart("coverLetter", true, true)
                        }
                      >
                        Retry cover letter only
                      </button>
                    )}
                  </div>
                </section>
                <ResumeStatementReview
                  draft={draft}
                  content={content}
                  onChange={setContent}
                  reviews={statementReviews}
                  onReview={setStatementReviews}
                />
                {documentKind === "letter" && (
                  <label>
                    Cover letter text
                    <textarea
                      aria-label="Cover letter text"
                      rows={20}
                      maxLength={20000}
                      value={coverLetter}
                      disabled={!!busy}
                      onChange={(e) => setCoverLetter(e.target.value)}
                    />
                  </label>
                )}
                {draft.aiGeneration && (
                  <p className="builder-ai-proof">
                    Written with {draft.aiGeneration.provider} ·{" "}
                    {draft.aiGeneration.model} ·{" "}
                    {draft.manualEdits
                      ? "original draft checked; manual edits have not been rechecked"
                      : "job analysis and factual checks completed"}
                  </p>
                )}
                {draft.analysis && (
                  <details className="builder-evidence">
                    <summary>How this CV addresses the job</summary>
                    {draft.analysis.priorities.map((priority, index) => (
                      <div key={index}>
                        <b>{priority.requirement}</b>
                        <p>
                          {priority.evidence.length
                            ? "Relevant source evidence: " +
                              priority.evidence
                                .map(
                                  (id) =>
                                    draft.evidence[id]?.label ||
                                    draft.evidence[id]?.section ||
                                    "profile",
                                )
                                .join(", ")
                            : "No supporting qualification established. Check this requirement before applying."}
                        </p>
                      </div>
                    ))}
                  </details>
                )}
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
                      <b>
                        {evidence.section in resumeSections
                          ? resumeSections[
                              evidence.section as keyof typeof resumeSections
                            ]
                          : "Original CV evidence"}
                      </b>
                      <br />
                      {evidence.text}
                    </p>
                  ))}
                </details>
              </section>
              <section
                id="cv-builder-preview"
                className="builder-preview"
                aria-label={
                  documentKind === "cv" ? "CV preview" : "Cover letter preview"
                }
              >
                <div className="builder-preview-label">
                  Saved PDF and editable text preview of your{" "}
                  {documentKind === "cv" ? "CV" : "cover letter"}{" "}
                  <button
                    className="builder-profile-link"
                    onClick={() =>
                      (setMobilePanel("editor"), document)
                        .getElementById("cv-builder-editor")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Back to editor
                  </button>
                </div>
                <SavedPdfPreview
                  key={`${draft.id}-${documentKind}-${previewRevision}`}
                  draftId={draft.id}
                  kind={documentKind}
                  dirty={dirty}
                  onRefresh={() => void refreshPdf()}
                />
                <details className="html-resume-preview">
                  <summary>Editable HTML preview (approximate)</summary>
                  <article className={`resume-paper resume-${template}`}>
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
                      {documentKind === "letter" ? "Re: " : "Target role: "}
                      {draft.target.title}
                      {documentKind === "letter" && draft.target.company
                        ? ` · ${draft.target.company}`
                        : ""}
                    </p>
                    {documentKind === "letter" && (
                      <div className="letter-body">{coverLetter}</div>
                    )}
                    {documentKind === "cv" && (
                      <>
                        {sectionOrder.map(
                          (key) =>
                            content[key]?.trim() && (
                              <section key={key}>
                                <h3>{resumeSections[key]}</h3>
                                <ResumeSectionBody
                                  section={key}
                                  text={content[key] || ""}
                                />
                              </section>
                            ),
                        )}
                      </>
                    )}
                  </article>
                </details>
              </section>
              <section className="panel builder-use" id="cv-stage-4">
                <h3>4. Save and use</h3>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => void refreshPdf()}
                >
                  Preview PDF layout
                </button>
                {pdfPreview && (
                  <a
                    className="secondary"
                    href={pdfPreview}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open saved PDF preview ↗
                  </a>
                )}
                <p>
                  {draft.target.title} ·{" "}
                  {draft.target.company || "Company not supplied"} · CV version{" "}
                  {draft.id.slice(0, 8)}
                </p>
                <p>
                  Your master CV and earlier versions stay unchanged. Open the
                  employer page to apply, then confirm submission in your
                  tracker.
                </p>
                <div className="module-actions">
                  <button
                    className="secondary"
                    disabled={!!busy || !dirty}
                    onClick={() => void revert()}
                  >
                    Revert unsaved edits
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy || draft.kind?.startsWith("master-")}
                    onClick={() =>
                      void work("package", async () => {
                        const value = await saved();
                        await request(`/${value.id}/package`, {});
                        await onAttached();
                        setFeedback(
                          "Application package saved to Applications. Submission has not been recorded.",
                        );
                      })
                    }
                  >
                    Save application package
                  </button>
                  {draft.target.url && (
                    <a
                      className="secondary"
                      href={draft.target.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open original application page ↗
                    </a>
                  )}
                  <button className="secondary" onClick={onTrack}>
                    Track application status
                  </button>
                </div>{" "}
                <div className="builder-actions">
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void download(
                        "pdf",
                        documentKind === "cv" ? "letter" : "cv",
                      )
                    }
                  >
                    {documentKind === "cv"
                      ? "Download cover letter PDF"
                      : "Download CV PDF"}
                  </button>
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
                        : documentKind === "cv"
                          ? "Download CV PDF"
                          : "Download cover letter PDF"}
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => void download("docx")}
                  >
                    <Download size={15} />
                    Download editable Word (.docx)
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
            </>
          ) : (
            <div className="panel builder-empty">
              <FileText size={38} />
              <h3>Your next CV starts here.</h3>
              <p>
                Pick a job or paste its description, then create a draft from
                your saved profile. You can edit every section and download a
                formatted PDF or editable Word document.
              </p>
            </div>
          )}
        </div>
      </div>
      {masterUpdate && (
        <MasterExperienceUpdate
          recordId={masterUpdate.recordId}
          proposed={masterUpdate.proposed}
          expected={
            draft?.evidence.find((e) => e.recordId === masterUpdate.recordId)
              ?.identity || []
          }
          onClose={() => setMasterUpdate(undefined)}
          onSaved={(profile) => {
            setMaster(profile);
            onMasterUpdated?.(profile);
          }}
        />
      )}
      {comparison && content && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Compare CV versions"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close CV comparison"
              onClick={() => setComparison(undefined)}
            >
              ×
            </button>
            <h3>CV version comparison</h3>
            {(Object.keys(resumeSections) as ResumeSection[]).map((section) => (
              <div key={section}>
                <h4>{resumeSections[section]}</h4>
                <div className="resume-wording-comparison">
                  <div>
                    <b>Current editor</b>
                    <pre>{content[section]}</pre>
                  </div>
                  <div>
                    <b>Saved version {comparison.id.slice(0, 8)}</b>
                    <pre>{comparison.content[section]}</pre>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
