import type { ResumeContent, ResumeTarget } from "./resume-types";
export function resumeFilename(
  content: Pick<ResumeContent, "name">,
  target: Pick<ResumeTarget, "company" | "title">,
  kind: "cv" | "letter",
  format: "pdf" | "docx" | "txt" = "pdf",
) {
  const stem =
    [
      content.name,
      target.company,
      target.title,
      kind === "cv" ? "CV" : "Cover_Letter",
    ]
      .filter(Boolean)
      .join("_")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 180) || "Application";
  return stem + "." + format;
}
