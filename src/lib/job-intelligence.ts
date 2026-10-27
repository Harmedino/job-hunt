import {careerPreferences} from "./career-preferences";
import {assessCareer,profileForCareer} from "./career-policy";
import {evaluateJobPreferences} from "./job-ranking";
import {plainText} from "./job-text";
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
  "Tailwind CSS", "Networking", "Wireshark", "Nmap", "Information Security", "Network Security", "Blue Team", "Incident Response",
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
  const timezoneClause=text.match(/\b(?:must|need to|required to)\s+(?:be\s+)?(?:based|located|reside|live|work)[^.!?\n]{0,100}\b(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?[^.!?\n]{0,60}/i);
  if(timezoneClause){
    const hour=Number(timezoneClause[2]),minute=Number(timezoneClause[3]||0),offset=(hour+minute/60)*(timezoneClause[1]==='-'?-1:1);
    if(hour<=14&&minute<60){
      if(/between|within|overlap|hours?|±|\+\s*\/\s*-|\bto\b|\band\b/i.test(timezoneClause[0]) || [...timezoneClause[0].matchAll(/(?:GMT|UTC)\s*[+-]\s*\d/gi)].length>1)return {eligibility:'review',eligibilityClass:'review',eligibilityReason:'The posting includes required timezone or overlap conditions. Confirm that Nigeria (UTC+1) is permitted.'};
      if(offset!==1)return restricted('The posting requires applicants to be based in a timezone other than Nigeria (UTC+1).');
    }
  }
  if(/\bremote\s*[-–—]\s*(?:united states|united kingdom|canada|australia|india|europe|latin america|latam|americas|apac|asia|singapore|hong kong|\bus\b|\buk\b)\b/i.test(text))return restricted('The posting explicitly labels the remote work location outside Nigeria.');
  if(/\b(?:must (?:reside|live|be (?:based|located)) in|(?:candidates?|applicants?) (?:from|based in|located in)|only (?:hiring|available) in|restricted to)\s+(?:the )?(?:latin america|latam|americas|apac|asia|north america)\b|\b(?:latam|latin america|americas|apac|asia)[ -]only\b/i.test(text))return restricted('The advertised applicant region excludes Nigeria.');
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
  job={...job,title:plainText(job.title),company:plainText(job.company),description:plainText(job.description),source:plainText(job.source)};
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

  const originalProfile=profile;
  const career=assessCareer(job,profile);
  profile=profileForCareer(profile,career.careerPath);
  const skills = profile.skills
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const profileSkills=[...new Set([...skills,...knownSkills.filter(s=>skillMention(profile.experience+" "+profile.projects,s))])];
  const matchedSkills = profileSkills.filter((s) =>
    skillMention(`${job.title} ${job.description}`, s),
  );
  const level = career.assessedLevel;
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
        (requested.filter((s) => skillMention(profile.skills+" "+profile.experience+" "+profile.projects, s)).length /
          requested.length) *
          35,
      )
    : skills.length
      ? Math.min(20, matchedSkills.length * 5)
      : 0;
  const profileLevel = career.careerPath==='cybersecurity'?careerPreferences(originalProfile).securityMax:careerPreferences(originalProfile).developmentMax;
  const experience=career.careerAllowed?(level?15:5):0;
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
    `${experience}/15 experience: ${level || "level not supplied"}${experience ? " fits your selected career level; verify required experience duration" : " needs review"}`,
    `${location}/15 location confidence: ${job.eligibilityReason}`,
    `${freshness}/10 posting freshness${!Number.isFinite(age) ? " (date unavailable)" : ""}`,
  ];
  if (level === "Senior" && profileLevel && profileLevel !== "Senior")
    matchReasons.push(
      "The advertised seniority exceeds your stated experience level; review before applying.",
    );
  const stack=assessStackFit(job.title,job.description,profile);
  if(stack.stackFit==='incompatible')matchReasons.push(stack.stackReason+' Profile match score is capped because the primary stack differs.');
  return evaluateJobPreferences({
    ...job,
    ...stack,
    jobType: type,
    experienceLevel: level,
    seniorityMismatch:!!(level==='Senior'&&profileLevel&&profileLevel!=='Senior'),
    matchedSkills,
    score:
      job.eligibility === "restricted" ||
      (!profile.skills.trim() && !profile.experience.trim() && !profile.projects.trim())
        ? 0
        : Math.min(
            stack.stackFit==='incompatible'?20:100,
            level === "Senior" && profileLevel && profileLevel !== "Senior"
              ? 59
              : 100,
            Object.values(scoreBreakdown).reduce((a, b) => a + b, 0),
          ),
    scoreBreakdown,
    matchReasons,
    requirements: required,
  },originalProfile);
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

