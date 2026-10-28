import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import { resumePdf } from "@/lib/resume-pdf";
import { ResumeInputError } from "@/lib/resume-types";
import { PDFDocument } from "pdf-lib";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const draft = await loadResume((await params).id),
      query = new URL(request.url).searchParams,
      page = Number(query.get("page") || 1),
      kind = query.get("document") || "cv";
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100 ||
      !["cv", "letter"].includes(kind)
    )
      throw new ResumeInputError("Choose a valid document page.");
    if (kind === "letter" && !draft.coverLetter?.trim())
      throw new ResumeInputError(
        "The cover letter is optional. Write or generate it separately before previewing.",
      );
    const pdf = await resumePdf(
        draft.content,
        draft.target,
        draft.template,
        kind === "letter" ? draft.coverLetter : undefined,
        draft.layoutVersion !== 2,
        draft.sectionOrder,
      ),
      document = await PDFDocument.load(pdf),
      pageCount = document.getPageCount();
    if (page > pageCount)
      throw new ResumeInputError("This page does not exist.", 404);
    if (query.get("meta") === "1")
      return Response.json(
        {
          pageCount,
          width: document.getPage(0).getWidth(),
          height: document.getPage(0).getHeight(),
          draftId: draft.id,
          document: kind,
        },
        { headers: privateHeaders },
      );
    const { getPath } = await import("pdf-parse/worker"),
      { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(getPath());
    const parser = new PDFParse({
      data: new Uint8Array(pdf),
      isEvalSupported: false,
    });
    try {
      const screenshot = await parser.getScreenshot({
        partial: [page],
        desiredWidth: 1000,
        imageBuffer: true,
        imageDataUrl: false,
      });
      if (!screenshot.pages[0]?.data)
        throw new ResumeInputError(
          "The saved PDF could not be rendered; downloads remain available.",
          503,
        );
      return new Response(new Uint8Array(screenshot.pages[0].data), {
        headers: {
          ...privateHeaders,
          "Content-Type": "image/png",
          "X-Page-Count": String(pageCount),
          "X-Content-Type-Options": "nosniff",
        },
      });
    } finally {
      await parser.destroy();
    }
  } catch (e) {
    return resumeError(e);
  }
}
