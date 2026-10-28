"use client";
import { useState } from "react";
import type { Application } from "@/lib/types";
import { CV_ACCEPT, cvFileProblem } from "@/lib/cv-limits";
export default function ApplicationOriginalFiles({
  application,
  onSaved,
}: {
  application: Application;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"cv" | "letter">("cv"),
    [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const current = application.originalFileIds?.[kind];
  return (
    <section className="application-original-files">
      <h3>Actual submitted files</h3>
      <p>
        Attach the actual PDF, DOCX or TXT file used outside Launchpad, up to 4
        MB. Original bytes are kept privately. Master-profile changes never
        regenerate or replace these files.
      </p>
      {application.originalFiles?.map((info) => (
        <p key={info.id}>
          <a href={`/api/applications/${application.id}/files/${info.id}`}>
            {info.name}
          </a>{" "}
          · {info.kind === "cv" ? "CV" : "Cover letter"} · {info.createdAt} ·{" "}
          {application.originalFileIds?.[info.kind] === info.id
            ? "current owner-reported original"
            : "retained earlier original"}
          {info.correctionReason
            ? " · Correction: " + info.correctionReason
            : ""}
        </p>
      ))}
      {application.documentSnapshot?.files?.map((info) => (
        <p key={info.id}>
          <a href={`/api/applications/${application.id}/files/${info.id}`}>
            {info.name}
          </a>{" "}
          · rendering of selected version saved when submission was recorded
        </p>
      ))}
      {application.documentSnapshot?.renderingWarning && (
        <p role="note">{application.documentSnapshot.renderingWarning}</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          const problem = cvFileProblem(file);
          if (problem) {
            setMessage(problem.message);
            return;
          }
          setBusy(true);
          const data = new FormData(e.currentTarget);
          data.set("file", file);
          data.set("kind", kind);
          data.set(
            "originalConfirmed",
            data.get("originalConfirmed") === "on" ? "true" : "false",
          );
          data.set(
            "correctionConfirmed",
            data.get("correctionConfirmed") === "on" ? "true" : "false",
          );
          try {
            const r = await fetch(`/api/applications/${application.id}/files`, {
              method: "POST",
              body: data,
            });
            const value = await r.json();
            if (!r.ok)
              throw new Error(
                value.error || "Could not save original document.",
              );
            await onSaved();
            setFile(undefined);
            setMessage(
              value.warning ||
                "Original document saved unchanged. Earlier documents remain available.",
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Submitted document type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "cv" | "letter")}
          >
            <option value="cv">CV</option>
            <option value="letter">Cover letter</option>
          </select>
        </label>
        <label>
          Actual submitted file
          <input
            required
            type="file"
            accept={CV_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        <label className="review-toggle">
          <input type="checkbox" name="originalConfirmed" required />I confirm
          this is the actual document I submitted
        </label>
        {current && (
          <>
            <label>
              Reason for correcting the original document
              <textarea
                required
                name="correctionReason"
                minLength={3}
                maxLength={1000}
                rows={2}
              />
            </label>
            <label className="review-toggle">
              <input type="checkbox" required name="correctionConfirmed" />
              Record a correction and retain the earlier original file
            </label>
          </>
        )}
        <button className="secondary" disabled={!file || busy}>
          Save original submitted file
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
