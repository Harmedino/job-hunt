export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  url: string;
  postedAt: string;
  discoveredAt: string;
  lastVerifiedAt?: string;
  lastSeenAt?: string;
  closedAt?: string;
  boardKey?: string;
  requisitionId?: string;
  applicantCountries?: string[];
  timezoneRestrictions?: number[];
  jobType?: import("./job-intelligence").JobType;
  experienceLevel?: import("./job-intelligence").ExperienceLevel;
  eligibilityClass?: "nigeria" | "worldwide" | "review" | "restricted";
  stackFit?: "match" | "incompatible" | "unknown";
  stackReason?: string;
  seniorityMismatch?:boolean;
  scoreBreakdown?: { role:number; skills:number; experience:number; location:number; freshness:number };
  matchReasons?: string[];
  requirements?: import("./job-intelligence").RequirementCheck[];
  expiresAt?: string;
  source: string;
  eligibility: "eligible" | "review" | "restricted";
  eligibilityReason: string;
  score: number;
  matchedSkills: string[];
};
export type Profile = {
  name: string;
  email: string;
  location: string;
  phone: string;
  github: string;
  linkedin: string;
  portfolio: string;
  skills: string;
  experience: string;
  education: string;
  projects: string;
  roles: string;
  preferences: string;
  cvText: string;
};
export const emptyProfile: Profile = {
  name: "",
  email: "",
  location: "Nigeria",
  phone: "",
  github: "",
  linkedin: "",
  portfolio: "",
  skills: "",
  experience: "",
  education: "",
  projects: "",
  roles:
    "Frontend Developer, React Developer, Next.js Developer, Cybersecurity Intern, SOC Analyst Intern",
  preferences:
    "Fully remote only; employers worldwide; respect applicant-location restrictions",
  cvText: "",
};
export const statuses = [
  "Saved",
  "Preparing",
  "Ready for review",
  "Submitted",
  "Interview",
  "Rejected",
  "Offer",
] as const;
export type Application = {
  id: string;
  job: Job;
  status: (typeof statuses)[number];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  applicationDate?:string;
  followUpDate?:string;
  notes?:string;
  interviewInfo?:string;
  followUp: string;
  coverLetter?: string;
  cvFacts?: string[];
  cvDraftId?: string;
  profileSnapshot?: Profile;
  preparationMethod?: string;
};
