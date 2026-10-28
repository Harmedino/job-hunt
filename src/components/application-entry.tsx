"use client";
import { useEffect, useState } from "react";
import type { Application, Job } from "@/lib/types";
import type { ResumeListItem } from "@/lib/resume-types";
import { statuses } from "@/lib/types";
import {
  applicationStatusLabel,
  calendarToday,
} from "@/lib/application-updates";
export async function applicationRequest(
  body: unknown,
  method = "POST",
): Promise<Application> {
  const response = await fetch("/api/applications", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Could not save application.");
  return data;
}
function SubmittedDocuments({ application }: { application?: Application }) {
  const [drafts, setDrafts] = useState<ResumeListItem[]>([]),
    [warning, setWarning] = useState(""),
    [letter, setLetter] = useState("unknown");
  useEffect(() => {
    let active = true;
    void fetch("/api/resumes")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (active) setDrafts(d.drafts || []);
      })
      .catch(() => {
        if (active)
          setWarning(
            "Saved CV versions could not be loaded. You can still record the application without documents.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <fieldset className="application-document-fields">
      <legend>Documents actually used (optional)</legend>
      <p>
        Choose only documents you actually submitted. Leaving them unavailable
        never substitutes a newly generated CV.
      </p>
      {warning && <p role="status">{warning}</p>}
      <label>
        CV version used
        <select name="cvDraftId" defaultValue="">
          <option value="">Not recorded / document unavailable</option>
          {application?.cvDraftId &&
            !drafts.some((d) => d.id === application.cvDraftId) && (
              <option value={application.cvDraftId}>
                Prepared version {application.cvDraftId}
              </option>
            )}
          {drafts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.target.company} · {d.target.title} · {d.createdAt.slice(0, 10)}{" "}
              · {d.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Original CV name or reference
        <input
          name="cvLabel"
          maxLength={500}
          placeholder="Optional filename or personal reference"
        />
      </label>
      <label>
        Was a cover letter used?
        <select
          name="coverLetterUsed"
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
        >
          <option value="unknown">Not recorded</option>
          <option value="no">No cover letter used</option>
          <option value="yes">Yes</option>
        </select>
      </label>
      {letter === "yes" && (
        <label>
          Cover letter actually submitted
          <textarea
            name="coverLetter"
            rows={5}
            maxLength={14000}
            defaultValue={application?.coverLetter || ""}
            placeholder="Paste the actual letter, or leave blank if unavailable"
          />
        </label>
      )}
      <p>
        Actual submitted files can also be attached to the saved application
        record.
      </p>
    </fieldset>
  );
}
export default function ApplicationEntry({
  job,
  application,
  manual = false,
  onClose,
  onSaved,
}: {
  job?: Job;
  application?: Application;
  manual?: boolean;
  onClose: () => void;
  onSaved: (app?: Application) => Promise<void>;
}) {
  const [status, setStatus] = useState("Submitted"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const needsSubmission =
    !manual || ["Submitted", "Interview", "Offer", "Rejected"].includes(status);
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={manual ? "Add application manually" : "Mark as Applied"}
        className="modal application-entry"
      >
        <button
          type="button"
          className="modal-close icon-button"
          aria-label="Close application form"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
        <h2>{manual ? "Add Application Manually" : "Mark as Applied"}</h2>
        {manual ? (
          <p>
            This is your application history, not a verified employer vacancy.
            An original link and documents are optional.
          </p>
        ) : (
          <p>
            {job?.title || application?.job.title} ·{" "}
            {job?.company || application?.job.company}. Record a submission you
            actually completed on the employer website.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const values = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const payload = {
                ...values,
                submissionConfirmed: values.submissionConfirmed === "on",
                ...(manual
                  ? { manual: true, status }
                  : application
                    ? { id: application.id, status: "Submitted" }
                    : { jobId: job!.id, markApplied: true }),
              };
              const app = await applicationRequest(
                payload,
                application && !manual ? "PATCH" : "POST",
              );
              await onSaved(app?.id ? app : undefined);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {manual && (
            <>
              <div className="form-grid">
                <label>
                  Company name
                  <input name="company" maxLength={500} required />
                </label>
                <label>
                  Job title
                  <input name="title" maxLength={500} required />
                </label>
                <label>
                  Job posting URL (optional)
                  <input
                    name="url"
                    type="url"
                    placeholder="https://"
                    maxLength={2000}
                  />
                </label>
                <label>
                  Location
                  <input name="location" maxLength={1000} />
                </label>
                <label>
                  Salary, if known
                  <input name="salary" maxLength={1000} />
                </label>
                <label>
                  Application status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {applicationStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Personal notes
                <textarea name="notes" rows={3} maxLength={8000} />
              </label>
            </>
          )}
          <label>
            Actual date applied
            <input
              type="date"
              name="applicationDate"
              required={needsSubmission}
              max={calendarToday()}
              defaultValue={application?.applicationDate || ""}
            />
          </label>
          {needsSubmission && (
            <>
              <SubmittedDocuments application={application} />
              <label className="review-toggle">
                <input type="checkbox" name="submissionConfirmed" required />I
                actually submitted this application
              </label>
            </>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="primary" disabled={busy}>
              {busy
                ? "Saving…"
                : manual
                  ? "Save application"
                  : "Confirm submitted application"}
            </button>
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
