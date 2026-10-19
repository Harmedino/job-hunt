import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import { resumePdf } from "@/lib/resume-pdf";
import { resumeDocx } from "@/lib/resume-docx";
import { profileCoverLetter, ResumeInputError } from "@/lib/resume-types";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const document = searchParams.get("document");
    if (
      !["pdf", "docx"].includes(format || "") ||
      !["cv", "letter"].includes(document || "")
    )
      throw new ResumeInputError(
        "Choose CV or cover letter and PDF or Word format.",
      );
    const draft = await loadResume((await params).id);
    const letter =
      document === "letter"
        ? (draft.coverLetter ?? profileCoverLetter(draft.content, draft.target))
        : undefined;
    if (letter !== undefined && !letter.trim())
      throw new ResumeInputError(
        "Write your cover letter before downloading it.",
      );
    const filename =
      `${draft.content.name}-${document === "letter" ? "cover-letter" : "cv"}-${draft.target.title}`
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9 -]/g, "")
        .trim()
        .slice(0, 100) || "application";
    const bytes =
      format === "pdf"
        ? await resumePdf(draft.content, draft.target, draft.template, letter, draft.layoutVersion !== 2)
        : await resumeDocx(draft.content, draft.target, draft.template, letter, draft.layoutVersion !== 2);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.${format}"`,
      },
    });
  } catch (error) {
    return resumeError(error);
  }
}
