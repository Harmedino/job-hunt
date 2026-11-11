import { db } from "../db";
import { ownerFilter, OWNER, lease } from "../modules/store";
import { ModuleError } from "../modules/validation";
import {
  classifyHumiliation, playerEvidence, type HumiliationFixture,
  type MatchCastReport, type PlayedPerson,
} from "./football-core";
const ROOT = "https://v3.football.api-sports.io/";
export function footballConnection() {
  const key = process.env.API_FOOTBALL_KEY?.trim() || process.env.APISPORTS_KEY?.trim() || "";
  return { configured: !!key, keyName: process.env.API_FOOTBALL_KEY?.trim() ? "API_FOOTBALL_KEY" : "APISPORTS_KEY" };
}
async function footballApi(path: string, params: Record<string, string>): Promise<unknown[]> {
  const key = process.env.API_FOOTBALL_KEY?.trim() || process.env.APISPORTS_KEY?.trim();
  if (!key) throw new ModuleError("Football results require API_FOOTBALL_KEY (API-Football/API-Sports). Source-backed news stays available.", 503);
  let result: Response;
  try {
    result = await fetch(ROOT + path + "?" + new URLSearchParams(params), {
      headers: { "x-apisports-key": key, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8500),
    });
  } catch { throw new ModuleError("Football statistics provider timed out or is unreachable.", 502); }
  if (result.status === 429) throw new ModuleError("Football provider daily quota or rate limit reached; no match stats are being guessed.", 429);
  if (result.status === 401 || result.status === 403) throw new ModuleError("Football API key is invalid, suspended, or lacks access.", 503);
  if (!result.ok) throw new ModuleError("Football provider failed (HTTP " + result.status + ").", 502);
  const body = await result.json() as Record<string, unknown>;
  const errors = body.errors;
  if (Array.isArray(errors) ? errors.length > 0 : !!errors && typeof errors === "object" && Object.keys(errors).length > 0)
    throw new ModuleError("Football API reported an error or account restriction. Check the provider dashboard.", 503);
  if (!Array.isArray(body.response)) throw new ModuleError("Football provider returned no usable response.", 502);
  return body.response.slice(0, 600);
}
async function ensureIndexes() {
  const database = await db();
  await Promise.all([
    database.collection("trend_radar_football").createIndex({ owner: 1, key: 1 }, { unique: true }),
    database.collection("trend_radar_football").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
export async function recentHeavyDefeats(hours: number, force = false): Promise<{
  fixtures: HumiliationFixture[]; checkedAt: string | null; errors: string[];
  provider: "API-Football"; connected: boolean;
}> {
  if (![6, 12, 24, 48].includes(hours)) throw new ModuleError("Use a 6/12/24/48-hour window.");
  const connected = footballConnection().configured;
  if (!connected) return { fixtures: [], checkedAt: null, errors: ["API_FOOTBALL_KEY is not configured. Match results and player ratings are unavailable; news remains accessible."], provider: "API-Football", connected };
  await ensureIndexes();
  const database = await db();
  const cache = database.collection("trend_radar_football");
  const now = Date.now();
  const key = "results:" + hours;
  const stored = await cache.findOne(ownerFilter({ key }));
  if (!force && stored && Date.parse(String(stored.checkedAt || "")) > now - 45 * 60000)
    return { fixtures: (stored.fixtures || []) as HumiliationFixture[], checkedAt: String(stored.checkedAt), errors: [], provider: "API-Football", connected };
  if (!(await lease("radar-football-results:" + hours, 50))) {
    if (stored) return { fixtures: (stored.fixtures || []) as HumiliationFixture[], checkedAt: String(stored.checkedAt), errors: ["Refreshing. Showing earlier provider response."], provider: "API-Football", connected };
    return { fixtures: [], checkedAt: null, errors: ["Another football results refresh is running."], provider: "API-Football", connected };
  }
  const lower = now - hours * 3600000;
  const dates = [...new Set([now, lower, now - 24 * 3600000].filter((value) => value >= lower - 86400000).map((t) => new Date(t).toISOString().slice(0, 10)))].slice(0, 3);
  const results = await Promise.allSettled(dates.map((date) => footballApi("fixtures", { date, timezone: "UTC" })));
  const errors: string[] = [];
  const fixtures = new Map<number, HumiliationFixture>();
  for (let i = 0; i < results.length; i++) {
    const outcome = results[i];
    if (outcome.status === "rejected") { errors.push(dates[i] + ": " + String(outcome.reason instanceof Error ? outcome.reason.message : "provider unavailable")); continue; }
    for (const row of outcome.value) {
      const match = classifyHumiliation(row, now);
      if (match && Date.parse(match.kickoff) >= lower) fixtures.set(match.id, match);
    }
  }
  const ordered = [...fixtures.values()].sort((a, b) =>
    b.margin - a.margin || Date.parse(b.kickoff) - Date.parse(a.kickoff)).slice(0, 18);
  const checkedAt = new Date().toISOString();
  if (errors.length !== dates.length) {
    await cache.updateOne(ownerFilter({ key }), {
      $set: { key, owner: OWNER, fixtures: ordered, checkedAt, expiresAt: new Date(now + 72 * 3600000) },
    }, { upsert: true });
  }
  return { fixtures: errors.length === dates.length && stored ? (stored.fixtures || []) as HumiliationFixture[] : ordered,
    checkedAt: errors.length === dates.length ? String(stored?.checkedAt || "") || null : checkedAt,
    errors, provider: "API-Football", connected };
}
export async function fixtureCastReport(fixtureId: number, loserTeamId: number): Promise<MatchCastReport> {
  if (!Number.isInteger(fixtureId) || fixtureId <= 0 || !Number.isInteger(loserTeamId) || loserTeamId <= 0)
    throw new ModuleError("Choose a valid provider fixture and losing team.");
  await ensureIndexes();
  const database = await db();
  const cache = database.collection("trend_radar_football");
  const key = "cast:" + fixtureId;
  const stored = await cache.findOne(ownerFilter({ key }));
  if (stored && Date.parse(String(stored.checkedAt || "")) > Date.now() - 6 * 3600000)
    return stored.report as MatchCastReport;
  const endpoints = ["fixtures/players", "fixtures/lineups", "fixtures/events"] as const;
  const settled = await Promise.allSettled(endpoints.map((endpoint) =>
    footballApi(endpoint, { fixture: String(fixtureId) })));
  const unavailable: string[] = [];
  settled.forEach((s, i) => { if (s.status === "rejected") unavailable.push(endpoints[i] + ": " + (s.reason instanceof Error ? s.reason.message : "unavailable")); });
  const playersResponse = settled[0].status === "fulfilled" ? settled[0].value : [];
  const lineupsResponse = settled[1].status === "fulfilled" ? settled[1].value : [];
  const eventsResponse = settled[2].status === "fulfilled" ? settled[2].value : [];
  const played = playerEvidence(playersResponse, loserTeamId);
  for (const event of eventsResponse) {
    if (!event || typeof event !== "object") continue;
    const e = event as Record<string, unknown>;
    const team = e.team as Record<string, unknown> | undefined;
    const player = e.player as Record<string, unknown> | undefined;
    if (Number(team?.id) !== loserTeamId) continue;
    const person = played.find((p) => p.id === Number(player?.id));
    if (!person) continue;
    const type = String(e.type || ""), detail = String(e.detail || "");
    if (type === "Goal" && detail === "Own Goal") person.findings.push("Own goal confirmed by match event");
    if (type === "Goal" && detail === "Missed Penalty") person.findings.push("Missed penalty confirmed by match event");
    if (type === "Card" && /red card/i.test(detail)) person.findings.push("Red card confirmed by match event");
    person.findings = [...new Set(person.findings)];
    person.qualifies = person.findings.length > 0;
  }
  const startingXI: MatchCastReport["startingXI"] = [];
  const managers: MatchCastReport["managers"] = [];
  for (const l of lineupsResponse) {
    if (!l || typeof l !== "object") continue;
    const line = l as Record<string, unknown>;
    const team = line.team as Record<string, unknown> | undefined;
    const coach = line.coach as Record<string, unknown> | undefined;
    const teamName = String(team?.name || "Team");
    if (Number.isInteger(Number(coach?.id)) && Number(coach?.id) > 0 && coach?.name)
      managers.push({ team: teamName, id: Number(coach.id), name: String(coach.name) });
    if (Array.isArray(line.startXI)) startingXI.push({
      team: teamName,
      people: line.startXI.map((entry) => {
        const p = (entry as Record<string, unknown>).player as Record<string, unknown> | undefined;
        return p ? { id: Number(p.id), name: String(p.name || ""), position: String(p.pos || "Unknown") } : null;
      }).filter((x): x is { id: number; name: string; position: string } => !!x && Number.isInteger(x.id) && x.id > 0),
    });
  }
  if (!played.length) unavailable.push("Player minutes, match ratings and individual evidence are unavailable from this fixture.");
  if (!startingXI.length) unavailable.push("Provider did not return verified starting XIs.");
  if (!managers.length) unavailable.push("Provider did not return verified match managers.");
  const report: MatchCastReport = {
    fixtureId, checkedAt: new Date().toISOString(), startingXI, managers,
    substitutions: played.filter((p) => !p.started), played,
    suggested: played.filter((p) => p.teamId === loserTeamId && p.qualifies).slice(0, 10),
    unavailable, source: "API-Football /fixtures/players, /fixtures/lineups and /fixtures/events",
  };
  if (settled.some((s) => s.status === "fulfilled")) {
    await cache.updateOne(ownerFilter({ key }), {
      $set: { owner: OWNER, key, report, checkedAt: report.checkedAt, expiresAt: new Date(Date.now() + 72 * 3600000) },
    }, { upsert: true });
  }
  return report;
}
