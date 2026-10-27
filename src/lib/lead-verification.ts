import { classifyLocation } from "./job-intelligence";
import { publicHttps } from "./lead-extraction";
import { jobIdentity } from "./job-identity";
import type { SocialLead } from "./social";
import type { Job } from "./types";
export function leadJob(lead: SocialLead, body: Record<string, unknown>): Job {
  if (
    body.employerConfirmed !== true ||
    body.vacancyConfirmed !== true ||
    body.locationReviewed !== true
  )
    throw new Error(
      "Confirm employer identity, current vacancy and review of applicant restrictions.",
    );
  const fields = [
    "title",
    "company",
    "location",
    "applicationUrl",
    "evidenceUrl",
  ] as const;
  for (const field of fields)
    if (
      typeof body[field] !== "string" ||
      !body[field].trim() ||
      body[field].length > 2000
    )
      throw new Error(`Complete ${field}.`);
  const url = publicHttps(body.applicationUrl as string);
  const evidenceUrl = publicHttps(body.evidenceUrl as string);
  if (
    /(?:^|\.)(reddit\.com|redd\.it|whatsapp\.com|x\.com|twitter\.com|facebook\.com)$/.test(
      new URL(evidenceUrl).hostname,
    )
  )
    throw new Error(
      "Provide the original employer or job-board listing as evidence, not only a social post.",
    );
  const date = typeof body.postedAt === "string" ? body.postedAt : "";
  if (
    date &&
    (!Number.isFinite(Date.parse(date)) || Date.parse(date) > Date.now())
  )
    throw new Error("Use the advertised posting date, or leave it blank.");
  const location = classifyLocation(body.location as string, lead.text);
  if (location.eligibility === "restricted")
    throw new Error(
      "This posting restricts Nigeria-based applicants. Keep it as a lead instead.",
    );
  const now = new Date().toISOString();
  const job = {
    title: (body.title as string).trim(),
    company: (body.company as string).trim(),
    location: (body.location as string).trim(),
    url,
  };
  return {
    ...job,
    id: jobIdentity(job),
    description: lead.text,
    salary: "",
    source: `Verified lead · ${lead.platform} (user reviewed)`,
    postedAt: date ? new Date(date).toISOString() : "",
    discoveredAt: now,
    lastVerifiedAt: now,
    lastSeenAt: now,
    ...location,
    score: 0,
    matchedSkills: [],
  };
}
