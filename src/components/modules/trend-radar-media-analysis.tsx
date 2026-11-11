"use client";
import { useState } from "react";
import {
  analyzeAuthorizedVideo,
  type LocalVideoAnalysis,
  type RoleMoment,
} from "@/lib/trend-radar/browser-analysis";
import type { RadarAssignment } from "@/lib/trend-radar/core";
export default function RadarMediaAnalysis({
  file,
  assignments,
  timeline,
  onTimeline,
}: {
  file?: File;
  assignments: RadarAssignment[];
  timeline: RoleMoment[];
  onTimeline: (rows: RoleMoment[]) => void;
}) {
  const [report, setReport] = useState<LocalVideoAnalysis>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = (i: number, patch: Partial<RoleMoment>) =>
    onTimeline(timeline.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  return (
    <section className="module-panel">
      <h4>Optional private video analysis &amp; performer timeline</h4>
      <p>
        Inspects the authorized file on this device. No video is uploaded. Audio
        energy and sampled scene changes can be measured; automatic speech,
        laughter and person identity remain UNKNOWN.
      </p>
      <button
        className="secondary"
        type="button"
        disabled={!file || busy}
        onClick={() => {
          if (!file) return;
          setBusy(true);
          setError("");
          void analyzeAuthorizedVideo(file)
            .then(setReport)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Inspecting local video…" : "Analyze authorized video locally"}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <div className="module-note">
          <p>
            {report.seconds.toFixed(2)}s · {report.sampledFrames} sampled frames
            · possible cuts at{" "}
            {report.sceneChanges.length
              ? report.sceneChanges.map((t) => t + "s").join(", ")
              : "none detected"}
          </p>
          <p>
            Audio energy: {report.audio.signal}{" "}
            {report.audio.rmsDb === null
              ? ""
              : report.audio.rmsDb + " dBFS (RMS)"}
            . {report.audio.reason} People, speech and laughter: UNKNOWN.
          </p>
          {report.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      <p>
        Keep the same performer ID before and after a crossing. Positions are
        timestamped observations, not identities. Entries below are manually
        supplied and editable.
      </p>
      {timeline.map((row, i) => (
        <div className="radar-clip-form" key={i}>
          <label>
            Performer{" "}
            <select
              aria-label={"Timeline performer " + (i + 1)}
              value={row.characterId}
              onChange={(e) => edit(i, { characterId: e.target.value })}
            >
              {assignments.map((a) => (
                <option
                  key={a.characterId || a.imageTag}
                  value={a.characterId || a.imageTag}
                >
                  {a.role} · {a.characterId || a.imageTag}
                </option>
              ))}
            </select>
          </label>
          <label>
            From seconds{" "}
            <input
              type="number"
              min={0}
              max={15}
              step={0.1}
              value={row.start}
              onChange={(e) => edit(i, { start: Number(e.target.value) })}
            />
          </label>
          <label>
            To seconds{" "}
            <input
              type="number"
              min={0}
              max={15}
              step={0.1}
              value={row.end}
              onChange={(e) => edit(i, { end: Number(e.target.value) })}
            />
          </label>
          <label>
            Screen position{" "}
            <input
              maxLength={100}
              value={row.position}
              onChange={(e) => edit(i, { position: e.target.value })}
            />
          </label>
          <label>
            Action / crossing{" "}
            <input
              maxLength={300}
              value={row.action}
              onChange={(e) => edit(i, { action: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => onTimeline(timeline.filter((_, j) => i !== j))}
          >
            Remove interval
          </button>
        </div>
      ))}
      <button
        className="secondary"
        type="button"
        disabled={!assignments.length || timeline.length >= 80}
        onClick={() =>
          onTimeline([
            ...timeline,
            {
              characterId:
                assignments[0].characterId || assignments[0].imageTag,
              start: 0,
              end: 1,
              position: "",
              action: "",
            },
          ])
        }
      >
        Add timestamped performer role
      </button>
    </section>
  );
}
