import type { Profile } from "./types";
export const resumeSections = {
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
  Record<ResumeSection, string>;
export type ResumeTarget = {
  title: string;
  company: string;
  description: string;
  url: string;
  jobId?: string;
  applicationId?: string;
};
export type ResumeEvidence = { section: ResumeSection; text: string };
export type ResumeDraft = {
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
  "id" | "familyId" | "createdAt" | "method" | "manualEdits"
> & { target: Pick<ResumeTarget, "title" | "company" | "applicationId"> };
export type BuilderJob = {
  id: string;
  title: string;
  company: string;
  description: string;
  url: string;
  applicationId?: string;
  draftId?: string;
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
