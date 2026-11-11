"use client";
import { useEffect, useState } from "react";
import type { RadarClip, RadarStory } from "@/lib/trend-radar/core";
import {
  matchingTemplates,
  type ComedyTemplate,
} from "@/lib/trend-radar/comedy-core";
import { readLocalAssets } from "@/lib/trend-radar/local-media";
type ClipResult = {
  clips: RadarClip[];
  checked: number;
  rejectedByDuration: number;
  rejectedMissingMetadata: number;
  note: string;
  cached: boolean;
  error?: string;
  pages?: number;
  rejectedDuplicates?: number;
};
function context(story: RadarStory) {
  if (/goalkeeper|keeper/i.test(story.title)) return "goalkeeper";
  if (/manager|coach|sack/i.test(story.title)) return "manager";
  if (/rival|derby/i.test(story.title)) return "rivalry";
  if (/win|champion|celebrat/i.test(story.title)) return "winning";
  return story.category === "Football" ? "defeat" : "entertainment";
}
export default function StoryVideoOptions({
  story,
  active,
  onSelect,
  onLocalSelect,
}: {
  story: RadarStory;
  active: boolean;
  onSelect: (story: RadarStory, clip: RadarClip) => void;
  onLocalSelect: (
    story: RadarStory,
    template: ComedyTemplate,
    file: File,
  ) => void;
}) {
  const kind = context(story);
  const [report, setReport] = useState<ClipResult>();
  const [savedTemplates, setSavedTemplates] = useState<ComedyTemplate[]>([]);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const reload = () => {
      void fetch("/api/trend-radar?scope=templates")
        .then((r) => r.json())
        .then((data) => {
          if (mounted) setSavedTemplates(data.templates || []);
        })
        .catch(() => {});
    };
    reload();
    window.addEventListener("launchpad-radar-library-updated", reload);
    return () => {
      mounted = false;
      window.removeEventListener("launchpad-radar-library-updated", reload);
    };
  }, [active]);
  useEffect(() => {
    if (!active || !savedTemplates.length) return;
    let live = true;
    const results: string[] = [];
    void Promise.all(
      matchingTemplates(savedTemplates, kind)
        .slice(0, 3)
        .map(async (template) => {
          const assets = await readLocalAssets(template.id);
          const video = assets.find((asset) => asset.role === "video");
          if (!video) return;
          const url = URL.createObjectURL(video.blob);
          results.push(url);
          if (live)
            setLocalPreviews((prev) => ({ ...prev, [template.id]: url }));
        }),
    ).catch(() => {});
    return () => {
      live = false;
      for (const url of results) URL.revokeObjectURL(url);
    };
  }, [active, savedTemplates, kind]);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const timer = window.setTimeout(() => {
      void fetch("/api/trend-radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "story-clips", kind }),
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Search failed");
          if (mounted) setReport(data);
        })
        .catch((e) => {
          if (mounted) setError(e.message);
        });
    }, 0);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [active, kind]);
  if (!active)
    return (
      <p className="module-note">
        Open this story for video options; the first few opportunities are
        searched automatically within quota limits.
      </p>
    );
  return (
    <div className="radar-inline-clips">
      <strong>Actual video templates</strong>
      {!!matchingTemplates(savedTemplates, kind).length && (
        <div className="radar-inline-clip-grid">
          {matchingTemplates(savedTemplates, kind)
            .slice(0, 3)
            .map((template) => (
              <article key={template.id}>
                <b>Approved personal template · {template.title}</b>
                {localPreviews[template.id] ? (
                  <video
                    src={localPreviews[template.id]}
                    controls
                    playsInline
                    style={{ width: "100%" }}
                  />
                ) : (
                  <small>Local video not found in this browser</small>
                )}
                <small>
                  {template.seconds}s · {template.width}×{template.height} ·{" "}
                  {template.performers === null
                    ? "people UNKNOWN"
                    : template.performers + " people (owner-confirmed)"}{" "}
                  · {template.rights}
                </small>
                <button
                  type="button"
                  className="primary"
                  disabled={!localPreviews[template.id]}
                  onClick={() =>
                    void readLocalAssets(template.id).then((rows) => {
                      const asset = rows.find((row) => row.role === "video");
                      if (asset)
                        onLocalSelect(
                          story,
                          template,
                          new File([asset.blob], asset.filename, {
                            type: asset.mime,
                          }),
                        );
                    })
                  }
                >
                  Use authorized clip
                </button>
              </article>
            ))}
        </div>
      )}
      {error && (
        <p className="module-note">
          Live YouTube clips unavailable: {error}. Reusable owned templates
          remain accessible below.
        </p>
      )}
      {!report && !error && <small>Checking short real videos…</small>}
      {report && !report.clips.length && (
        <p className="module-note">
          No qualifying 1–15s clip found in the bounded official YouTube search
          ({report.checked} inspected). No fake placeholders are shown.
        </p>
      )}
      {report?.error && (
        <p className="module-notice">
          Partial search: {report.error}. Earlier checked clips are preserved.
        </p>
      )}
      {report && (
        <small>
          {report.checked} actual video details checked ·{" "}
          {report.rejectedByDuration} rejected by duration ·{" "}
          {report.rejectedMissingMetadata} missing duration ·
          licenses/audio/performers UNKNOWN
        </small>
      )}
      <div className="radar-inline-clip-grid">
        {(report?.clips || []).slice(0, 3).map((clip) => (
          <article key={clip.id}>
            {preview === clip.id ? (
              <iframe
                src={"https://www.youtube-nocookie.com/embed/" + clip.id}
                title={clip.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                className="radar-thumb"
                onClick={() => setPreview(clip.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={clip.thumbnail} alt={clip.title} loading="lazy" />
                <span>Preview original audio</span>
              </button>
            )}
            <b>{clip.title}</b>
            <small>
              {clip.seconds}s · orientation UNKNOWN · editing rights UNKNOWN
            </small>
            <p>
              Possible fictional reaction or comedy template; suitability must
              be visually checked.
            </p>
            <div className="module-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => onSelect(story, clip)}
              >
                Choose clip
              </button>
              <a href={clip.url} target="_blank" rel="noopener noreferrer">
                Source ↗
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
