import { fileResponse } from "@/lib/application-files";
import { db, errorResponse } from "@/lib/db";
import type { Application } from "@/lib/types";
import { applicationWasApplied } from "@/lib/vacancy-groups";
import {
  applicationHeaders,
  applicationError,
  ApplicationInputError,
} from "@/lib/application-store";
import { resumePdf } from "@/lib/resume-pdf";
import { resumeDocx } from "@/lib/resume-docx";
import type { ResumeDraft } from "@/lib/resume-types";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      query = new URL(request.url).searchParams,
      kind = query.get("document") || "cv",
      format = query.get("format") || "pdf";
    if (
      !["cv", "letter"].includes(kind) ||
      !["pdf", "docx", "txt"].includes(format)
    )
      throw new ApplicationInputError(
        "Choose a saved CV or letter and PDF, Word or text.",
      );
    const database = await db(),
      app = await database
        .collection<Application>("applications")
        .findOne({ id });
    if (!app) throw new ApplicationInputError("Application not found.", 404);
    const originalId = app.originalFileIds?.[kind === "cv" ? "cv" : "letter"];
    if (originalId) {
      const original = app.originalFiles?.find(
        (file) => file.id === originalId,
      );
      const originalFormat = original?.name.split(".").at(-1)?.toLowerCase();
      if (originalFormat !== format)
        throw new ApplicationInputError(
          "An actual original file is recorded. Download it unchanged from the application details; no generated replacement was substituted.",
          409,
        );
      return fileResponse(app.id, originalId);
    }
    const frozen = app.documentSnapshot?.files?.find(
      (file) =>
        file.kind === kind && file.name.toLowerCase().endsWith("." + format),
    );
    if (frozen) return fileResponse(app.id, frozen.id);
    const submitted = applicationWasApplied(app),
      snapshot = app.documentSnapshot;
    const cv = snapshot
      ? snapshot.cv
      : app.cvDraftId
        ? await database
            .collection<ResumeDraft>("resumes")
            .findOne({ id: app.cvDraftId }, { projection: { _id: 0 } })
        : null;
    const letter = snapshot ? snapshot.coverLetter : app.coverLetter;
    if (kind === "cv" && !cv)
      throw new ApplicationInputError(
        "The original CV document is unavailable. No newer CV was substituted.",
        404,
      );
    if (kind === "letter" && (!letter || snapshot?.coverLetterUsed === "no"))
      throw new ApplicationInputError(
        "No original cover-letter text is available.",
        404,
      );
    const fileName = [
      cv?.content.name || "Candidate",
      app.job.company,
      app.job.title,
      kind === "cv" ? "CV" : "Cover_Letter",
    ]
      .join("_")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 160);
    if (kind === "letter" && (format === "txt" || !cv))
      return new Response(letter, {
        headers: {
          ...applicationHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName}.txt"`,
        },
      });
    if (!cv)
      throw new ApplicationInputError(
        submitted
          ? "The submitted CV is unavailable."
          : "No saved CV version is linked.",
        404,
      );
    const bytes =
      format === "docx"
        ? await resumeDocx(
            cv.content,
            cv.target,
            cv.template,
            kind === "letter" ? letter : undefined,
            cv.layoutVersion !== 2,
            cv.sectionOrder,
          )
        : await resumePdf(
            cv.content,
            cv.target,
            cv.template,
            kind === "letter" ? letter : undefined,
            cv.layoutVersion !== 2,
            cv.sectionOrder,
          );
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...applicationHeaders,
        "Content-Type":
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}.${format === "docx" ? "docx" : "pdf"}"`,
      },
    });
  } catch (e) {
    return applicationError(e) || errorResponse(e);
  }
}
