"use client";
import { useEffect, useState } from "react";
import type { HumiliationFixture, MatchCastReport, PlayedPerson } from "@/lib/trend-radar/football-core";
import type { RadarStory, RadarClip } from "@/lib/trend-radar/core";
import StoryVideoOptions from "./trend-radar-story-videos";
import type { ComedyTemplate } from "@/lib/trend-radar/comedy-core";
import { Section } from "./shared";
type Result = { fixtures: HumiliationFixture[]; checkedAt: string | null; errors: string[]; connected: boolean };
async function api<T>(body: Record<string, unknown> | null, hours = 24): Promise<T> {
  const response = await fetch(body ? "/api/trend-radar" : "/api/trend-radar?scope=football&hours=" + hours, {
    method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Football source unavailable.");
  return payload;
}
export function fixtureAsStory(fixture: HumiliationFixture): RadarStory {
  return {
    id: "football:" + fixture.id,
    title: fixture.loser.name + " lose " + fixture.homeGoals + "–" + fixture.awayGoals + " to " + fixture.winner.name,
    summary: fixture.reason + " League: " + fixture.league + ".",
    category: "Football",
    sources: [{ publisher: "API-Football fixture ID " + fixture.id, url: "https://www.api-football.com/", publishedAt: fixture.kickoff }],
    publishedAt: fixture.kickoff, checkedAt: new Date().toISOString(), score: 0,
    why: "A verified heavy defeat could suit a fictional dressing-room or group dance parody. Player performances require separate evidence.",
    people: [],
  };
}
export default function FootballHumiliationPanel({
  hours, onPick, onVideoPick, onLocalVideoPick, youtubeEnabled,
}: {
  hours: number;
  onPick: (story: RadarStory, cast: { role: string; identity: string; characterId: string }[]) => void;
  onVideoPick: (story: RadarStory, clip: RadarClip) => void;
  onLocalVideoPick: (story: RadarStory, template: ComedyTemplate, file: File) => void;
  youtubeEnabled: boolean;
}) {
  const [data, setData] = useState<Result>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<HumiliationFixture>();
  const [report, setReport] = useState<MatchCastReport>();
  const [castIds, setCastIds] = useState<number[]>([]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void api<Result>(null, hours).then((result) => { if (active) setData(result); }).catch((e) => {
        if (active) setError(e.message);
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [hours]);
  const pick = async (match: HumiliationFixture) => {
    setSelected(match); setReport(undefined); setCastIds([]); setError(""); setBusy("Inspecting lineup and match evidence");
    try {
      const result = await api<MatchCastReport>({ action: "football-cast", fixtureId: match.id, loserTeamId: match.loser.id });
      setReport(result);
      setCastIds(result.suggested.slice(0, 5).map((p) => p.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Match cast unavailable."); }
    finally { setBusy(""); }
  };
  const toggle = (id: number, checked: boolean) => setCastIds((values) =>
    checked ? [...new Set([...values, id])].slice(0, 10) : values.filter((v) => v !== id));
  const confirm = () => {
    if (!selected) return;
    const people: { role: string; identity: string; characterId: string }[] = [];
    const manager = report?.managers.find((m) => m.team === selected.loser.name);
    if (manager) people.push({ role: "the manager", identity: manager.name, characterId: "coach-" + manager.id });
    for (const person of report?.played || []) if (castIds.includes(person.id)) {
      people.push({ role: "the player " + person.name, identity: person.name, characterId: "player-" + person.id });
    }
    onPick(fixtureAsStory(selected), people.slice(0, 11));
  };
  return (
    <Section title="Football Humiliation Radar · Verified results">
      <p className="module-note">Only completed, provider-confirmed defeats by at least three goals qualify automatically. Unexpected narrow losses, errors leading to goals, big chances, losing streaks, opposition quality and manager pressure require additional data or match reports and are not inferred from scorelines.</p>
      {data?.errors?.length ? <p className="module-notice">{data.errors.join(" · ")}</p> : null}
      {error && <p role="alert" className="module-error">{error}</p>}
      <div className="module-actions">
        <button className="secondary" type="button" disabled={!!busy || !data?.connected} onClick={() => {
          setBusy("Refreshing match results"); setError("");
          void api<Result>({ action: "football-refresh", hours }).then(setData).catch((e) => setError(e.message)).finally(() => setBusy(""));
        }}>Refresh completed results</button>
        <small>Provider: API-Football · Last check {data?.checkedAt ? new Date(data.checkedAt).toLocaleString() : "unavailable"}</small>
      </div>
      {busy && <p role="status" className="module-note">{busy}…</p>}
      {data?.connected && !data.fixtures.length && <p className="module-note">No verified heavy defeats found in this window. This is common during an international break, or when the provider does not cover the matches. No scorelines will be invented.</p>}
      <div className="radar-results">
        {(data?.fixtures || []).slice(0, 10).map((match, index) => (
          <article className={"radar-match-card " + (selected?.id === match.id ? "chosen" : "")} key={match.id}>
            <p className="radar-match-label">{match.league} · {new Date(match.kickoff).toLocaleString()}</p>
            <strong>{match.home.name} {match.homeGoals}–{match.awayGoals} {match.away.name}</strong>
            <p>{match.loser.name} lost by {match.margin} goals. Verified completed result.</p>
            <small>Fixture #{match.id} · <a target="_blank" rel="noopener noreferrer" href="https://www.api-football.com/">API-Football source</a></small>
            <button className="primary" type="button" disabled={!!busy} onClick={() => void pick(match)}>Inspect players / Comedy Cast</button>
            <StoryVideoOptions story={fixtureAsStory(match)} active={index < 3 && youtubeEnabled} onSelect={onVideoPick} onLocalSelect={onLocalVideoPick} />
          </article>
        ))}
      </div>
      {selected && (
        <div className="radar-cast-panel">
          <h3>Comedy Cast — {selected.loser.name}</h3>
          {!report ? <p className="module-note">Player performance data not loaded. You can use the verified match result without alleging an individual performed poorly.</p> : (
            <>
              {report.unavailable.length > 0 && <p className="module-notice">{report.unavailable.join(" · ")}</p>}
              {report.managers.map((m) => <p key={m.id}><strong>Manager:</strong> {m.name} — {m.team}, lineup-sourced. The result alone is not evidence of personal responsibility.</p>)}
              {report.startingXI.map((l) => <details key={l.team}><summary>Verified starting XI — {l.team}</summary><p>{l.people.map((p) => p.name).join(", ") || "Unavailable"}</p></details>)}
              <h4>Players who actually appeared</h4>
              <p className="module-note">A rating is provider-supplied, not independently verified. Only low ratings (6.0/10 or below) or explicit match-event findings trigger an evidence-based suggestion. You may also select other confirmed participants without alleging poor performance.</p>
              <div className="radar-cast-people">
                {report.played.filter((p) => p.teamId === selected.loser.id).map((p: PlayedPerson) => (
                  <label className="radar-cast-person" key={p.id}>
                    <input type="checkbox" checked={castIds.includes(p.id)} disabled={!castIds.includes(p.id) && castIds.length >= 10} onChange={(e) => toggle(p.id, e.target.checked)} />
                    <span><strong>{p.name}</strong> · {p.position} · {p.minutes} min · {p.started === true ? "starter" : p.started === false ? "substitute" : "lineup role UNKNOWN"} · Rating {p.rating === null ? "UNKNOWN" : p.rating.toFixed(1) + "/10"}<small>{p.findings.length ? p.findings.join("; ") : "No individual underperformance evidence reported"} · API-Football</small></span>
                  </label>
                ))}
              </div>
              {!report.played.some((p) => p.teamId === selected.loser.id) && <p className="module-note">No confirmed player appearances are available; do not guess a Comedy Cast.</p>}
            </>
          )}
          <button className="primary" onClick={confirm} type="button">
            Create fictional comedy with {Math.min(11, castIds.length + Number(!!report?.managers.some((m) => m.team === selected.loser.name)))} cast member(s)
          </button>
        </div>
      )}
    </Section>
  );
}
