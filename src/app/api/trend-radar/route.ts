import { sameOrigin } from "@/lib/auth";
import { moduleError, json } from "@/lib/modules/store";
import { ModuleError } from "@/lib/modules/validation";
import {
  radarDashboard, radarClips, hideStory, manualStory, saveRadarProject,
} from "@/lib/trend-radar/server";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return json(await radarDashboard(url.searchParams.get("hours") || 24));
  } catch (e) { return moduleError(e); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new ModuleError("Invalid request origin.", 403);
    const raw = await request.text();
    if (raw.length > 80000) throw new ModuleError("Request too large.", 413);
    let body: Record<string, unknown>;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      body = value;
    } catch { throw new ModuleError("Invalid JSON request."); }
    switch (body.action) {
      case "refresh": return json(await radarDashboard(body.hours || 24, true));
      case "clips": return json(await radarClips(body.query, body.maxSeconds || 15));
      case "hide": return json(await hideStory(body.id));
      case "manual": return json(await manualStory(body));
      case "save": return json(await saveRadarProject(body));
      default: throw new ModuleError("Unknown Trend Radar action.", 404);
    }
  } catch (e) { return moduleError(e); }
}
