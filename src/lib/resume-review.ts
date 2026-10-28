import {
  orderedResumeSections,
  resumeSections,
  type ResumeContent,
  type ResumeSection,
} from "./resume-types";
export function readabilityReview(
  content: ResumeContent,
  extracted: string,
  details: {
    wordText?: string;
    pageCount?: number;
    sectionOrder?: ResumeSection[];
  } = {},
) {
  const warnings: string[] = [],
    normalized = (s: string) =>
      s
        .replace(/^#{1,4}\s+/gm, "")
        .replace(/^\*\*(.*?)\*\*$/gm, "$1")
        .replace(/^[ \t]*[•▪◦*–-]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
  const fields = orderedResumeSections(details.sectionOrder).filter((key) =>
    content[key]?.trim(),
  );
  const headings = fields.map((section) => ({
    section,
    present: extracted
      .toUpperCase()
      .includes(resumeSections[section].toUpperCase()),
  }));
  const selectableText = extracted.trim().length > 80;
  if (!selectableText)
    warnings.push("Very little selectable text was extracted.");
  for (const field of [
    "skills",
    "experience",
    "projects",
    "education",
  ] as const)
    if (!content[field]?.trim())
      warnings.push(
        `The ${field} section is empty; include it only when you have genuine evidence.`,
      );
  const contactPresent =
    !!content.name &&
    normalized(extracted).includes(normalized(content.name)) &&
    !!content.email &&
    normalized(extracted).includes(normalized(content.email));
  if (!contactPresent)
    warnings.push("Name or email could not be found in extracted PDF text.");
  for (const heading of headings)
    if (!heading.present)
      warnings.push(
        `The ${heading.section} heading was not found in extracted PDF text.`,
      );
  const positions = fields.map((key) =>
    extracted.toUpperCase().indexOf(resumeSections[key].toUpperCase()),
  );
  const readingOrder = positions.every(
    (value, i) => value >= 0 && (!i || value > positions[i - 1]),
  );
  if (!readingOrder)
    warnings.push("Section reading order needs review in the PDF.");
  const dates = [
    ...new Set(
      (content.experience + "\n" + content.education).match(
        /\b(?:19|20)\d{2}(?:-\d{2})?(?:-\d{2})?\b/g,
      ) || [],
    ),
  ];
  const missingDates = dates.filter((date) => !extracted.includes(date));
  if (missingDates.length)
    warnings.push(
      "Some saved experience or education dates were not extracted.",
    );
  const bullets = (
    Object.values(content)
      .join("\n")
      .match(/^\s*[•▪◦*–-]\s/gm) || []
  ).length;
  if (bullets && !/[•▪◦]/.test(extracted))
    warnings.push("Check that achievement bullets remain readable in the PDF.");
  if (
    Object.values(content).some(
      (v) =>
        typeof v === "string" &&
        v.split("\n").some((line) => line.length > 300),
    )
  )
    warnings.push(
      "Some lines are long; review wrapping and paragraph structure.",
    );
  if (/\t|\|.*\|.*\|/.test(Object.values(content).join("\n")))
    warnings.push("Tabs or table-like text may affect reading order.");
  const wordCount = extracted.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 1000 || (details.pageCount && details.pageCount > 2))
    warnings.push(
      "The CV exceeds a typical one- or two-page presentation; review relevance and the actual page preview.",
    );
  const word = details.wordText;
  const wordSelectableText =
    word === undefined ? undefined : word.trim().length > 80;
  const wordSectionsPresent =
    word === undefined
      ? undefined
      : fields.every((key) =>
          normalized(word).includes(normalized(content[key] || "")),
        );
  if (word !== undefined && (!wordSelectableText || !wordSectionsPresent))
    warnings.push(
      "Some content was not recovered from the editable Word export.",
    );
  if (
    fields.some((key) => {
      const lines = (content[key] || "")
        .split("\n")
        .map(normalized)
        .filter((line) => line.length > 35);
      return new Set(lines).size < lines.length;
    })
  )
    warnings.push(
      "Repeated lines appear in a section; review for duplicate bullets.",
    );
  return {
    selectableText,
    wordCount,
    pageCount: details.pageCount,
    headings,
    contactPresent,
    readingOrder,
    experienceDates: { checked: dates.length, missing: missingDates },
    bullets,
    wordSelectableText,
    wordSectionsPresent,
    layout: "Generated single-column text layout",
    warnings,
    notice:
      "These are readability checks, not an ATS score, hiring probability or guarantee. Inspect the actual PDF preview for clipping, whitespace and page breaks; text extraction cannot prove visual layout quality.",
  };
}
