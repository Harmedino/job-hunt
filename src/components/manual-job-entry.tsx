"use client";
import { useState } from "react";
import type { Profile } from "@/lib/types";
import { type ManualJob, suggestManualJob } from "@/lib/manual-jobs";
import { jobTypes, experienceLevels } from "@/lib/job-intelligence";
import CustomFieldsEditor from "./custom-fields-editor";
import JobKeywordEditor from "./job-keyword-editor";
export default function ManualJobEntry({
  job,
  profile,
  onClose,
  onSaved,
  onBuild,
}: {
  job?: ManualJob;
  profile: Profile;
  onClose: () => void;
  onSaved: (job: ManualJob) => Promise<void>;
  onBuild?: (job: ManualJob) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({
      title: job?.title || "",
      company: job?.company || "",
      url: job?.url || "",
      description: job?.description || "",
      location: job?.location || "",
      salary: job?.salary || "",
      jobType: job?.jobType || "",
      experienceLevel: job?.experienceLevel || "",
      ...Object.fromEntries(
        Object.entries(job?.manualDetails || {}).filter(
          ([, v]) => typeof v === "string",
        ),
      ),
    }),
    [customFields, setCustomFields] = useState(job?.customFields || []),
    [keywords, setKeywords] = useState(job?.keywords || []),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [suggestions, setSuggestions] =
      useState<ReturnType<typeof suggestManualJob>>();
  const field = (name: string, label: string, multi = false) => (
    <label key={name}>
      {label}
      {multi ? (
        <textarea
          rows={name === "description" ? 8 : 3}
          value={values[name] || ""}
          maxLength={name === "description" ? 25000 : 8000}
          onChange={(e) => setValues({ ...values, [name]: e.target.value })}
        />
      ) : (
        <input
          type={name === "deadline" ? "date" : name === "url" ? "url" : "text"}
          value={values[name] || ""}
          required={name === "title"}
          maxLength={name === "url" ? 2000 : 1000}
          onChange={(e) => setValues({ ...values, [name]: e.target.value })}
        />
      )}
    </label>
  );
  async function submit(build: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/manual-jobs", {
        method: job ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          customFields,
          keywords,
          ...(job ? { id: job.id, updatedAt: job.updatedAt } : {}),
        }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error || "Could not save manual job.");
      await onSaved(value);
      onClose();
      if (build) onBuild?.(value);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={job ? "Edit manual job" : "Add Job Manually"}
        className="modal manual-job-entry"
      >
        <button
          className="modal-close icon-button"
          aria-label="Close manual job form"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
        <h2>{job ? "Edit manual job" : "Add Job Manually"}</h2>
        <p>
          Private, user-supplied job information. This does not verify the
          employer, create a publication date or record an application
          submission.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(
              (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                "value",
              ) === "build",
            );
          }}
        >
          <div className="form-grid">
            {field("title", "Job title")}
            {field("company", "Company name (optional)")}
            {field("url", "Original job URL (optional)")}
            {field("location", "Location")}
          </div>
          {field("description", "Job description", true)}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              try {
                setSuggestions(suggestManualJob(values.description || ""));
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Suggest fields from pasted description
          </button>
          {suggestions && (
            <section className="notice">
              <p>
                Review suggested details before applying them. Existing values
                will change only if you choose this action.
              </p>
              <pre>
                {Object.entries(suggestions)
                  .filter(([key]) => !["description", "keywords"].includes(key))
                  .map(([k, v]) => `${k}: ${v || "Not found"}`)
                  .join("\n")}
              </pre>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setValues({
                    ...values,
                    ...Object.fromEntries(
                      Object.entries(suggestions).filter(
                        (entry): entry is [string, string] =>
                          !["keywords", "description"].includes(entry[0]) &&
                          typeof entry[1] === "string" &&
                          !!entry[1],
                      ),
                    ),
                  });
                  setKeywords(suggestions.keywords);
                  setSuggestions(undefined);
                }}
              >
                Use reviewed suggestions
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setSuggestions(undefined)}
              >
                Reject suggestions
              </button>
            </section>
          )}
          <div className="form-grid">
            <label>
              Remote, hybrid or onsite
              <select
                value={values.workArrangement || ""}
                onChange={(e) =>
                  setValues({ ...values, workArrangement: e.target.value })
                }
              >
                {["", "Remote", "Hybrid", "Onsite"].map((v) => (
                  <option key={v} value={v}>
                    {v || "Not specified"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Employment type
              <select
                value={values.jobType || ""}
                onChange={(e) =>
                  setValues({ ...values, jobType: e.target.value })
                }
              >
                {["", ...jobTypes].map((v) => (
                  <option key={v} value={v}>
                    {v || "Not specified"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Experience level
              <select
                value={values.experienceLevel || ""}
                onChange={(e) =>
                  setValues({ ...values, experienceLevel: e.target.value })
                }
              >
                {["", ...experienceLevels].map((v) => (
                  <option key={v} value={v}>
                    {v || "Not specified"}
                  </option>
                ))}
              </select>
            </label>
            {field("salary", "Salary, if known")}
            {field("salaryCurrency", "Salary currency (ISO code, if known)")}
            {field("deadline", "Application deadline (optional)")}
          </div>
          {field("requiredSkills", "Required skills", true)}
          {field("preferredSkills", "Preferred skills", true)}
          {field("technologies", "Technologies", true)}
          {field("responsibilities", "Responsibilities", true)}
          {field(
            "additionalRequirements",
            "Additional employer requirements",
            true,
          )}
          {field("personalNotes", "Personal notes", true)}
          <JobKeywordEditor
            keywords={keywords}
            onChange={setKeywords}
            description={values.description || ""}
            profile={profile}
          />
          <CustomFieldsEditor
            fields={customFields}
            onChange={setCustomFields}
          />
          {message && (
            <p className="notice error" role="alert">
              {message}
            </p>
          )}
          <div className="modal-actions">
            <button className="primary" disabled={busy}>
              Save Job
            </button>
            {onBuild && (
              <button className="secondary" value="build" disabled={busy}>
                Save and build CV
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
