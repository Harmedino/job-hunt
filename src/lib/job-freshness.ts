export const JOB_WINDOW_HOURS = 72;
export const JOB_WINDOW_MS = JOB_WINDOW_HOURS * 3600000;
export const DISCOVERY_REFRESH_MS = 3600000;
export function recentPosting(postedAt: string, now = Date.now()) {
  const age = now - Date.parse(postedAt);
  return Number.isFinite(age) && age >= 0 && age <= JOB_WINDOW_MS;
}
