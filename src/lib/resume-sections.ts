/** Recognised document headings. Unlabelled source text is never an output section. */
export const cvSectionNames = [
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "contributions",
  "training",
  "certifications",
] as const;
export type CvSection = (typeof cvSectionNames)[number];
const headings: Record<string, CvSection | "ignore"> = {
  summary: "summary",
  "professional summary": "summary",
  profile: "summary",
  "professional profile": "summary",
  skills: "skills",
  "technical skills": "skills",
  "core skills": "skills",
  "core competencies": "skills",
  "technical competencies": "skills",
  experience: "experience",
  "work experience": "experience",
  "professional experience": "experience",
  "employment history": "experience",
  education: "education",
  "academic qualifications": "education",
  projects: "projects",
  "personal projects": "projects",
  "selected projects": "projects",
  "key projects": "projects",
  "open source contribution": "contributions",
  "open source contributions": "contributions",
  "open source": "contributions",
  training: "training",
  "training & community": "training",
  "training and community": "training",
  "professional development": "training",
  certifications: "certifications",
  certificates: "certifications",
  "licenses & certifications": "certifications",
  references: "ignore",
  interests: "ignore",
  awards: "ignore",
  "additional qualifications": "ignore",
};
export function cvHeading(line: string) {
  const match = line.match(/^([^:]{2,60}):\s*(.*)$/);
  const key = (match ? match[1] : line)
    .replace(/^#+\s*|\*\*/g, "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const section = Object.hasOwn(headings, key) ? headings[key] : undefined;
  return section ? { section, inline: match?.[2]?.trim() || "" } : undefined;
}
export function splitCvSections(
  text: string,
  initial?: CvSection,
): Partial<Record<CvSection, string>> {
  const result: Partial<Record<CvSection, string>> = {};
  let section: CvSection | "ignore" | undefined = initial;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const heading = cvHeading(line.trim());
    if (heading) {
      section = heading.section;
      if (!heading.inline) continue;
    }
    if (!section || section === "ignore") continue;
    const value = heading ? heading.inline : line.trim();
    result[section] = [result[section], value]
      .filter((v) => v !== undefined)
      .join("\n");
  }
  for (const key of cvSectionNames)
    if (result[key]) result[key] = result[key]!.trim();
  return result;
}
