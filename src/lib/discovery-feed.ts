export type RawJob = {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  url: string;
  date: string;
  source: string;
  lastVerifiedAt?: string;
  requisitionId?: string;
  boardKey?: string;
  remote?: boolean;
  expiresAt?: string;
  countries?: string[];
  timezones?: number[];
  seniority?: string[];
  employmentType?: string;
};
export type BoardCoverage = {
  total: number;
  checked: number;
  verified: number;
  failed: number;
  unvisited: number;
};
export type JobFeed = {
  jobs: RawJob[];
  partial?: boolean;
  boards?: BoardCoverage;
  sourceError?: string;
  completedBoards?: { key:string; urls:string[] }[];
};
export type JobAdapter = {
  name: string;
  read: () => Promise<JobFeed>;
  requiredEnv?: string[];
};
