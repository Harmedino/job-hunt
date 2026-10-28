import { resumeEntries } from "./resume-layout";
import { splitCvSections } from "./resume-sections";
import {
  emptyCareerRecord,
  type CareerRecord,
  type RecordSection,
} from "./career-records";
export type CareerImportProposal = {
  section: RecordSection;
  record: CareerRecord;
  source: string;
  warnings: string[];
};
/** Only explicit names/headings and literal date ranges become record proposals; all proposals still require owner review. */
export function careerImportProposals(text: string): CareerImportProposal[] {
  const sections = splitCvSections(text),
    result: CareerImportProposal[] = [];
  for (const section of [
    "experience",
    "projects",
    "education",
    "contributions",
    "training",
    "certifications",
  ] as const) {
    const raw = sections[section];
    if (!raw) continue;
    for (const [i, entry] of resumeEntries(raw).entries()) {
      if (!entry.title) continue;
      const record = emptyCareerRecord(`import-${section}-${i}`),
        kind = section === "experience" ? "employment" : section;
      record.name = entry.title;
      const source = [
        entry.title,
        ...entry.parts.map((p) =>
          p.kind === "bullet" ? "• " + p.text : p.text,
        ),
      ].join("\n");
      if (kind === "employment") {
        const names = entry.title.split(/\s+[—–|]\s+/);
        if (names.length !== 2) continue;
        const role =
          /\b(?:developer|engineer|analyst|designer|intern|assistant|consultant|manager|officer|specialist)\b/i;
        if (role.test(names[1]) && !role.test(names[0]))
          [record.organization, record.title] = names;
        else if (role.test(names[0]) && !role.test(names[1]))
          [record.title, record.organization] = names;
        else continue;
        record.name = "";
      } else if (kind === "education") {
        const names = entry.title.split(/\s+[—–|]\s+/);
        if (
          names.length !== 2 ||
          !/(?:BSc|B\.?S\.?|B\.?A\.?|MSc|M\.?S\.?|BEng|Bachelor|Master|Diploma|PhD|Doctor)/i.test(
            names[0],
          )
        )
          continue;
        [record.degree, record.organization] = names;
        record.name = "";
      }
      const meta = entry.parts
        .filter((p) => p.kind !== "bullet")
        .map((p) => p.text);
      const dates = meta
        .map((line) =>
          line.match(
            /(?:^|\s)((?:19|20)\d{2}(?:-\d{2})?(?:-\d{2})?)\s*[–—-]\s*(Present|Current|(?:19|20)\d{2}(?:-\d{2})?(?:-\d{2})?)(?:$|\s|[·|])/i,
          ),
        )
        .find(Boolean);
      if (dates) {
        record.start = dates[1];
        record.present = /Present|Current/i.test(dates[2]);
        record.end = record.present ? "" : dates[2];
      }
      record.technologies =
        meta
          .find((line) => /^Technologies\s*:/i.test(line))
          ?.replace(/^Technologies\s*:\s*/i, "") || "";
      record.github =
        source.match(/https?:\/\/(?:www\.)?github\.com\/[^\s]+/i)?.[0] || "";
      record.url = source.match(/https?:\/\/(?!github\.com)[^\s]+/i)?.[0] || "";
      record.responsibilities = entry.parts
        .filter((p) => p.kind === "bullet")
        .map((p) => p.text)
        .join("\n");
      record.description = meta
        .filter(
          (line) =>
            !dates?.[0].includes(line) &&
            !/^Technologies\s*:/i.test(line) &&
            !/^https?:\/\//.test(line),
        )
        .join("\n");
      const warnings = [
        "Review the original heading, employer/project context, dates and bullet classification.",
      ];
      if (!dates && meta.some((line) => /\b(?:19|20)\d{2}\b/.test(line)))
        warnings.push(
          "Dates were not parsed confidently; original date text remains in the source and description for manual review.",
        );
      if (/\bNYSC\b/i.test(entry.title)) continue;
      result.push({ section: kind, record, source, warnings });
    }
  }
  return result.slice(0, 30);
}
