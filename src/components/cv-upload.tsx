"use client";
import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import Link from "next/link";
import { CV_ACCEPT, cvFileProblem } from "@/lib/cv-limits";
export default function CvUpload({
  disabled,
  onImport,
  onBusyChange,
}: {
  disabled: boolean;
  onImport: (text: string, persisted: boolean, warning?: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [kind, setKind] = useState<"success" | "warning" | "error">("success");
  const [fileName, setFileName] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  async function upload(file: File) {
    setFeedback("");
    setNeedsLogin(false);
    setFileName(file.name);
    const problem = cvFileProblem(file);
    if (problem) {
      setKind("error");
      setFeedback(problem.message);
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/cv", { method: "POST", body: form });
      if (response.status === 401) {
        setNeedsLogin(true);
        throw new Error(
          "Your sign-in session expired. Sign in again, then retry your CV upload.",
        );
      }
      if (response.status === 413)
        throw new Error(
          "Your CV must be 4 MB or smaller. Export a smaller file and try again.",
        );
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.error ||
            "Upload failed. Please try a PDF, DOCX, or TXT file.",
        );
      if (typeof result?.text !== "string")
        throw new Error(
          "The upload did not return readable CV text. Please try again.",
        );
      const persisted = result.persisted === true;
      setKind(persisted ? "success" : "warning");
      setFeedback(
        persisted
          ? "CV imported and saved. Review the extracted text in your profile."
          : result.warning ||
              "CV imported into this form, but not saved. Connect storage and save your profile before leaving this page.",
      );
      onImport(result.text, persisted, result.warning);
    } catch (error) {
      setKind("error");
      setFeedback(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="panel cv-upload" aria-label="CV upload">
      <h3>
        <Upload size={18} />
        Start with your CV
      </h3>
      <p id="cv-upload-help">
        Choose a text-based PDF, Word DOCX, or TXT file, up to 4 MB. You can
        read your CV into the form before connecting storage.
      </p>
      <div className="upload-box">
        <Upload size={25} />
        <button
          type="button"
          className="primary"
          disabled={busy || disabled}
          onClick={() => input.current?.click()}
        >
          {busy ? "Reading your CV…" : "Choose CV"}
        </button>
        <span>PDF, DOCX, or TXT · 4 MB maximum</span>
        <input
          ref={input}
          type="file"
          accept={CV_ACCEPT}
          aria-label="Upload your CV"
          aria-describedby="cv-upload-help"
          className="sr-only"
          disabled={busy || disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {fileName && (
        <p className="cv-file-name">
          {kind === "success" && feedback && <Check size={13} />} {fileName}
        </p>
      )}
      {feedback && (
        <div
          className={`cv-feedback ${kind}`}
          role={kind === "success" ? "status" : "alert"}
        >
          {feedback}
          {needsLogin && (
            <Link href="/login" className="secondary">
              Sign in
            </Link>
          )}
        </div>
      )}
      <p className="cv-upload-note">
        Scanned images need OCR first. Only extracted text is saved; your
        original file is not retained.
      </p>
    </section>
  );
}
