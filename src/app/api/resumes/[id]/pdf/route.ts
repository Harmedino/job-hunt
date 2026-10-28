import { resumeFilename } from "@/lib/resume-filename";
import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import { resumePdf } from "@/lib/resume-pdf";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const draft = await loadResume((await params).id);
    const filename = resumeFilename(draft.content, draft.target, "cv", "pdf");
    return new Response(
      await resumePdf(
        draft.content,
        draft.target,
        draft.template,
        undefined,
        draft.layoutVersion !== 2,
        draft.sectionOrder,
      ),
      {
        headers: {
          ...privateHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      },
    );
  } catch (error) {
    return resumeError(error);
  }
}
