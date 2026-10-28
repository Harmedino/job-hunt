import type { Job } from "./types";
import { jobTypes, experienceLevels } from "./job-intelligence";
import { validCalendarDate } from "./application-updates";
import { validateCustomFields } from "./custom-fields";
import { validateKeywords, suggestJobKeywords } from "./job-keywords";
import { extractLead } from "./lead-extraction";
export type ManualJobDetails = {
  workArrangement: "" | "Remote" | "Hybrid" | "Onsite";
  salaryCurrency: string;
  deadline: string;
  requiredSkills: string;
  preferredSkills: string;
  technologies: string;
  responsibilities: string;
  additionalRequirements: string;
  personalNotes: string;
  archived: boolean;
};
export type ManualJob = Job & {
  createdAt: string;
  updatedAt: string;
  manual: true;
  manualDetails: ManualJobDetails;
};
export function validateManualJob(
  body: Record<string, unknown>,
  existing?: ManualJob,
): ManualJob {
  const str = (key: string, max: number, required = false) => {
    const value =
      body[key] ??
      existing?.manualDetails?.[key as keyof ManualJobDetails] ??
      (existing as unknown as Record<string, unknown>)?.[key] ??
      "";
    if (
      typeof value !== "string" ||
      value.length > max ||
      (required && !value.trim())
    )
      throw new Error(`Enter a valid ${key}.`);
    return value.trim();
  };
  const title = str("title", 500, true),
    company = str("company", 500),
    url = str("url", 2000),
    description = str("description", 25000),
    location = str("location", 1000),
    salary = str("salary", 1000);
  if (url) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      throw new Error(
        "Use an original HTTPS posting URL without credentials, or leave it blank.",
      );
  }
  const mode = str("workArrangement", 10);
  if (!["", "Remote", "Hybrid", "Onsite"].includes(mode))
    throw new Error("Choose Remote, Hybrid, Onsite or leave it unknown.");
  const currency = str("salaryCurrency", 3);
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new Error("Use a three-letter salary currency, or leave it unknown.");
  const deadline = str("deadline", 10);
  if (!validCalendarDate(deadline))
    throw new Error("Enter a valid deadline or leave it unknown.");
  const level = str("experienceLevel", 30),
    jobType = str("jobType", 30);
  if (
    (level && !(experienceLevels as readonly string[]).includes(level)) ||
    (jobType && !(jobTypes as readonly string[]).includes(jobType))
  )
    throw new Error("Choose a valid experience level and employment type.");
  if (body.archived !== undefined && typeof body.archived !== "boolean")
    throw new Error("Invalid manual job archive setting.");
  const now = new Date().toISOString(),
    details: ManualJobDetails = {
      workArrangement: mode as ManualJobDetails["workArrangement"],
      salaryCurrency: currency,
      deadline,
      requiredSkills: str("requiredSkills", 8000),
      preferredSkills: str("preferredSkills", 8000),
      technologies: str("technologies", 3000),
      responsibilities: str("responsibilities", 8000),
      additionalRequirements: str("additionalRequirements", 8000),
      personalNotes: str("personalNotes", 8000),
      archived:
        body.archived === undefined
          ? existing?.manualDetails.archived || false
          : body.archived,
    };
  const result: ManualJob = {
    ...existing,
    id: existing?.id || "manual-job:" + crypto.randomUUID(),
    manual: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    title,
    company,
    url,
    description,
    location,
    salary,
    source: "My Added Jobs · user supplied",
    postedAt: "",
    discoveredAt: existing?.discoveredAt || now,
    eligibility: "review",
    eligibilityReason:
      "Manually added, not employer-verified. Confirm the employer, posting and applicant-location requirements.",
    score: 0,
    matchedSkills: [],
    ...(level ? { experienceLevel: level as Job["experienceLevel"] } : {}),
    ...(jobType ? { jobType: jobType as Job["jobType"] } : {}),
    manualDetails: details,
    customFields:
      body.customFields === undefined
        ? existing?.customFields || []
        : validateCustomFields(body.customFields),
    keywords:
      body.keywords === undefined
        ? existing?.keywords || suggestJobKeywords(description)
        : validateKeywords(body.keywords),
  };
  if (!level) delete result.experienceLevel;
  if (!jobType) delete result.jobType;
  return result;
}
export function manualJobDescription(job: Job) {
  const d = job.manualDetails;
  return [
    job.description,
    d?.requiredSkills ? "Required skills: " + d.requiredSkills : "",
    d?.preferredSkills ? "Preferred skills: " + d.preferredSkills : "",
    d?.technologies ? "Technologies: " + d.technologies : "",
    d?.responsibilities ? "Responsibilities: " + d.responsibilities : "",
    d?.additionalRequirements
      ? "Additional employer requirements: " + d.additionalRequirements
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function suggestManualJob(text: string) {
  const parsed = extractLead(text);
  return {
    title: parsed.title || "",
    company: parsed.company || "",
    url: parsed.applicationUrl || "",
    location: parsed.location || "",
    description: text,
    keywords: suggestJobKeywords(text),
  };
}
