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
  source: string;
  eligibility: "eligible" | "review";
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
  followUp: string;
  coverLetter?: string;
  cvFacts?: string[];
  profileSnapshot?: Profile;
  preparationMethod?: string;
};
