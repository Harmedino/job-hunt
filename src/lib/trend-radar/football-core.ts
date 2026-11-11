export type FixtureTeam = { id: number; name: string };
export type HumiliationFixture = {
  id: number;
  kickoff: string;
  league: string;
  home: FixtureTeam;
  away: FixtureTeam;
  homeGoals: number;
  awayGoals: number;
  loser: FixtureTeam;
  winner: FixtureTeam;
  margin: number;
  reason: string;
  level: "heavy defeat";
  source: "API-Football";
};
export type PlayedPerson = {
  id: number;
  name: string;
  teamId: number;
  teamName: string;
  position: string;
  minutes: number;
  started: boolean;
  rating: number | null;
  findings: string[];
  qualifies: boolean;
  source: "API-Football players statistics";
};
export type MatchCastReport = {
  fixtureId: number;
  checkedAt: string;
  startingXI: { team: string; people: { id: number; name: string; position: string }[] }[];
  managers: { team: string; id: number; name: string }[];
  substitutions: PlayedPerson[];
  played: PlayedPerson[];
  suggested: PlayedPerson[];
  unavailable: string[];
  source: string;
};
export function classifyHumiliation(fixture: unknown, now = Date.now()): HumiliationFixture | null {
  if (!fixture || typeof fixture !== "object") return null;
  const x = fixture as Record<string, unknown>;
  const info = x.fixture as Record<string, unknown> | undefined;
  const teams = x.teams as Record<string, Record<string, unknown>> | undefined;
  const goals = x.goals as Record<string, unknown> | undefined;
  const league = x.league as Record<string, unknown> | undefined;
  const kickoff = typeof info?.date === "string" ? info.date : "";
  const date = Date.parse(kickoff);
  const code = (info?.status as Record<string, unknown> | undefined)?.short;
  const home = teams?.home, away = teams?.away;
  const h = goals?.home, a = goals?.away;
  const id = Number(info?.id);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(date) || date > now ||
      !["FT", "AET"].includes(String(code)) ||
      !Number.isInteger(h) || !Number.isInteger(a) ||
      !Number.isInteger(home?.id) || !Number.isInteger(away?.id)) return null;
  const diff = Math.abs(Number(h) - Number(a));
  // A 3-goal margin is meaningful evidence; never label a close defeat embarrassing.
  if (diff < 3) return null;
  const loser = Number(h) < Number(a) ? home : away;
  const winner = Number(h) > Number(a) ? home : away;
  if (!loser || !winner) return null;
  const loserTeam = { id: Number(loser.id), name: String(loser.name || "Unknown team") };
  const winnerTeam = { id: Number(winner.id), name: String(winner.name || "Unknown team") };
  return {
    id, kickoff, league: String(league?.name || "Competition"),
    home: { id: Number(home!.id), name: String(home!.name || "Home") },
    away: { id: Number(away!.id), name: String(away!.name || "Away") },
    homeGoals: Number(h), awayGoals: Number(a), loser: loserTeam, winner: winnerTeam,
    margin: diff, reason: loserTeam.name + " lost " + h + "–" + a +
      " (home–away) to " + winnerTeam.name + ". Goal margin: " + diff +
      ". Match score alone does NOT show individual poor performances.",
    level: "heavy defeat", source: "API-Football",
  };
}
function statsNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
export function playerEvidence(response: unknown, losingTeamId: number): PlayedPerson[] {
  if (!Array.isArray(response)) return [];
  const persons: PlayedPerson[] = [];
  for (const team of response.slice(0, 2)) {
    if (!team || typeof team !== "object") continue;
    const item = team as Record<string, unknown>;
    const teamInfo = item.team as Record<string, unknown> | undefined;
    const teamId = statsNumber(teamInfo?.id);
    if (teamId === null || !Array.isArray(item.players)) continue;
    for (const entry of item.players) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const player = row.player as Record<string, unknown> | undefined;
      const block = Array.isArray(row.statistics) ? row.statistics[0] as Record<string, unknown> | undefined : undefined;
      const games = block?.games as Record<string, unknown> | undefined;
      const minutes = statsNumber(games?.minutes) || 0;
      const playerId = statsNumber(player?.id);
      if (!playerId || minutes <= 0) continue; // never recommend bench players who did not enter
      const rating = statsNumber(games?.rating);
      const cards = block?.cards as Record<string, unknown> | undefined;
      const penalty = block?.penalty as Record<string, unknown> | undefined;
      const goals = block?.goals as Record<string, unknown> | undefined;
      const findings: string[] = [];
      if (teamId === losingTeamId) {
        if (rating !== null && rating <= 6.0)
          findings.push("Provider match rating " + rating.toFixed(1) + "/10");
        const red = statsNumber(cards?.red) || 0;
        if (red > 0) findings.push("Red card recorded");
        const missed = statsNumber(penalty?.missed) || 0;
        if (missed > 0) findings.push("Penalty missed: " + missed);
        const ownGoals = statsNumber(goals?.own);
        if (ownGoals !== null && ownGoals > 0) findings.push("Own goal: " + ownGoals);
      }
      persons.push({
        id: playerId, name: String(player?.name || "Unknown player"),
        teamId, teamName: String(teamInfo?.name || "Team"),
        position: String(games?.position || "Unknown"), minutes,
        started: games?.substitute === false,
        rating, findings, qualifies: teamId === losingTeamId && findings.length > 0,
        source: "API-Football players statistics",
      });
    }
  }
  return persons.sort((a, b) => a.teamId - b.teamId || (a.rating ?? 99) - (b.rating ?? 99));
}
export function scoringForOpportunity(input: {
  storyFreshness: number;
  verifiedMatch: boolean;
  clipVerified: boolean;
  rightsApproved: boolean;
  eligibleCast: number;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = Math.max(0, Math.min(30, input.storyFreshness));
  if (input.verifiedMatch) { score += 25; reasons.push("Scoreline verified by football data provider"); }
  if (input.clipVerified) { score += 20; reasons.push("1–15s comedy template duration verified"); }
  if (input.rightsApproved) { score += 20; reasons.push("Owner-confirmed authorized reuse"); }
  if (input.eligibleCast > 0) { score += 5; reasons.push("Played characters with documented performance evidence"); }
  return { score, reasons };
}
