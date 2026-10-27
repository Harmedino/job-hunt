import {
  classifyLocation,
  knownSkills,
  skillMention,
} from "./job-intelligence";
export type LeadDetails = {
  title: string;
  company: string;
  location: string;
  postedAt: string;
  applicationUrl: string;
  skills: string[];
  warnings: string[];
};
export function publicHttps(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
      url.hostname,
    ) ||
    url.hostname.includes(":")
  )
    throw new Error("Use a public HTTPS posting URL without credentials.");
  url.hash = "";
  return url.href;
}
export function redactContacts(text: string) {
  return text.replace(/^(?:From|To|Cc|Bcc|Reply-To):.*$/gim, '[message header removed]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+\d[\d ()-]{8,}\d)/g, "[phone removed]");
}
export function extractLead(text: string, origin = ""): LeadDetails {
  const field = (name: string) =>
    text
      .match(new RegExp(`(?:^|\\n)${name}\\s*:\\s*([^\\n]+)`, "i"))?.[1]
      ?.trim() || "";
  const heading =
    text.match(
      /(?:hiring|looking for|seeking)\s*[:!—-]?\s*(?:a |an )?([^\n.!]{5,120})/i,
    )?.[1] || "";
  const title = field("(?:position|role|job title|title)") || heading;
  const company = field("(?:company|employer)");
  const location =
    field("(?:location|applicant location|eligible countries)") ||
    (/\bnigeria\b/i.test(text)
      ? "Nigeria"
      : /\bworldwide\b|anywhere in the world/i.test(text)
        ? "Worldwide"
        : /\bremote\b/i.test(text)
          ? "Remote"
          : "");
  const date = field("(?:posted|posted at|date)");
  const postedAt =
    /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(date) &&
    Number.isFinite(Date.parse(date))
      ? new Date(date).toISOString()
      : "";
  const links = [...text.matchAll(/https:\/\/[^\s<>"')]+/g)].map((m) =>
    m[0].replace(/[.,;]+$/, ""),
  );
  const applicationUrl =
    links.find((u) => {
      try {
        return (
          publicHttps(u) &&
          !/reddit\.com|redd\.it|whatsapp\.com|wa\.me|facebook\.com|x\.com|twitter\.com/i.test(
            new URL(u).hostname,
          )
        );
      } catch {
        return false;
      }
    }) || (/indeed\./i.test(origin) ? origin : "");
  const warnings = [
    "Imported content is an unverified lead, not an employer-confirmed vacancy.",
  ];
  if (!company) warnings.push("Employer identity is missing or anonymous.");
  if (!applicationUrl)
    warnings.push("No original employer or job-board application link found.");
  if (!postedAt)
    warnings.push(
      "Posting date is unavailable; import time is not publication time.",
    );
  if (
    /payment|registration fee|pay.*(?:training|apply)|crypto.*deposit|guaranteed.*(?:job|income)/i.test(
      text,
    )
  )
    warnings.push(
      "Possible payment or guaranteed-outcome scam; investigate before proceeding.",
    );
  if (classifyLocation(location, text).eligibility !== "eligible")
    warnings.push("Nigeria applicant eligibility is not confirmed.");
  return {
    title,
    company,
    location,
    postedAt,
    applicationUrl,
    skills: knownSkills.filter((s) => skillMention(text, s)),
    warnings,
  };
}
