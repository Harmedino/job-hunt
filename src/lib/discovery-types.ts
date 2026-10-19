export const DISCOVERY_REVISION = 3;
import type { Job } from "./types";
export type SourceReport = {
  source: string;
  status: "ok" | "partial" | "error";
  fetched: number;
  accepted: number;
  eligible: number;
  review: number;
  excluded: { role: number; remote: number; invalid: number; age: number; location: number; duplicate: number };
  error?: string;
};
export type DiscoverySummary = {
  checkedAt: string;
  failures: string[];
  successfulSources: string[];
  sources: SourceReport[];
};
export type DiscoveryResponse = Partial<DiscoverySummary> & {
  jobs: Job[];
  persisted: boolean;
  refreshRecommended?: boolean;
  storageWarning?: string;
};
