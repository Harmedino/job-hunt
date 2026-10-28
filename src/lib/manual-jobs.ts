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
  const aliases: Record<string, string> = {
    salary: "salary",
    compensation: "salary",
    "salary currency": "salaryCurrency",
    currency: "salaryCurrency",
    "application deadline": "deadline",
    deadline: "deadline",
    "closing date": "deadline",
    "required skills": "requiredSkills",
    "mandatory skills": "requiredSkills",
    required: "requiredSkills",
    requirements: "requiredSkills",
    "preferred skills": "preferredSkills",
    preferred: "preferredSkills",
    "nice to have": "preferredSkills",
    technologies: "technologies",
    "tech stack": "technologies",
    responsibilities: "responsibilities",
    duties: "responsibilities",
    "additional employer requirements": "additionalRequirements",
    "additional requirements": "additionalRequirements",
    "work arrangement": "workArrangement",
    "work mode": "workArrangement",
    "employment type": "jobType",
    "job type": "jobType",
    "experience level": "experienceLevel",
    seniority: "experienceLevel",
    position: "title",
    role: "title",
    "job title": "title",
    title: "title",
    company: "company",
    employer: "company",
    location: "location",
    "application url": "url",
    apply: "url",
    "personal notes": "personalNotes",
  };
  const sections: Record<string, string[]> = {};
  let active = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim(),
      match = line.match(/^([a-z][a-z /-]{1,60}):\s*(.*)$/i);
    const key =
      match &&
      aliases[
        match[1].toLowerCase().replace(/[-/]/g, " ").replace(/\s+/g, " ").trim()
      ];
    if (key) {
      active = key;
      sections[key] = match[2] ? [match[2]] : [];
    } else if (!line) active = "";
    else if (active && /^\s*[-•*]\s+/.test(raw))
      sections[active].push(line.replace(/^[-•*]\s+/, ""));
    else active = "";
  }
  const field = (key: string) => (sections[key] || []).join("\n");
  const canonical = (key: string, choices: readonly string[]) =>
    choices.find(
      (value) =>
        value.toLowerCase().replace(/[ -]/g, "") ===
        field(key).toLowerCase().replace(/[ -]/g, ""),
    ) || "";
  const salary = field("salary"),
    statedCurrency =
      field("salaryCurrency") ||
      salary.match(/\b(?:NGN|USD|EUR|GBP|CAD|AUD|KES|GHS|ZAR)\b/i)?.[0] ||
      "";
  const deadline = field("deadline");
  return {
    title: parsed.title || "",
    company: parsed.company || "",
    url: parsed.applicationUrl || "",
    location: parsed.location || "",
    description: text,
    workArrangement: canonical("workArrangement", [
      "Remote",
      "Hybrid",
      "Onsite",
    ]),
    jobType: canonical("jobType", jobTypes),
    experienceLevel: canonical("experienceLevel", experienceLevels),
    salary,
    salaryCurrency: /^[A-Z]{3}$/i.test(statedCurrency)
      ? statedCurrency.toUpperCase()
      : "",
    deadline: deadline && validCalendarDate(deadline) ? deadline : "",
    requiredSkills: field("requiredSkills"),
    preferredSkills: field("preferredSkills"),
    technologies: field("technologies") || parsed.skills.join(", "),
    responsibilities: field("responsibilities"),
    additionalRequirements: field("additionalRequirements"),
    personalNotes: field("personalNotes"),
    keywords: suggestJobKeywords(text),
  };
}
