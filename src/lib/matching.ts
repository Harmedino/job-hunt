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
export function eligibility(
  location: string,
  description: string,
): { eligibility: Job["eligibility"]; eligibilityReason: string } | null {
  const text = `${location} ${description}`.toLowerCase();
  if (
    /\b(nigeria(?:n)? (?:applicants? )?(?:not|ineligible)|(?:excluding|except|not available in) nigeria)\b/.test(
      text,
    )
  )
    return null;
  if (
    /\b(us|usa|united states|canada|uk|united kingdom|europe|eu|emea|north america|latin america|india|philippines|south africa)[ -]only\b|\bmust (?:reside|be (?:based|located)|live) in (?:the )?(?:us|usa|united states|canada|uk|united kingdom|europe|eu|india)\b|\b(?:us|eu|uk) (?:citizenship|work authorization|residents)\b/i.test(
      text,
    )
  )
    return null;
  const loc = location.toLowerCase().trim();
  if (
    /nigeria|worldwide|anywhere|global|africa/.test(loc) &&
    !/south africa|north africa/.test(loc)
  )
    return {
      eligibility: "eligible",
      eligibilityReason: `Source lists “${location}”. Confirm work authorization and timezone requirements before applying.`,
    };
  if (
    /^(us|usa|uk|united states|canada|europe|eu|india|germany|united kingdom)(\b|$)/.test(
      loc,
    )
  )
    return null;
  return {
    eligibility: "review",
    eligibilityReason:
      "Remote location does not explicitly confirm Nigeria eligibility. Check the original posting.",
  };
}
export function relevant(title: string) {
  return (
    /front[ -]?end|react|angular|next\.?js|javascript|typescript|cyber.?security|soc analyst|security analyst/i.test(
      title,
    ) &&
    !/\b(senior|sr\.?|staff|principal|lead|manager|director|head)\b/i.test(
      title,
    )
  );
}
export function match(job: Job, profile: Profile): Job {
  const skills = profile.skills
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const text = `${job.title} ${job.description}`.toLowerCase();
  const matchedSkills = skills.filter((s) => text.includes(s.toLowerCase()));
  const score = skills.length
    ? Math.min(
        95,
        Math.round(
          (matchedSkills.length / skills.length) * 75 +
            (relevant(job.title) ? 20 : 0),
        ),
      )
    : 0;
  return { ...job, score, matchedSkills };
}
export function facts(profile: Profile) {
  const sections = [
    ["Skills", profile.skills], ["Experience", profile.experience],
    ["Education", profile.education], ["Projects", profile.projects],
  ];
  const evidence = sections.flatMap(([title, text]) =>
    text ? text.split(/\n\s*\n/).filter((s) => s.trim()).map((s) => `${title}: ${s.trim()}`) : [],
  );
  // Keep unstructured qualifications available without adding the whole CV again after import.
  const normalized = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const known = sections.map(([, text]) => normalized(text || ""));
  const contacts = [profile.name, profile.email, profile.phone, profile.location, profile.github, profile.linkedin, profile.portfolio].filter(Boolean).map(normalized);
  const remaining = (profile.cvText || "").split(/\n/).map((s) => s.trim()).filter((line) => {
    const value = normalized(line);
    return value && !known.some((s) => s.includes(value)) && !contacts.some((s) => s.includes(value)) &&
      !/^(?:technical )?skills:?$|^(?:work |professional )?experience:?$|^education:?$|^(?:personal |selected )?projects:?$/i.test(line);
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
  return !/\bhybrid (?:work(?:ing)?|role|position|arrangement|schedule|model)\b|\b(?:must|required to|expected to) (?:work|be|attend|report) (?:on[ -]?site|in (?:the )?office)\b|\b(?:work|working) on[ -]?site\b|\b(?:office attendance|in[ -]?office attendance) (?:is )?(?:required|mandatory)\b/i.test(
    description,
  );
}
