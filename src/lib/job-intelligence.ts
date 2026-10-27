import type { Job, Profile } from "./types";
export const jobTypes = [
  "Full-time",
  "Part-time",
  "Contract",
  "Freelance",
  "Internship",
] as const;
export const experienceLevels = [
  "Internship",
  "Entry-level",
  "Junior",
  "Mid-level",
  "Senior",
] as const;
export type JobType = (typeof jobTypes)[number];
export type ExperienceLevel = (typeof experienceLevels)[number];
export const eligibilityLabels = {
  nigeria: "Confirmed eligible for Nigeria",
  worldwide: "Worldwide / Africa eligible",
  review: "Eligibility needs checking",
  restricted: "Confirmed restricted",
} as const;
export const knownSkills = [
  "React",
  "Angular",
  "Next.js",
  "Node.js",
  "Express",
  "Laravel",
  "PHP",
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "SQL",
  "PostgreSQL",
  "MongoDB",
  "Kubernetes",
  "Docker",
  "AWS",
  "Git",
  "Linux",
  "SIEM",
  "SOC",
  "Cybersecurity",
  "HTML",
  "CSS",
] as const;
const skillPatterns = new Map<string, RegExp>();
export function skillMention(text: string, skill: string) {
  const escaped = skill
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\./g, "[. ]?");
  let pattern = skillPatterns.get(skill);
  if (!pattern) {
    if (skillPatterns.size >= 200) skillPatterns.clear();
    pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    skillPatterns.set(skill, pattern);
  }
  return pattern.test(text);
}
export function inferJobType(text: string): JobType | undefined {
  if (/\bintern(?:ship)?\b/i.test(text)) return "Internship";
  if (/\bfreelanc(?:e|er|ing)\b/i.test(text)) return "Freelance";
  if (/\bpart[ -]?time\b/i.test(text)) return "Part-time";
  if (/\bcontract(?:or)?\b/i.test(text)) return "Contract";
  if (/\bfull[ -]?time\b/i.test(text)) return "Full-time";
}
export function inferExperience(text: string): ExperienceLevel | undefined {
  if (/\bintern(?:ship)?\b/i.test(text)) return "Internship";
  if (/\b(?:senior|sr\.?|staff|principal|lead)\b/i.test(text)) return "Senior";
  if (/\bjunior\b/i.test(text)) return "Junior";
  if (/entry[ -]?level|graduate|early career/i.test(text)) return "Entry-level";
  if (/mid[ -]?level|intermediate/i.test(text)) return "Mid-level";
}
export type LocationAssessment = {
  eligibility: Job["eligibility"];
  eligibilityClass: NonNullable<Job["eligibilityClass"]>;
  eligibilityReason: string;
};
export function classifyLocation(
  location: string,
  description: string,
  countries?: string[],
  timezones?: number[],
): LocationAssessment {
  const text = `${location} ${description}`.replace(
    /\b(?:us|uk|eu) work authori[sz]ation (?:is )?not required\b|\bno (?:us|uk|eu) citizenship (?:is )?required\b/gi,
    "",
  );
  const restricted = (why: string): LocationAssessment => ({
    eligibility: "restricted",
    eligibilityClass: "restricted",
    eligibilityReason: why,
  });
  const normalized = (countries || []).map((c) => c.toLowerCase().trim());
  if (timezones?.length && !timezones.includes(1))
    return restricted("The advertised timezone list excludes Nigeria (UTC+1).");
  if (
    normalized.length &&
    !normalized.some((c) =>
      /^(ng|nigeria|africa|worldwide|anywhere|global|emea)$/.test(c),
    )
  )
    return restricted(
      "The advertised applicant-country list does not include Nigeria.",
    );
  if (
    /\b(?:excluding|except|not available in|not eligible in) nigeria\b|\bnigerian? applicants? (?:not|ineligible)|\b(?:us|usa|united states|canada|uk|united kingdom|eu|europe|india|south africa|north america|latin america)[ -]only\b|\bmust (?:reside|live|be (?:based|located)) in (?:the )?(?:us|usa|united states|uk|united kingdom|eu|europe|canada|india|australia)\b|\b(?:us|eu|uk) (?:citizenship|work authori[sz]ation|residents)\b|\b(?:remote|work(?:ing)? remotely?) (?:only )?(?:from|within|in) (?:the )?(?:us|usa|united states|canada|uk|united kingdom|europe|eu|india|ireland|australia)\b/i.test(
      text,
    )
  )
    return restricted(
      "The posting explicitly restricts applicant location or work authorization.",
    );
  const loc = location.toLowerCase().trim();
  if (
    /\banywhere (?:in|within) (?:the )?(?:u\.?s\.?a?\.?|united states|uk|united kingdom|canada|europe|eu|india|australia)\b/i.test(
      loc,
    )
  )
    return restricted(
      "“Anywhere” is limited to a country or region that does not include Nigeria.",
    );
  if (
    /^(?:remote\s*[-–—:(]*\s*)?(?:us|usa|uk|united states|united kingdom|canada|europe|eu|india|germany|ireland|australia|americas|north america|latin america)(?:\b|$)/i.test(
      loc,
    ) &&
    !/nigeria|africa|worldwide/.test(loc)
  )
    return restricted(
      "The advertised hiring location does not include Nigeria.",
    );
  if (
    /\bnigeria\b/i.test(location) ||
    /\bnigerian applicants?\b|\b(?:applicants?|candidates?) (?:based |located )?(?:in|from) nigeria\b/i.test(
      description,
    ) ||
    normalized.some((c) => ["ng", "nigeria"].includes(c))
  )
    return {
      eligibility: "eligible",
      eligibilityClass: "nigeria",
      eligibilityReason:
        "The source explicitly lists Nigeria. Check any additional authorization requirements.",
    };
  if (
    (/worldwide|anywhere|global|\bafrica\b/i.test(loc) &&
      !/south africa|north africa|emea/i.test(loc)) ||
    normalized.some((c) => /^(africa|worldwide|anywhere|global)$/.test(c)) ||
    /\b(?:hire|hiring|recruit(?:ing)?) (?:worldwide|globally|across africa)|\b(?:work|remote) (?:from )?(?:anywhere in the world|worldwide)\b/i.test(
      description,
    )
  )
    return {
      eligibility: "eligible",
      eligibilityClass: "worldwide",
      eligibilityReason:
        "The posting explicitly advertises worldwide or Africa-wide coverage; confirm timezone and authorization terms.",
    };
  return {
    eligibility: "review",
    eligibilityClass: "review",
    eligibilityReason:
      "The source does not explicitly confirm Nigeria eligibility. Review the original posting; remote alone is not confirmation.",
  };
}
export function explainMatch(job: Job, profile: Profile): Job {
  if (typeof job.location === "string") {
    const assessment = classifyLocation(
      job.location,
      job.description,
      job.applicantCountries,
      job.timezoneRestrictions,
    );
    job = { ...job, ...assessment };
    if (
      job.source === "Himalayas" &&
      !job.timezoneRestrictions &&
      assessment.eligibility === "eligible"
    )
      job = {
        ...job,
        eligibility: "review",
        eligibilityClass: "review",
        eligibilityReason:
          "Timezone eligibility needs checking on the original posting.",
      };
  }

  const skills = profile.skills
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const matchedSkills = skills.filter((s) =>
    skillMention(`${job.title} ${job.description}`, s),
  );
  const level = job.experienceLevel || inferExperience(job.title);
  const type = job.jobType || inferJobType(`${job.title} ${job.description}`);
  const requested = knownSkills.filter((s) => skillMention(job.description, s));
  const required = extractRequirements(job.description, profile);
  const relevantRole =
    /front[ -]?end|back[ -]?end|full[ -]?stack|software|react|angular|node|laravel|php|security|soc|javascript|typescript/i.test(
      job.title,
    );
  const desired = profile.roles
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const role = relevantRole
    ? desired.some((s) => s.toLowerCase() === job.title.toLowerCase())
      ? 25
      : 18
    : 0;
  const skillScore = requested.length
    ? Math.round(
        (requested.filter((s) => skillMention(profile.skills, s)).length /
          requested.length) *
          35,
      )
    : skills.length
      ? Math.min(20, matchedSkills.length * 5)
      : 0;
  const profileLevel = inferExperience(
    profile.experience + " " + profile.roles,
  );
  const experience =
    level &&
    new RegExp(level.replace("-", "[ -]?"), "i").test(
      profile.experience + " " + profile.roles,
    )
      ? 15
      : 0;
  const location =
    job.eligibility === "eligible" ? 15 : job.eligibility === "review" ? 5 : 0;
  const age = Date.now() - Date.parse(job.postedAt);
  const freshness =
    Number.isFinite(age) && age >= 0
      ? age <= 86400000
        ? 10
        : age <= 7 * 86400000
          ? 7
          : 3
      : 0;
  const scoreBreakdown = {
    role,
    skills: skillScore,
    experience,
    location,
    freshness,
  };
  const matchReasons = [
    `${role}/25 role relevance`,
    `${skillScore}/35 skills: ${matchedSkills.join(", ") || "no profile skill matches established"}`,
    `${experience}/15 experience: ${level || "level not supplied"}${experience ? " matches your stated level" : " needs review"}`,
    `${location}/15 location confidence: ${job.eligibilityReason}`,
    `${freshness}/10 posting freshness${!Number.isFinite(age) ? " (date unavailable)" : ""}`,
  ];
  if (level === "Senior" && profileLevel && profileLevel !== "Senior")
    matchReasons.push(
      "The advertised seniority exceeds your stated experience level; review before applying.",
    );
  return {
    ...job,
    jobType: type,
    experienceLevel: level,
    matchedSkills,
    score:
      job.eligibility === "restricted" ||
      (!profile.skills.trim() && !profile.experience.trim())
        ? 0
        : Math.min(
            level === "Senior" && profileLevel && profileLevel !== "Senior"
              ? 59
              : 100,
            Object.values(scoreBreakdown).reduce((a, b) => a + b, 0),
          ),
    scoreBreakdown,
    matchReasons,
    requirements: required,
  };
}
export type RequirementCheck = {
  text: string;
  kind: "required" | "preferred";
  skills: string[];
  supported: string[];
  needsReview: string[];
};
export function extractRequirements(
  description: string,
  profile: Pick<Profile, "skills" | "experience" | "projects" | "education">,
): RequirementCheck[] {
  const evidence = [
    profile.skills,
    profile.experience,
    profile.projects,
    profile.education,
  ].join("\n");
  let kind: RequirementCheck["kind"] = "required";
  return description
    .split(/\n|(?<=[.!?])\s+/)
    .flatMap((line) => {
      if (/preferred|nice[- ]to[- ]have|bonus|desirable/i.test(line))
        kind = "preferred";
      else if (
        /required|requirements|must have|essential|qualifications/i.test(line)
      )
        kind = "required";
      const skills = knownSkills.filter((s) => skillMention(line, s));
      const manualEvidence=/years?|degree|certification|bachelor|master|experience/i.test(line);
    if (!skills.length && !manualEvidence) return [];
      const supported = skills.filter((s) => skillMention(evidence, s));
      return [
        {
          text: line.trim().slice(0, 1500),
          kind,
          skills: [...skills],
          supported,
          needsReview: [...skills.filter((s) => !supported.includes(s)), ...(manualEvidence ? ["Verify experience duration and credentials against the master profile"] : [])],
        },
      ];
    })
    .slice(0, 30);
}
export function jobAvailable(
  job: Pick<Job, "expiresAt" | "closedAt">,
  now = Date.now(),
) {
  return !job.closedAt && (!job.expiresAt || Date.parse(job.expiresAt) > now);
}
