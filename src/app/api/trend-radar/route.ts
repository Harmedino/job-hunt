import { recentHeavyDefeats, fixtureCastReport } from "@/lib/trend-radar/football";
import { listComedyTemplates, saveComedyTemplate } from "@/lib/trend-radar/comedy-library";
import { searchRadarClips, sceneSearchFor } from "@/lib/trend-radar/clip-search";
import { sameOrigin } from "@/lib/auth";
import { moduleError, json } from "@/lib/modules/store";
import { ModuleError } from "@/lib/modules/validation";
import {
  radarDashboard, hideStory, manualStory, saveRadarProject, creativeSuggestions,
} from "@/lib/trend-radar/server";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    if (scope === "football") return json(await recentHeavyDefeats(Number(url.searchParams.get("hours") || 24)));
    if (scope === "templates") return json({ templates: await listComedyTemplates() });
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
      case "clips": return json(await searchRadarClips({ query: String(body.query || ""), maxSeconds: Number(body.maxSeconds || 15), pages: Number(body.pages || 2), order: body.order === "date" ? "date" : "relevance" }));
      case "story-clips": return json(await searchRadarClips({ query: sceneSearchFor(String(body.kind || "defeat")), maxSeconds: 15, pages: 1, order: "relevance" }));
      case "football-refresh": return json(await recentHeavyDefeats(Number(body.hours || 24), true));
      case "football-cast": return json(await fixtureCastReport(Number(body.fixtureId), Number(body.loserTeamId)));
      case "template-save": return json(await saveComedyTemplate(body));
      case "creative": return json(await creativeSuggestions(body.story));
      case "hide": return json(await hideStory(body.id));
      case "manual": return json(await manualStory(body));
      case "save": return json(await saveRadarProject(body));
      default: throw new ModuleError("Unknown Trend Radar action.", 404);
    }
  } catch (e) { return moduleError(e); }
}
