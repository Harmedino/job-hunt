export const JOB_WINDOW_HOURS = 30 * 24;
export const JOB_WINDOW_MS = JOB_WINDOW_HOURS * 3600000;
export const DISCOVERY_REFRESH_MS = 3600000;
export function recentPosting(postedAt: string, now = Date.now(), days = 3) {
  const age = now - Date.parse(postedAt);
  return Number.isFinite(age) && age >= 0 && age <= days * 86400000;
}

export function activeBoardPosting(
  job: { source: string; lastVerifiedAt?: string },
  now = Date.now(),
) {
  const age = now - Date.parse(job.lastVerifiedAt || "");
  return (
    (["Greenhouse", "Lever", "Ashby", "SmartRecruiters"].includes(job.source) || job.source.startsWith("Verified lead")) &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= 24 * 3600000
  );
}

export const postingViews = [1,3,7,14,30] as const;
