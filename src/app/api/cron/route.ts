import {syncApplicationReminders} from "@/lib/application-store";
import { runModuleSchedule } from "@/lib/modules/workspace";
import { runDiscovery } from "@/lib/run-discovery";
import { errorResponse } from "@/lib/db";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [jobs, modules,reminders] = await Promise.allSettled([
      runDiscovery(),
      runModuleSchedule(),
      syncApplicationReminders(),
    ]);
    if (jobs.status === "rejected") return errorResponse(jobs.reason);
    return Response.json({
      ...jobs.value,
      applicationReminders:reminders.status==='fulfilled'?reminders.value:{error:'Application reminders unavailable.'},
      modules: modules.status === "fulfilled"
        ? modules.value
        : { error: "Module schedule failed. Check the source diagnostics." },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
