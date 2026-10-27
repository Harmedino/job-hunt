import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import { resumePdf } from "@/lib/resume-pdf";
import { extractCv } from "@/lib/cv";
import { readabilityReview } from "@/lib/resume-review";
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const draft = await loadResume((await params).id);
    const pdf = await resumePdf(draft.content, draft.target, draft.template, undefined, draft.layoutVersion !== 2, draft.sectionOrder);
    const text = await extractCv(
      new File([new Uint8Array(pdf)], "readability.pdf", {
        type: "application/pdf",
      }),
    );
    return Response.json(
      { ...readabilityReview(draft.content, text), extractedText: text },
      { headers: privateHeaders },
    );
  } catch (e) {
    return resumeError(e);
  }
}
