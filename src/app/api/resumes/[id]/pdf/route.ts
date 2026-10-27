import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import { resumePdf } from "@/lib/resume-pdf";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const draft = await loadResume((await params).id);
    const filename =
      `${draft.content.name}-${draft.target.title}`
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9 -]/g, "")
        .trim()
        .slice(0, 100) || "tailored-cv";
    return new Response(
      await resumePdf(draft.content, draft.target, draft.template, undefined, draft.layoutVersion !== 2, draft.sectionOrder),
      {
        headers: {
          ...privateHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        },
      },
    );
  } catch (error) {
    return resumeError(error);
  }
}
