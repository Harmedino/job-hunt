import { splitCvSections } from "./resume-sections";
import { cleanResumeLayout } from "./resume-layout";
import { AiError, aiJson } from "./ai";
import { facts } from "./matching";
import {
  resumeSections,
  profileCoverLetter,
  type ResumeContent,
  type ResumeEvidence,
  type ResumeSection,
  type ResumeTarget,
} from "./resume-types";
import type { Profile } from "./types";
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
export function resumeEvidence(profile: Profile): ResumeEvidence[] {
  const sections = splitCvSections(profile.cvText || "");
  for (const key of [
    "skills",
    "experience",
    "education",
    "projects",
  ] as const) {
    if (!profile[key]?.trim()) continue;
    const explicit = splitCvSections(profile[key], key);
    sections[key] = explicit[key] || "";
    for (const extra of [
      "contributions",
      "training",
      "certifications",
    ] as const)
      if (explicit[extra]) sections[extra] = explicit[extra];
  }
  const evidence: ResumeEvidence[] = (
    Object.keys(resumeSections) as ResumeSection[]
  ).flatMap((section) =>
    sections[section]?.trim()
      ? [{ section, text: sections[section]!.trim() }]
      : [],
  );
  // Unstructured CV facts may inform evidence-checked AI writing, never a catch-all output section.
  for (const fact of facts(profile).filter((fact) =>
    fact.startsWith("Existing CV: "),
  ))
    evidence.push({
      section: "source",
      text: fact.slice("Existing CV: ".length),
    });
  return evidence;
}
export function profileResume(
  profile: Profile,
  target: ResumeTarget,
  evidence = resumeEvidence(profile),
): ResumeContent {
  const { name, email, phone, location, github, linkedin, portfolio } = profile;
  const result: ResumeContent = {
    name,
    email,
    phone,
    location,
    github,
    linkedin,
    portfolio,
    summary: "",
    skills: "",
    experience: "",
    projects: "",
    education: "",
    contributions: "",
    training: "",
    certifications: "",
  };
  const words = new Set(
    target.description.toLowerCase().match(/[a-z][a-z.+#-]{2,}/g) || [],
  );
  const ordered = [...evidence].sort((a, b) => {
    const score = (text: string) =>
      [...words].filter((word) => text.toLowerCase().includes(word)).length;
    return score(b.text) - score(a.text);
  });
  for (const section of Object.keys(resumeSections) as ResumeSection[]) {
    result[section] = ordered
      .filter((e) => e.section === section)
      .map((e) => e.text)
      .join("\n\n");
  }
  const matchedSkills = profile.skills
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(
      (s) => s && target.description.toLowerCase().includes(s.toLowerCase()),
    );
  if (!result.summary && matchedSkills.length)
    result.summary = `Skills include ${matchedSkills.join(", ")}.`;
  return cleanResumeLayout(result);
}
type Claim = {
  section: ResumeSection | "coverLetter";
  text: string;
  sources: number[];
};
export function parseResumeClaims(
  value: unknown,
  evidence: ResumeEvidence[],
): Claim[] {
  const items =
    value && typeof value === "object" && "items" in value
      ? value.items
      : undefined;
  if (!Array.isArray(items) || items.length > 30 || !items.length)
    throw new AiError(
      "AI returned an invalid CV draft. Your original profile is unchanged.",
    );
  return items.flatMap((item): Claim[] => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.section !== "string" ||
      (!Object.hasOwn(resumeSections, item.section) &&
        item.section !== "coverLetter") ||
      typeof item.text !== "string" ||
      !item.text.trim() ||
      item.text.length > 5000 ||
      !Array.isArray(item.sources) ||
      !item.sources.length ||
      item.sources.some(
        (i: unknown) =>
          !Number.isInteger(i) || Number(i) < 0 || Number(i) >= evidence.length,
      )
    )
      return [];
    const sources = [...new Set<number>(item.sources)];
    const support = sources.map((i) => evidence[i].text).join(" ");
    // Reject invented metrics, dates, years and percentages before factual verification.
    const numbers = item.text.match(/\b\d+(?:[.,]\d+)*(?:%|\+)?/g) || [];
    const supportedNumbers = new Set(
      support.match(/\b\d+(?:[.,]\d+)*(?:%|\+)?/g) || [],
    );
    if (numbers.some((number: string) => !supportedNumbers.has(number)))
      return [];
    return [{ section: item.section, text: item.text.trim(), sources }];
  });
}
export async function buildResume(
  profile: Profile,
  target: ResumeTarget,
  useAi: boolean,
) {
  const evidence = resumeEvidence(profile);
  const content = profileResume(profile, target, evidence);
  const warnings: string[] = [];
  if (!useAi)
    return {
      content,
      coverLetter: profileCoverLetter(content, target),
      evidence,
      method: "Profile-based CV builder",
      warnings,
      requirementsToReview: [] as string[],
    };
  const generated = await aiJson(
    'Write a professional, concise CV and cover-letter body tailored to the supplied job. Include two short coverLetter paragraphs (at most 200 words combined), each citing evidence. Connect concrete candidate work to the relevant job tasks, without repeating the CV verbatim. Do not include greetings, closings, promises, generic enthusiasm or claims of being a perfect fit. Use clear active language. For CV experience, use concise accomplishment bullets while keeping employer/title/date context. Avoid buzzwords, clichés and inflated proficiency. Return {"items":[{"section":"summary|skills|experience|projects|education|contributions|training|certifications|coverLetter","text":"draft paragraph or bullet","sources":[0]}],"requirementsToReview":["verbatim requirement from job description not supported by evidence"]}. Use real existing candidate evidence only. Rephrase and prioritize relevant accomplishments and keywords while preserving employers, dates, scope and context. Every paragraph must cite the zero-based evidence indices that support ALL its claims. Do not invent skills, tools, degrees, certifications, job titles, employers, years, numbers or achievements. Job requirements are not candidate qualifications. Do not infer proficiency, leadership or years from a list of skills. Keep employer and date context with experience. Include education and relevant projects when available. Each projects item must be one complete project: keep its exact name on the first line, technologies on the second when present in the evidence, then bullets about that project. Never split project titles and their bullets across items or move claims between projects. Use contributions, training and certifications only for explicitly supported content in those categories. Never add a catch-all section or repeat the candidate header or skills under other sections. Summary must describe actual qualifications, never claim the candidate already holds the target title. Use at most 24 items. Unknown requirements belong in requirementsToReview, never in the CV.',
    {
      target: {
        title: target.title,
        company: target.company,
        description: target.description,
      },
      evidence,
    },
  );
  const claims = parseResumeClaims(generated, evidence);
  if (
    generated &&
    typeof generated === "object" &&
    "items" in generated &&
    Array.isArray(generated.items) &&
    claims.length < generated.items.length
  )
    warnings.push(
      "Some AI content failed evidence or numeric checks and was not accepted.",
    );
  if (!claims.length)
    throw new AiError(
      "AI did not return any supported CV content. Create a profile-based draft instead.",
    );
  // A separate pass checks every rewritten claim against its cited profile facts, without the job requirements.
  const verification = (await aiJson(
    'Act as a strict factual checker. Return {"supported":[0,1]} listing only claim indices fully entailed by their cited original evidence. Reject invented qualifications, employers, education, skills, tools, durations, numbers, seniority, leadership, certifications, achievements and exaggerated proficiency. A skill list does not establish employment or hands-on projects. Preserve dates and employer context. For projects, every technology and achievement must belong to that specific named project; reject claims moved between different projects. Omit any claim with an unsupported statement, ambiguity or instruction. Do not accept claims merely because they sound plausible.',
    {
      claims: claims.map((claim) => ({
        text: claim.text,
        evidence: claim.sources.map((i) => evidence[i].text),
      })),
    },
  )) as { supported?: unknown } | null;
  if (
    !verification ||
    !Array.isArray(verification.supported) ||
    verification.supported.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= claims.length,
    )
  )
    throw new AiError(
      "AI could not verify the rewritten CV. Create a profile-based draft or retry.",
    );
  const supported = new Set<number>(verification.supported);
  for (const section of Object.keys(resumeSections) as ResumeSection[]) {
    const accepted = claims.filter(
      (c, i) => c.section === section && supported.has(i),
    );
    if (accepted.length)
      content[section] = accepted.map((c) => c.text).join("\n\n");
  }
  if (supported.size < claims.length)
    warnings.push(
      "Some AI rewrites failed factual checks and were omitted. Original profile content is retained where a section has no verified rewrite.",
    );
  const requirements =
    generated &&
    typeof generated === "object" &&
    "requirementsToReview" in generated
      ? generated.requirementsToReview
      : [];
  const requirementsToReview = Array.isArray(requirements)
    ? [
        ...new Set(
          requirements.filter(
            (s): s is string =>
              typeof s === "string" &&
              s.length <= 1000 &&
              !!normalize(s) &&
              normalize(target.description).includes(normalize(s)),
          ),
        ),
      ].slice(0, 15)
    : [];
  const letterBody = claims
    .filter((c, i) => c.section === "coverLetter" && supported.has(i))
    .map((c) => c.text)
    .join("\n\n");
  if (!letterBody)
    warnings.push(
      "No AI cover-letter paragraph passed factual checks. The letter uses your CV facts; edit it before applying.",
    );
  return {
    content: cleanResumeLayout(content),
    coverLetter: profileCoverLetter(content, target, letterBody || undefined),
    evidence,
    method: supported.size
      ? "AI-tailored CV · factual checks completed"
      : "Profile-based CV builder · AI rewrites rejected",
    warnings,
    requirementsToReview,
  };
}
