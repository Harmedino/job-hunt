import { PDFDocument } from "pdf-lib";
import { resumeDocx } from "@/lib/resume-docx";
import mammoth from "mammoth";
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
    const pdf = await resumePdf(
      draft.content,
      draft.target,
      draft.template,
      undefined,
      draft.layoutVersion !== 2,
      draft.sectionOrder,
    );
    const text = await extractCv(
      new File([new Uint8Array(pdf)], "readability.pdf", {
        type: "application/pdf",
      }),
    );
    const pageCount = (await PDFDocument.load(pdf)).getPageCount();
    const word = await resumeDocx(
      draft.content,
      draft.target,
      draft.template,
      undefined,
      draft.layoutVersion !== 2,
      draft.sectionOrder,
    );
    const wordText = (await mammoth.extractRawText({ buffer: word })).value;
    return Response.json(
      {
        ...readabilityReview(draft.content, text, {
          wordText,
          pageCount,
          sectionOrder: draft.sectionOrder,
        }),
        extractedText: text,
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return resumeError(e);
  }
}