const stackFamilies = [
 {name:'JavaScript / TypeScript',pattern:/\b(?:javascript|typescript|react|angular|next\.?js|node\.?js|express(?:\.?js)?|vue|svelte)\b/i},
 {name:'.NET / C#',pattern:/(?:^|[^a-z0-9])(?:c#|f#|\.net|asp\.?net|dotnet)(?:$|[^a-z0-9])/i},
 {name:'Java / Spring',pattern:/\bjava\b|\bspring(?: boot)?\b/i},
 {name:'Python',pattern:/\b(?:python|django|flask|fastapi)\b/i},
 {name:'PHP / Laravel',pattern:/\b(?:php|laravel|symfony)\b/i},
 {name:'Ruby',pattern:/\b(?:ruby|rails)\b/i},
 {name:'Go',pattern:/\b(?:golang|go)\b/i},
 {name:'Rust',pattern:/\brust\b/i},
 {name:'C / C++',pattern:/(?:^|[^a-z0-9])c\+\+(?:$|[^a-z0-9])|\bc developer\b|\bc engineer\b/i},
 {name:'Swift / Kotlin',pattern:/\b(?:swift|kotlin|objective[ -]?c)\b/i},
 {name:'Elixir / Scala',pattern:/\b(?:elixir|scala)\b/i},
] as const;
export function assessStackFit(title:string,description:string,profile:Pick<Profile,'skills'|'roles'>&Partial<Pick<Profile,'experience'|'projects'>>):{stackFit:'match'|'incompatible'|'unknown';stackReason:string} {
 const preferred=stackFamilies.filter(f=>f.pattern.test([profile.skills,profile.roles,profile.experience,profile.projects].filter(Boolean).join(' ')));
 if(!preferred.length)return {stackFit:'unknown',stackReason:'Add your technologies to My Profile to personalize stack relevance.'};
 const inTitle=stackFamilies.filter(f=>f.pattern.test(title));
 const missing=inTitle.filter(f=>!preferred.includes(f));
 if(missing.length)return {stackFit:'incompatible',stackReason:`The advertised role names ${missing.map(f=>f.name).join(', ')}, which your saved profile and role preferences do not list.`};
 if(inTitle.length)return {stackFit:'match',stackReason:`The role names ${inTitle.map(f=>f.name).join(', ')}, matching your saved stack preferences. Check the full requirements.`};
 const requiredText=description.split(/\n|(?<=[.!?])\s+/).filter(line=>/required|requirements|must have|essential|proficien(?:t|cy)|tech(?:nology)? stack|experience (?:with|in)/i.test(line) && !/preferred|nice[ -]to[ -]have|optional|bonus/i.test(line)).join(' ');
 const required=stackFamilies.filter(f=>f.pattern.test(requiredText));
 if(required.length && !required.some(f=>preferred.includes(f)))return {stackFit:'incompatible',stackReason:`The stated requirements name ${required.map(f=>f.name).join(', ')} rather than the stack in your saved profile.`};
 if(required.length)return {stackFit:'match',stackReason:'The requirements mention your saved technology stack. Confirm proficiency and all other qualifications.'};
 return {stackFit:'unknown',stackReason:'The primary technology stack is not explicit. Check the original posting.'};
}
