import type { Profile } from "./types";
export const resumeSections = {
  summary: "Professional summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  contributions: "Open-source contributions",
  training: "Training & community",
  certifications: "Certifications",
  additionalInfo: "Additional Information",
} as const;
export const legacyResumeSections = {
  summary: "Professional summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  additional: "Additional qualifications",
} as const;
export type ResumeSection = keyof typeof resumeSections;
export const resumeContactFields = [
  "name",
  "email",
  "phone",
  "location",
  "github",
  "linkedin",
  "portfolio",
] as const;
export type ResumeContent = Pick<
  Profile,
  (typeof resumeContactFields)[number]
> &
  Record<
    "summary" | "skills" | "experience" | "projects" | "education",
    string
  > &
  Partial<
    Record<
      | "contributions"
      | "training"
      | "certifications"
      | "additional"
      | "additionalInfo",
      string
    >
  >;
export type ResumeTarget = {
  keywords?: import("./job-keywords").JobKeyword[];
  customFields?: import("./custom-fields").CustomField[];
  title: string;
  company: string;
  description: string;
  url: string;
  jobId?: string;
  applicationId?: string;
};
export type ResumeEvidence = {
  section: ResumeSection | "source" | "additional";
  text: string;
  label?: string;
  recordId?: string;
  identity?: string[];
};
export type ResumeAnalysis = {
  priorities: { requirement: string; evidence: number[] }[];
  selectedEvidence: number[];
};
export const resumeTemplates = {
  classic: "Clean professional",
  modern: "Modern accent",
  compact: "Compact minimal",
} as const;
export type ResumeTemplate = keyof typeof resumeTemplates;
export function orderedResumeSections(
  value?: readonly ResumeSection[],
): ResumeSection[] {
  return [
    ...new Set([
      ...(value || []),
      ...(Object.keys(resumeSections) as ResumeSection[]),
    ]),
  ].filter((key) => key in resumeSections);
}
export function validateSectionOrder(value: unknown): ResumeSection[] {
  if (value === undefined) return orderedResumeSections();
  if (
    !Array.isArray(value) ||
    value.length > Object.keys(resumeSections).length ||
    value.some(
      (key) => typeof key !== "string" || !Object.hasOwn(resumeSections, key),
    ) ||
    new Set(value).size !== value.length
  )
    throw new ResumeInputError("Invalid CV section order.");
  return orderedResumeSections(value);
}
export type ResumeDraft = {
  kind?: "master-development" | "master-cybersecurity" | "tailored";
  statements?: {
    id: string;
    section: ResumeSection | "coverLetter";
    text: string;
    sources: number[];
    checked: boolean;
  }[];
  statementReviews?: Record<string, "approved" | "rejected" | "edited">;
  options?: import("./resume-options").ResumeOptions;
  letterGeneration?: { provider: string; model: string; verifiedAt: string };
  sectionOrder?: ResumeSection[];
  analysis?: ResumeAnalysis;
  aiGeneration?: {
    provider: string;
    model: string;
    verifiedAt: string;
    modelsUsed?: string[];
  };
  layoutVersion?: 2;
  coverLetter?: string;
  template?: ResumeTemplate;
  id: string;
  familyId: string;
  previousId?: string;
  createdAt: string;
  target: ResumeTarget;
  content: ResumeContent;
  profileSnapshot: Profile;
  evidence: ResumeEvidence[];
  method: string;
  warnings: string[];
  requirementsToReview: string[];
  manualEdits: boolean;
};
export type ResumeListItem = Pick<
  ResumeDraft,
  "id" | "familyId" | "createdAt" | "method" | "manualEdits" | "kind"
> & {
  options?: Pick<import("./resume-options").ResumeOptions, "track">;
  target: Pick<ResumeTarget, "title" | "company" | "applicationId">;
};
export type BuilderJob = {
  id: string;
  title: string;
  company: string;
  description: string;
  url: string;
  applicationId?: string;
  draftId?: string;
  keywords?: import("./job-keywords").JobKeyword[];
};
export class ResumeInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ResumeInputError";
  }
}
export function validateResumeContent(value: unknown): ResumeContent {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ResumeInputError("Provide valid CV sections.");
  const body = value as Record<string, unknown>;
  const result = {} as ResumeContent;
  let total = 0;
  for (const key of [
    ...resumeContactFields,
    ...(Object.keys(resumeSections) as ResumeSection[]),
  ]) {
    if (
      [
        "contributions",
        "training",
        "certifications",
        "additionalInfo",
      ].includes(key) &&
      body[key] === undefined
    ) {
      result[key] = "";
      continue;
    }
    if (typeof body[key] !== "string" || body[key].length > 20000)
      throw new ResumeInputError(`Invalid CV field: ${key}.`);
    result[key] = body[key].trim();
    total += result[key].length;
  }
  if (total > 50000)
    throw new ResumeInputError("Keep the CV under 50,000 characters.");
  if (!result.name || !result.email)
    throw new ResumeInputError("Add your name and email before saving the CV.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
    throw new ResumeInputError("Enter a valid email address.");
  for (const key of ["github", "linkedin", "portfolio"] as const) {
    if (!result[key]) continue;
    try {
      const url = new URL(result[key]);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new ResumeInputError(`Enter a valid ${key} URL.`);
    }
  }
  return result;
}

export function validateCoverLetter(value: unknown): string {
  if (typeof value !== "string" || value.length > 20000)
    throw new ResumeInputError(
      "Keep the cover letter under 20,000 characters.",
    );
  return value.trim();
}
export function validateTemplate(value: unknown): ResumeTemplate {
  if (typeof value !== "string" || !Object.hasOwn(resumeTemplates, value))
    throw new ResumeInputError("Choose a valid document style.");
  return value as ResumeTemplate;
}
export function profileCoverLetter(
  content: ResumeContent,
  target: ResumeTarget,
  body?: string,
): string {
  const skills = content.skills
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s && s.length < 120)
    .slice(0, 8)
    .join(", ");
  const block = (content.projects || content.experience)
    .split(/\n\s*\n/)
    .find((value) => /^\s*[•*-]\s+/m.test(value));
  const rows = (block || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    heading = rows[0] && !/^[•*-]/.test(rows[0]) ? rows[0] : "",
    examples = rows
      .filter((s) => /^[•*-]\s+/.test(s))
      .slice(0, 2)
      .map((s) => s.replace(/^[•*-]\s+/, ""));
  const paragraphs =
    body !== undefined
      ? body
      : [
          skills
            ? `My listed technical skills include ${skills}.`
            : content.summary,
          examples.length
            ? [
                heading
                  ? `Relevant work includes ${heading}.`
                  : "Relevant work from my background includes:",
                ...examples,
              ].join(" ")
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
  return `Dear Hiring Team,\n\nI am applying for the ${target.title} position${target.company ? " at " + target.company : ""}.\n\n${paragraphs}\n\nThank you for considering my application.\n\nKind regards,\n${content.name}`;
}
