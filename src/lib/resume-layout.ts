import { resumeSections, type ResumeContent } from "./resume-types";
import { splitCvSections } from "./resume-sections";

/** New editor copy only; never mutate an old saved/submitted version. */
export function cleanResumeLayout(content: ResumeContent): ResumeContent {
  const result = { ...content };
  delete result.additional;
  const recovered = splitCvSections(content.additional || "");
  for (const key of Object.keys(
    resumeSections,
  ) as (keyof typeof resumeSections)[]) {
    result[key] = content[key] || "";
  }
  // Old imports can have contributions/training appended inside Projects.
  for (const key of [
    "projects",
    "experience",
    "education",
    "skills",
  ] as const) {
    const sections = splitCvSections(result[key], key);
    result[key] = sections[key] || "";
    for (const extra of [
      "contributions",
      "training",
      "certifications",
    ] as const) {
      if (!result[extra] && sections[extra]) result[extra] = sections[extra];
    }
  }
  for (const extra of ["contributions", "training", "certifications"] as const)
    if (!result[extra] && recovered[extra]) result[extra] = recovered[extra];
  for (const extra of ["contributions", "training", "certifications"] as const)
    if (
      /^(?:none|n\/a|not applicable|not provided|no certifications(?: listed)?)[.!]?$/i.test(
        result[extra]?.trim() || "",
      )
    )
      result[extra] = "";
  return result;
}
export type EntryPart = { kind: "meta" | "paragraph" | "bullet"; text: string };
export type ResumeEntry = { title: string; parts: EntryPart[] };
const bullet = /^\s*(?:[•▪◦*–-]|\d+[.)])\s+/;
const techWord =
  /\b(?:react|angular|next\.?js|javascript|typescript|node\.?js|express\.?js|mongodb|mongoose|html\d?|css\d?|rest|api|paystack|python|django|php|laravel|sql|git|github|vercel|render|tailwind|vue|docker)\b/i;
function technologies(line: string) {
  return (
    techWord.test(line) &&
    !/^(?:built|developed|designed|implemented|contributed|worked|tested|used|created|maintained|using|with|and|including)\b/i.test(
      line,
    ) &&
    !/[.!?]$/.test(line) &&
    (/[·|,/]/.test(line) ||
      /^(?:React|Angular|JavaScript|TypeScript|Python|PHP|SQL)$/i.test(line))
  );
}
function entryMeta(line: string) {
  return (
    /^(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:19|20)\d{2}(?:[-/]\d{2})?(?:[-/]\d{2})?(?:\b|\s)/i.test(
      line,
    ) ||
    technologies(line) ||
    /^\d+\s+(?:editions?|events?|contributions?)$/i.test(line)
  );
}
export function isEntrySection(section: string) {
  return [
    "experience",
    "education",
    "projects",
    "contributions",
    "training",
    "certifications",
  ].includes(section);
}
/** Conservative formatting: preserve words and bullet continuations, never invent titles or technologies. */
export function resumeEntries(text: string): ResumeEntry[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
  const entries: ResumeEntry[] = [];
  let current: ResumeEntry | undefined;
  let separated = true;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    if (!raw) {
      separated = true;
      continue;
    }
    const line = raw.replace(/^#{1,4}\s+/, "").replace(/^\*\*(.*?)\*\*$/, "$1");
    const isBullet = bullet.test(line);
    const next = lines.slice(index + 1).find(Boolean) || "";
    const isMeta = !isBullet && !/^#{1,4}\s|^\*\*/.test(raw) && entryMeta(line);
    const canBeTitle =
      !isBullet &&
      !isMeta &&
      line.length <= 160 &&
      !/[.!?,;:]$/.test(line) &&
      !/^(?:built|developed|designed|implemented|contributed|worked|tested|used|created|maintained)\b/i.test(
        line,
      );
    const title =
      canBeTitle &&
      (entryMeta(next) ||
        /^#{1,4}\s|^\*\*/.test(raw) ||
        (bullet.test(next) &&
          (!current ||
            separated ||
            /[.!?]$/.test(current.parts.at(-1)?.text || ""))));
    if (title) {
      current = { title: line, parts: [] };
      entries.push(current);
    } else {
      if (!current) {
        current = { title: "", parts: [] };
        entries.push(current);
      }
      const previous = current.parts.at(-1);
      if (isBullet)
        current.parts.push({ kind: "bullet", text: line.replace(bullet, "") });
      else if (isMeta) current.parts.push({ kind: "meta", text: line });
      else if (previous && previous.kind !== "meta" && !separated)
        previous.text += " " + line;
      else current.parts.push({ kind: "paragraph", text: line });
    }
    separated = false;
  }
  return entries;
}
