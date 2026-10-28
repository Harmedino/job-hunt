export type Job = {
  manual?: boolean;
  manualDetails?: import("./manual-jobs").ManualJobDetails;
  customFields?: import("./custom-fields").CustomField[];
  keywords?: import("./job-keywords").JobKeyword[];
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  salaryDetails?: {
    min?: number;
    max?: number;
    currency: string;
    period: "month" | "year" | "week" | "hour";
    hoursPerWeek?: number;
  };
  salaryAssessment?: import("./job-salary").SalaryAssessment;
  salaryPolicy?: "allowed" | "review" | "excluded";
  salaryPolicyReason?: string;
  careerPath?: import("./career-preferences").CareerPath;
  careerAllowed?: boolean;
  careerReason?: string;
  developmentTrack?: "frontend" | "backend" | "fullstack" | "software";
  isInternship?: boolean;
  compensation?: "paid" | "unpaid" | "unknown";
  minimumYears?: number;
  linkEvidence?: string;
  rankingFactors?: import("./career-preferences").RankingWeights;
  sources?: import("./vacancy-groups").JobSource[];
  aliasIds?: string[];
  canonicalKey?: string;
  isCurrentDiscovery?: boolean;
  possibleDuplicateIds?: string[];
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
  seniorityMismatch?: boolean;
  scoreBreakdown?: {
    role: number;
    skills: number;
    experience: number;
    location: number;
    freshness: number;
  };
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
  revision?: string;
  skillGroups?: import("./custom-fields").CustomField[];
  careerRecords?: import("./career-records").CareerRecords;
  nysc?: import("./career-records").NyscInformation;
  cvTracks?: import("./career-records").CvTrackProfiles;
  customFields?: import("./custom-fields").CustomField[];
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
  availability?: import("./application-history").JobHuntAvailability;
  career?: import("./career-preferences").CareerPreferences;
  jobSearchDefaults?: Partial<
    Record<
      "development" | "cybersecurity",
      import("./job-filter-state").JobFilters
    >
  >;
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
  "Archived",
] as const;
export type Application = {
  id: string;
  job: Job;
  status: (typeof statuses)[number];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  origin?: "manual" | "discovered";
  hasApplied?: boolean;
  originalFiles?: import("./application-files").SubmissionFileInfo[];
  originalFileIds?: Partial<Record<"cv" | "letter", string>>;
  customFields?: import("./custom-fields").CustomField[];
  vacancyKey?: string;
  statusHistory?: { status: string; at: string }[];
  interviewDate?: string;
  employerResponse?: string;
  nextAction?: string;
  documentSnapshot?: {
    files?: import("./application-files").SubmissionFileInfo[];
    renderingWarning?: string;
    cv?: import("./resume-types").ResumeDraft | null;
    coverLetter?: string;
    coverLetterUsed?: "yes" | "no" | "unknown";
    cvLabel?: string;
    profileSnapshot?: Profile;
    cvFacts?: string[];
    capturedAt: string;
  };
  saved?: boolean;
  unsavedAt?: string;
  applicationDate?: string;
  followUpDate?: string;
  notes?: string;
  interviewInfo?: string;
  followUp: string;
  coverLetter?: string;
  cvFacts?: string[];
  cvDraftId?: string;
  profileSnapshot?: Profile;
  preparationMethod?: string;
};
