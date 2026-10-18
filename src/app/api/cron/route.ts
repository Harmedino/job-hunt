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
    return Response.json(await runDiscovery());
  } catch (e) {
    return errorResponse(e);
  }
}
