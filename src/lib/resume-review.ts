import type { ResumeContent } from "./resume-types";
export function readabilityReview(content: ResumeContent, extracted: string) {
  const fields = ["skills", "experience", "projects", "education"] as const;
  const warnings: string[] = [];
  if (extracted.trim().length < 80)
    warnings.push("Very little selectable text was extracted.");
  for (const field of fields)
    if (!content[field]?.trim())
      warnings.push(`The ${field} section is empty.`);
  if (
    !extracted.includes(content.name) ||
    !extracted.toLowerCase().includes(content.email.toLowerCase())
  )
    warnings.push(
      "Name or email could not be found in the extracted PDF text.",
    );
  if (
    Object.values(content).some(
      (v) =>
        typeof v === "string" &&
        v.split(/\n/).some((line) => line.length > 300),
    )
  )
    warnings.push(
      "Some lines are long; review wrapping and paragraph structure.",
    );
  if (/\t|\|.*\|.*\|/.test(Object.values(content).join("\n")))
    warnings.push("Tabs or table-like text may affect reading order.");
  for(const field of fields) if(content[field]?.trim() && !new RegExp('\\b'+field+'\\b','i').test(extracted))warnings.push(`The ${field} heading was not found in extracted PDF text.`);
  const wordCount = extracted.trim().split(/\s+/).length;
  if (wordCount > 1000)
    warnings.push(
      "The CV is long; consider emphasizing the most relevant evidence.",
    );
  return {
    selectableText: extracted.trim().length > 80,
    wordCount,
    headings: fields.map((section) => ({
      section,
      present: !!content[section]?.trim() && new RegExp("\\b"+section+"\\b","i").test(extracted),
    })),
    layout: "Generated single-column text layout",
    warnings,
    notice:
      "These are readability checks, not an ATS score, hiring probability or guarantee.",
  };
}
