"use client";
import { useEffect, useState } from "react";
import type { RadarClip, RadarStory } from "@/lib/trend-radar/core";
type ClipResult = { clips: RadarClip[]; checked: number; rejectedByDuration: number; rejectedMissingMetadata: number; note: string; cached: boolean };
function context(story: RadarStory) {
  if (/goalkeeper|keeper/i.test(story.title)) return "goalkeeper";
  if (/manager|coach|sack/i.test(story.title)) return "manager";
  if (/rival|derby/i.test(story.title)) return "rivalry";
  if (/win|champion|celebrat/i.test(story.title)) return "winning";
  return story.category === "Football" ? "defeat" : "entertainment";
}
export default function StoryVideoOptions({
  story, active, onSelect,
}: {
  story: RadarStory;
  active: boolean;
  onSelect: (story: RadarStory, clip: RadarClip) => void;
}) {
  const [report, setReport] = useState<ClipResult>();
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const timer = window.setTimeout(() => {
      void fetch("/api/trend-radar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "story-clips", kind: context(story) }),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Search failed");
        if (mounted) setReport(data);
      }).catch((e) => { if (mounted) setError(e.message); });
    }, 0);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [active, story]);
  if (!active) return <p className="module-note">Open this story for video options; the first few opportunities are searched automatically within quota limits.</p>;
  return (
    <div className="radar-inline-clips">
      <strong>Actual video templates</strong>
      {error && <p className="module-note">Live YouTube clips unavailable: {error}. Reusable owned templates remain accessible below.</p>}
      {!report && !error && <small>Checking short real videos…</small>}
      {report && !report.clips.length && <p className="module-note">No qualifying 1–15s clip found in the bounded official YouTube search ({report.checked} inspected). No fake placeholders are shown.</p>}
      {report && <small>{report.checked} actual video details checked · {report.rejectedByDuration} rejected by duration · {report.rejectedMissingMetadata} missing duration · licenses/audio/performers UNKNOWN</small>}
      <div className="radar-inline-clip-grid">
        {(report?.clips || []).slice(0, 3).map((clip) => (
          <article key={clip.id}>
            {preview === clip.id ? <iframe src={"https://www.youtube-nocookie.com/embed/" + clip.id} title={clip.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /> :
              <button type="button" className="radar-thumb" onClick={() => setPreview(clip.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={clip.thumbnail} alt={clip.title} loading="lazy" /><span>Preview original audio</span>
              </button>}
            <b>{clip.title}</b>
            <small>{clip.seconds}s · orientation UNKNOWN · editing rights UNKNOWN</small>
            <p>Possible fictional reaction or comedy template; suitability must be visually checked.</p>
            <div className="module-actions">
              <button className="secondary" type="button" onClick={() => onSelect(story, clip)}>Choose clip</button>
              <a href={clip.url} target="_blank" rel="noopener noreferrer">Source ↗</a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
