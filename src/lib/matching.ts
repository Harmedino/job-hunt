import { classifyLocation, explainMatch } from "./job-intelligence";
import type { Job, Profile } from "./types";
export function plainText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
export function eligibility(location:string,description:string) {
 const result=classifyLocation(location,description);
 return result.eligibility === 'restricted' ? null : result;
}
export function relevant(title:string,description='') {
 return /front[ -]?end|back[ -]?end|full[ -]?stack|software (?:engineer|developer)|web developer|react|angular|next\.?js|node\.?js|express|laravel|php|javascript|typescript|cyber.?security|soc (?:analyst|intern)|security (?:analyst|operations|intern)/i.test(title+' '+(/^(?:software|web|ui) (?:engineer|developer)$/i.test(title)?description:'')) &&
 !/\b(?:sales|account executive|future position|talent (?:pool|community)|chief|ceo|cto|founder|director)\b|react native|\bmobile\b|coding tasks|\(internal\)/i.test(title);
}
export function match(job:Job,profile:Profile):Job { return explainMatch(job,profile); }
export function facts(profile: Profile) {
  const sections = [
    ["Skills", profile.skills],
    ["Experience", profile.experience],
    ["Education", profile.education],
    ["Projects", profile.projects],
  ];
  const evidence = sections.flatMap(([title, text]) =>
    text
      ? text
          .split(/\n\s*\n/)
          .filter((s) => s.trim())
          .map((s) => `${title}: ${s.trim()}`)
      : [],
  );
  // Keep unstructured qualifications available without adding the whole CV again after import.
  const normalized = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const known = sections.map(([, text]) => normalized(text || ""));
  const contacts = [
    profile.name,
    profile.email,
    profile.phone,
    profile.location,
    profile.github,
    profile.linkedin,
    profile.portfolio,
  ]
    .filter(Boolean)
    .map(normalized);
  const remaining = (profile.cvText || "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter((line) => {
      const value = normalized(line);
      return (
        value &&
        !known.some((s) => s.includes(value)) &&
        !contacts.some((s) => s.includes(value)) &&
        !/^(?:technical )?skills:?$|^(?:work |professional )?experience:?$|^education:?$|^(?:personal |selected )?projects:?$/i.test(
          line,
        )
      );
    });
  if (remaining.length) evidence.push(`Existing CV: ${remaining.join("\n")}`);
  return evidence;
}

export function fullyRemote(
  title: string,
  location: string,
  description: string,
) {
  if (/\b(?:hybrid|on[ -]?site|in[ -]?office)\b/i.test(title + " " + location))
    return false;
  if (
    /\b(?:work(?:ing)? from home(?: \(wfh\))?|wfh|remote work(?:ing)?)(?:\s+(?:option|is|available|for|up to|only)){0,5}\s+(?:one|two|three|four|[1-4])\s+days?\s+(?:per|a|each)\s+week\b/i.test(
      description,
    )
  )
    return false;
  return !/\bhybrid (?:work(?:ing)?|role|position|arrangement|schedule|model)\b|\b(?:must|required to|expected to) (?:work|be|attend|report) (?:on[ -]?site|in (?:the )?office)\b|\b(?:work|working) on[ -]?site\b|\b(?:office attendance|in[ -]?office attendance) (?:is )?(?:required|mandatory)\b/i.test(
    description,
  );
}
