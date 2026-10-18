import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  resumeSections,
  type ResumeContent,
  type ResumeTarget,
  type ResumeTemplate,
} from "./resume-types";
const regularPath = path.join(process.cwd(), "src/assets/fonts/DejaVuSans.ttf");
const boldPath = path.join(
  process.cwd(),
  "src/assets/fonts/DejaVuSans-Bold.ttf",
);
let fontBytes: Promise<[Buffer, Buffer]> | undefined;
export async function resumePdf(
  content: ResumeContent,
  target: ResumeTarget,
  template: ResumeTemplate = "classic",
  coverLetter?: string,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  fontBytes ??= Promise.all([readFile(regularPath), readFile(boldPath)]);
  const [regularData, boldData] = await fontBytes;
  const regular = await pdf.embedFont(regularData, { subset: true });
  const bold = await pdf.embedFont(boldData, { subset: true });
  const alphabet = new Set(regular.getCharacterSet());
  const clean = (text: string) =>
    [...text.replace(/\t/g, " ")]
      .filter((c) => c === "\n" || alphabet.has(c.codePointAt(0)!))
      .join("");
  const compact = template === "compact";
  const accent =
    template === "modern" ? rgb(0.12, 0.37, 0.37) : rgb(0.13, 0.17, 0.2);
  const lineHeight = compact ? 1.35 : 1.5;
  const margin = compact ? 40 : 48,
    pageWidth = 595.28,
    pageHeight = 841.89,
    width = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const need = (height: number) => {
    if (y - height < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };
  function draw(
    text: string,
    size = 10,
    font: PDFFont = regular,
    color = rgb(0.13, 0.17, 0.2),
  ) {
    const lines: string[] = [];
    for (const paragraph of clean(text).split("\n")) {
      let line = "";
      // Break long URLs/words at character boundaries to prevent clipping.
      for (const character of paragraph) {
        if (font.widthOfTextAtSize(line + character, size) > width) {
          const space = line.lastIndexOf(" ");
          if (space > line.length / 2) {
            lines.push(line.slice(0, space));
            line = line.slice(space + 1);
          } else {
            lines.push(line);
            line = "";
          }
        }
        line += character;
      }
      lines.push(line);
    }
    for (const row of lines) {
      need(size * lineHeight);
      page.drawText(row, { x: margin, y: y - size, size, font, color });
      y -= size * lineHeight;
    }
  }
  draw(content.name, compact ? 21 : 25, bold, accent);
  y -= 5;
  draw(
    [content.email, content.phone, content.location]
      .filter(Boolean)
      .join("  |  "),
    9,
  );
  for (const url of [
    content.github,
    content.linkedin,
    content.portfolio,
  ].filter(Boolean))
    draw(url, 8.5);
  y -= 12;
  if (coverLetter !== undefined) {
    draw(
      `Re: ${target.title}${target.company ? " · " + target.company : ""}`,
      11,
      bold,
      accent,
    );
    y -= 18;
    draw(coverLetter, 10.5);
  } else {
    draw(target.title, 11, regular, accent);
    for (const key of Object.keys(
      resumeSections,
    ) as (keyof typeof resumeSections)[]) {
      if (!content[key].trim()) continue;
      need(60);
      y -= compact ? 12 : 17;
      draw(resumeSections[key].toUpperCase(), 10, bold, accent);
      y -= 3;
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: rgb(0.78, 0.82, 0.83),
      });
      y -= 9;
      draw(content[key]);
    }
  }
  pdf.setTitle(`${content.name} — ${target.title}`);
  pdf.setAuthor(content.name);
  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index++)
    pages[index].drawText(`${index + 1} / ${pages.length}`, {
      x: pageWidth - margin - 30,
      y: 25,
      size: 8,
      font: regular,
      color: rgb(0.5, 0.54, 0.56),
    });
  return Buffer.from(await pdf.save());
}
