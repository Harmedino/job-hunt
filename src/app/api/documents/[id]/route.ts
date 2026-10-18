import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { resumePdf } from "@/lib/resume-pdf";
import type { ResumeDraft } from "@/lib/resume-types";
import { db, errorResponse } from "@/lib/db";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const app = await (await db()).collection("applications").findOne({ id });
    if (app?.cvDraftId) {
      const draft = await (await db()).collection<ResumeDraft>("resumes").findOne({ id: app.cvDraftId });
      if (!draft) return Response.json({ error: "Saved CV version not found." }, { status: 404 });
      return new Response(await resumePdf(draft.content, draft.target, draft.template), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="tailored-cv.pdf"', "Cache-Control": "no-store" } });
    }
    if (!app?.profileSnapshot || !app.cvFacts)
      return Response.json(
        { error: "Prepare this application first." },
        { status: 404 },
      );
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage();
    let y = 790;
    const p = app.profileSnapshot;
    const content = [
      p.name,
      [p.email, p.phone, p.location].filter(Boolean).join(" | "),
      [p.github, p.linkedin, p.portfolio].filter(Boolean).join(" | "),
      "",
      ...app.cvFacts,
    ];
    for (const paragraph of content) {
      const words = String(paragraph)
        .replace(/[^\x20-\x7E\n]/g, " ")
        .split(/\s+/);
      let line = "";
      const lines: string[] = [];
      for (const word of words) {
        if (font.widthOfTextAtSize(line + word, 10) > 480) {
          lines.push(line);
          line = "";
        }
        line += word + " ";
      }
      lines.push(line);
      for (const row of lines) {
        if (y < 55) {
          page = pdf.addPage();
          y = 790;
        }
        page.drawText(row, {
          x: 50,
          y,
          size: 10,
          font,
          color: rgb(0.12, 0.15, 0.2),
        });
        y -= 15;
      }
      y -= 10;
    }
    return new Response(Buffer.from(await pdf.save()), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="application-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
