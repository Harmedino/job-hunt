export type RawJob = {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  url: string;
  date: string;
  source: string;
  remote?: boolean;
  expiresAt?: string;
  countries?: string[];
  timezones?: number[];
  seniority?: string[];
  employmentType?: string;
};
export type JobFeed = { jobs: RawJob[]; partial?: boolean };
export type JobAdapter = {
  name: string;
  read: () => Promise<JobFeed>;
  requiredEnv?: string[];
};
