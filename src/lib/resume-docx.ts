import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import {
  resumeSections,
  type ResumeContent,
  type ResumeTarget,
  type ResumeTemplate,
} from "./resume-types";

/** Native Word paragraphs remain fully editable; no screenshot or PDF is embedded. */
export async function resumeDocx(
  content: ResumeContent,
  target: ResumeTarget,
  template: ResumeTemplate = "classic",
  coverLetter?: string,
) {
  const compact = template === "compact";
  const accent = template === "modern" ? "1F5E5E" : "222D33";
  const paragraph = (text: string, spacing = 100) =>
    new Paragraph({
      spacing: { after: spacing, line: compact ? 260 : 290 },
      children: text
        .split("\n")
        .flatMap((line, index) => [
          new TextRun({ text: line, break: index ? 1 : undefined }),
        ]),
    });
  const children = [
    new Paragraph({
      children: [
        new TextRun({
          text: content.name,
          bold: true,
          size: compact ? 40 : 48,
          color: accent,
        }),
      ],
      spacing: { after: 120 },
    }),
    paragraph(
      [content.email, content.phone, content.location]
        .filter(Boolean)
        .join(" | "),
    ),
    ...[content.github, content.linkedin, content.portfolio]
      .filter(Boolean)
      .map((link) => paragraph(link, 40)),
    new Paragraph({
      children: [
        new TextRun({
          text:
            coverLetter !== undefined
              ? `Re: ${target.title}${target.company ? " · " + target.company : ""}`
              : target.title,
          color: accent,
          size: 24,
        }),
      ],
      spacing: { before: 160, after: 160 },
    }),
  ];
  if (coverLetter !== undefined) {
    children.push(
      ...coverLetter.split(/\n\s*\n/).map((text) => paragraph(text, 180)),
    );
  } else
    for (const key of Object.keys(
      resumeSections,
    ) as (keyof typeof resumeSections)[]) {
      if (!content[key].trim()) continue;
      children.push(
        new Paragraph({
          text: resumeSections[key].toUpperCase(),
          heading: HeadingLevel.HEADING_1,
          keepNext: true,
          spacing: { before: compact ? 180 : 260, after: 100 },
        }),
      );
      children.push(
        ...content[key].split(/\n\s*\n/).map((text) => paragraph(text)),
      );
    }
  const document = new Document({
    creator: content.name,
    title: `${content.name} — ${coverLetter !== undefined ? "Cover letter" : "CV"} — ${target.title}`,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "222D33" } },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Calibri", size: 22, bold: true, color: accent },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 960, right: 960, bottom: 960, left: 960 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
