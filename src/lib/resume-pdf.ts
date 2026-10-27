import {
  resumeEntries,
  isEntrySection,
  type ResumeEntry,
} from "./resume-layout";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  resumeSections,
  orderedResumeSections,
  type ResumeSection,
  legacyResumeSections,
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
  legacy = false,
  sectionOrder?:ResumeSection[],
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
    indent = 0,
    hanging = 0,
  ) {
    const lines: string[] = [];
    for (const paragraph of clean(text).split("\n")) {
      let line = "";
      // Break long URLs/words at character boundaries to prevent clipping.
      for (const character of paragraph) {
        if (
          font.widthOfTextAtSize(line + character, size) >
          width - indent - hanging
        ) {
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
    for (const [rowIndex, row] of lines.entries()) {
      need(size * lineHeight);
      page.drawText(row, {
        x: margin + indent + (rowIndex ? hanging : 0),
        y: y - size,
        size,
        font,
        color,
      });
      y -= size * lineHeight;
    }
  }
  function entryHeight(entry: ResumeEntry) {
    const lines = (text: string, size: number, font: PDFFont) =>
      Math.max(
        1,
        Math.ceil(font.widthOfTextAtSize(clean(text), size) / (width - 18)),
      );
    let height = entry.title
      ? lines(entry.title, 10.5, bold) * 10.5 * lineHeight + 3
      : 0;
    for (const part of entry.parts) {
      if (part.kind === "meta")
        height += lines(part.text, 9, regular) * 9 * lineHeight + 4;
      else {
        height +=
          Math.min(2, lines(part.text, 10, regular)) * 10 * lineHeight + 3;
        break;
      }
    }
    return Math.max(35, height + 5);
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
    const sections = legacy ? legacyResumeSections : resumeSections;
    for (const key of (legacy ? Object.keys(sections) : orderedResumeSections(sectionOrder)) as (keyof ResumeContent)[]) {
      const text = content[key] || "";
      if (!text.trim()) continue;
      const entries =
        !legacy && isEntrySection(key) ? resumeEntries(text) : undefined;
      need(entries?.length ? 44 + entryHeight(entries[0]) : 60);
      y -= compact ? 12 : 17;
      draw(
        sections[key as keyof typeof sections].toUpperCase(),
        10,
        bold,
        accent,
      );
      y -= 3;
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: rgb(0.78, 0.82, 0.83),
      });
      y -= 9;
      if (entries) {
        for (const [index, entry] of entries.entries()) {
          if (index) y -= compact ? 9 : 14;
          need(entryHeight(entry));
          if (entry.title) {
            draw(entry.title, 10.5, bold);
            y -= 3;
          }
          for (const part of entry.parts) {
            if (part.kind === "meta") {
              draw(part.text, 9, regular, rgb(0.33, 0.39, 0.42));
              y -= 4;
            } else {
              draw(
                part.kind === "bullet" ? "• " + part.text : part.text,
                10,
                regular,
                rgb(0.13, 0.17, 0.2),
                part.kind === "bullet" ? 8 : 0,
                part.kind === "bullet" ? 10 : 0,
              );
              y -= 3;
            }
          }
        }
      } else draw(text);
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
