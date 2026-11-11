import { radarDashboard } from "./server";
import { recentHeavyDefeats, footballConnection } from "./football";
/**
 * Optional reuse of Launchpad's existing protected daily cron.
 * Does not schedule new Vercel invocations and is disabled by default.
 * Returns honest per-source failures; never generates fictitious data.
 */
export async function runTrendRadarSchedule() {
  if (process.env.TREND_RADAR_SCHEDULED_REFRESH !== "true")
    return { status: "disabled", note: "Set TREND_RADAR_SCHEDULED_REFRESH=true to enable the existing daily cron." };
  const actions: Promise<unknown>[] = [radarDashboard(24, true)];
  if (footballConnection().configured) actions.push(recentHeavyDefeats(48, true));
  const done = await Promise.allSettled(actions);
  const errors = done.flatMap((result) => {
    if (result.status === "rejected") return [result.reason instanceof Error ? result.reason.message : "Radar refresh failed."];
    const value = result.value;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const failures = Array.isArray(record.errors) ? record.errors : Array.isArray(record.failures) ? record.failures : [];
      return failures.filter((entry): entry is string => typeof entry === "string");
    }
    return [];
  });
  return { status: errors.length ? "partial" : "completed", checkedAt: new Date().toISOString(), errors };
}
