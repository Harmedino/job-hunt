import { runTrendRadarSchedule } from "@/lib/trend-radar/schedule";
import { syncApplicationReminders } from "@/lib/application-store";
import { runModuleSchedule } from "@/lib/modules/workspace";
import { runDiscovery } from "@/lib/run-discovery";
import { errorResponse } from "@/lib/db";
import { runAssistantPreparation } from "@/lib/assistant-policy";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [jobs, modules, reminders, radar] = await Promise.allSettled([
      runDiscovery(),
      runModuleSchedule(),
      syncApplicationReminders(),
      runTrendRadarSchedule(),
    ]);
    if (jobs.status === "rejected") return errorResponse(jobs.reason);
    const assistant = await runAssistantPreparation().catch(() => ({
      error:
        "Application shortlisting unavailable; no submission was attempted.",
    }));
    return Response.json({
      ...jobs.value,
      applicationAssistant: assistant,
      applicationReminders:
        reminders.status === "fulfilled"
          ? reminders.value
          : { error: "Application reminders unavailable." },
      trendRadar: radar.status === "fulfilled" ? radar.value : { error: "Trend Radar scheduled refresh unavailable; nothing invented." },
      modules:
        modules.status === "fulfilled"
          ? modules.value
          : { error: "Module schedule failed. Check the source diagnostics." },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
