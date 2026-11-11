"use client";
import { useCallback, useEffect, useState } from "react";
import type { RadarStory, RadarClip, RadarProject, RadarAssignment, RadarStatus } from "@/lib/trend-radar/core";
import { klingReplacementPrompt, captionDrafts, radarStatuses } from "@/lib/trend-radar/core";
import { Copy, Empty, Feedback, Section } from "./shared";
import { readLocalAssets, saveLocalAssets } from "@/lib/trend-radar/local-media";
type Dashboard = {
  stories: RadarStory[]; projects: RadarProject[]; checkedAt: string | null;
  attemptedAt: string | null; failures: string[];
  connected: { rss: boolean; youtube: boolean; ai: boolean; x: boolean };
  ranking: string;
};
async function request<T>(body?: Record<string, unknown>, hours = 24): Promise<T> {
  const res = await fetch(body ? "/api/trend-radar" : "/api/trend-radar?hours=" + hours, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Trend Radar unavailable.");
  return data;
}
const platforms = ["YouTube Shorts", "TikTok", "Instagram Reels", "Facebook Reels", "X"];
const shortDate = (value: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString() : "Unknown";
function storySearch(story: RadarStory) {
  return story.category === "Football"
    ? "football coach funny celebration reaction 10 seconds"
    : story.category === "Entertainment"
      ? "two people funny awkward argument 10 seconds"
      : story.category === "Technology"
        ? "funny surprised office meeting reaction 10 seconds"
        : "three people funny conversation reaction 10 seconds";
}
const initialAssignments: RadarAssignment[] = [
  { role: "the main character", imageTag: "@Image1", imageFilename: "" },
  { role: "the other character", imageTag: "@Image2", imageFilename: "" },
];
function storyUrl(story: RadarStory) { return story.sources[0]?.url || ""; }
export default function TrendRadarWorkspace() {
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [hours, setHours] = useState(24);
  const [category, setCategory] = useState("All");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<RadarStory>();
  const [clips, setClips] = useState<RadarClip[]>([]);
  const [search, setSearch] = useState("");
  const [clip, setClip] = useState<RadarClip>();
  const [clipReport, setClipReport] = useState("");
  const [maxSeconds, setMaxSeconds] = useState(15);
  const [assignments, setAssignments] = useState<RadarAssignment[]>(initialAssignments);
  const [environmentTag, setEnvironmentTag] = useState("");
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RadarStatus>("Discovered");
  const [notes, setNotes] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [savedId, setSavedId] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualHeadline, setManualHeadline] = useState("");
  const [manualCategory, setManualCategory] = useState("Football");
  const [localVideo, setLocalVideo] = useState("");
  const [localVideoName, setLocalVideoName] = useState("");
  const [localVideoFile, setLocalVideoFile] = useState<File>();
  const [localImages, setLocalImages] = useState<Record<string, File>>({});
  const [storedAssets, setStoredAssets] = useState<string[]>([]);
  const [localDuration, setLocalDuration] = useState<number>();
  const [mediaError, setMediaError] = useState("");
  const [previewId, setPreviewId] = useState("");
  const load = useCallback(async (range: number, refresh = false) => {
    const result = await request<Dashboard>(refresh ? { action: "refresh", hours: range } : undefined, range);
    setDashboard(result);
  }, []);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void request<Dashboard>(undefined, hours)
        .then((result) => { if (active) setDashboard(result); })
        .catch((e) => { if (active) setError(e.message); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [hours]);
  useEffect(() => () => { if (localVideo) URL.revokeObjectURL(localVideo); }, [localVideo]);
  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(""); }
  }
  function chooseStory(story: RadarStory) {
    setSelected(story);
    setSearch(storySearch(story));
    setClips([]); setClip(undefined); setClipReport("");
    setAssignments(initialAssignments.map((a) => ({ ...a })));
    setCaptions(captionDrafts(story));
    setStatus("Discovered"); setNotes(""); setPublishedUrl("");
    setSavedId(""); setEnvironmentTag(""); setPreviewId("");
    setLocalVideo(""); setLocalVideoName(""); setLocalVideoFile(undefined); setLocalImages({}); setStoredAssets([]); setLocalDuration(undefined); setMediaError("");
  }
  async function resume(project: RadarProject) {
    chooseStory(project.story);
    setClip(project.clip);
    setAssignments(project.assignments.length ? project.assignments : initialAssignments);
    setEnvironmentTag(project.environmentTag || "");
    setCaptions(project.captions);
    setStatus(project.status);
    setNotes(project.notes);
    setPublishedUrl(project.publishedUrls[0] || "");
    setSavedId(project.id);
    setManualUrl(project.manualVideoUrl || "");
    try {
      const assets = await readLocalAssets(project.id);
      setStoredAssets(assets.map((a) => a.role));
      const video = assets.find((a) => a.role === "video");
      if (video) {
        setLocalVideo(URL.createObjectURL(video.blob));
        setLocalVideoName(video.filename);
        setNotice("Local media restored from this browser. Other devices do not have these files.");
      } else if (project.mediaNote) {
        setNotice("This project has media notes but no video stored in this browser; supply the original owned file again.");
      }
    } catch { setNotice("Local media could not be loaded; saved research and captions remain available."); }
  }
  const prompt = (() => {
    try { return klingReplacementPrompt(assignments, environmentTag); }
    catch (e) { return e instanceof Error ? e.message : "Please review your character assignments."; }
  })();
  const filtered = (dashboard?.stories || []).filter((story) =>
    category === "All" || story.category === category
  );
  return (
    <div className="module-workspace radar">
      <Feedback busy={busy} message={error} />
      {notice && <p role="status" className="module-notice">{notice}</p>}
      <div className="radar-intro">
        <div>
          <strong>Trend Radar · Viral Video Studio</strong>
          <p>Fresh verified-source headlines → clips under 15 seconds → fictional Kling character replacement → ready-to-edit captions.</p>
          <small>Ranking estimates creative usefulness, not social virality. No success or download guarantees.</small>
        </div>
        <button type="button" className="primary" disabled={!!busy} onClick={() => void run("Refreshing news", () => load(hours, true))}>
          Refresh stories
        </button>
      </div>
      <div className="radar-toolbar">
        <label>Story age
          <select aria-label="Story age" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {[6, 12, 24, 48].map((v) => <option key={v} value={v}>Last {v} hours</option>)}
          </select>
        </label>
        <label>Category
          <select aria-label="Story category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {["All", "Football", "Entertainment", "Technology", "World"].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <span>Last successful news check: {dashboard?.checkedAt ? shortDate(dashboard.checkedAt) : "Not yet"}</span>
        <span>YouTube API: {dashboard?.connected.youtube ? "configured" : "not configured"}</span>
      </div>
      {dashboard?.failures?.length ? (
        <p className="module-notice" role="status">Feed warnings: {dashboard.failures.join(" · ")}</p>
      ) : null}
      <Section title="Promising stories">
        <p className="module-note">A small, freshness-ranked selection from public news feeds. People and social popularity are not automatically verified. Original evidence links are provided.</p>
        {!dashboard && !error && <Empty>Loading fresh stories…</Empty>}
        {dashboard && filtered.length === 0 && <Empty>No source-backed stories in this window. Try 48 hours or refresh. Nothing is invented to fill the feed.</Empty>}
        <div className="radar-story-grid">
          {filtered.map((story) => (
            <article className={"radar-story " + (storyUrl(story) === (selected && storyUrl(selected)) ? "chosen" : "")} key={story.id}>
              <div className="radar-story-meta"><span>{story.category}</span><span>{shortDate(story.publishedAt)}</span></div>
              <h3>{story.title}</h3>
              {story.summary && <p>{story.summary}</p>}
              <small>{story.why}</small>
              <div className="radar-sources">{story.sources.map((source) => (
                <a href={source.url} target="_blank" rel="noopener noreferrer" key={source.url}>{source.publisher} ↗</a>
              ))}</div>
              <div className="module-actions">
                <button type="button" className="primary" onClick={() => chooseStory(story)}>Create parody</button>
                <button type="button" className="secondary" disabled={!!busy} onClick={() => void run("Hiding story", async () => {
                  await request({ action: "hide", id: story.id });
                  if (selected?.id === story.id) setSelected(undefined);
                  await load(hours);
                })}>Not relevant</button>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section title="Add a story from X or another source">
        <p className="module-note">Paste a source link and supply its headline. The link is saved as an unverified manual reference; Trend Radar does not claim to have read X posts.</p>
        <form className="radar-manual" onSubmit={(e) => { e.preventDefault(); void run("Adding source", async () => {
          const story = await request<RadarStory>({ action: "manual", title: manualHeadline, url: manualUrl, category: manualCategory });
          chooseStory(story);
          await load(hours);
          setManualHeadline(""); setManualUrl("");
        }); }}>
          <input aria-label="Story headline" placeholder="Headline from the original source" required maxLength={240} value={manualHeadline} onChange={(e) => setManualHeadline(e.target.value)} />
          <input aria-label="Original story URL" type="url" placeholder="https://x.com/... or news article" required value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
          <select aria-label="Manual story category" value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>
            {["Football", "Entertainment", "Technology", "World"].map((v) => <option key={v}>{v}</option>)}
          </select>
          <button className="secondary" type="submit" disabled={!!busy}>Add source</button>
        </form>
      </Section>
      <Section title="Your saved video projects">
        {!dashboard?.projects?.length ? <Empty>No saved projects yet.</Empty> : (
          <div className="radar-projects">
            {dashboard.projects.map((project) => (
              <button key={project.id} type="button" className="secondary radar-project" onClick={() => void resume(project)}>
                <strong>{project.story.title}</strong>
                <span>{project.status} · {shortDate(project.updatedAt)} {project.archived ? "· Archived" : ""}</span>
              </button>
            ))}
          </div>
        )}
      </Section>
      {selected && (
        <Section title="Produce a 9:16 parody · 15 seconds maximum">
          <div className="radar-editor">
            <div className="radar-studio-main">
              <h3>1. Selected story</h3>
              <p><strong>{selected.title}</strong></p>
              <p className="module-note">Confirmed source: {selected.sources.map((s) => s.publisher).join(", ")}. Parody actions are fictional, not factual footage.</p>
              <h3>2. Find a suitable 1–15 second clip</h3>
              <p className="module-note">Reuse the existing official YouTube search integration. Duration is verified using ISO 8601 metadata; dialogue, visible people, portrait aspect and reuse rights are UNKNOWN until independently checked.</p>
              <div className="module-actions" aria-label="Suggested scene searches">
                {["two people arguing funny 10 seconds", "three people dancing celebration 10 seconds", "awkward funny interview 10 seconds"].map((query) => (
                  <button key={query} type="button" className="secondary" onClick={() => setSearch(query)}>{query}</button>
                ))}
              </div>
              <form className="radar-clip-form" onSubmit={(e) => { e.preventDefault(); void run("Searching short videos", async () => {
                const result = await request<{ clips: RadarClip[]; searched: number; rejectedByDuration: number; note: string }>({
                  action: "clips", query: search, maxSeconds,
                });
                setClips(result.clips); setClipReport(result.note + " " + result.searched + " YouTube result(s) checked; " + result.rejectedByDuration + " excluded by exact duration.");
              }); }}>
                <input aria-label="Video scene search" value={search} maxLength={160} onChange={(e) => setSearch(e.target.value)} />
                <label>Maximum duration
                  <select value={maxSeconds} onChange={(e) => setMaxSeconds(Number(e.target.value))}>
                    {[5, 8, 10, 12, 15].map((n) => <option key={n} value={n}>{n} seconds</option>)}
                  </select>
                </label>
                <button className="primary" disabled={!!busy || !dashboard?.connected.youtube} type="submit">Find clips</button>
              </form>
              {!dashboard?.connected.youtube && <p className="module-notice">Add your existing YOUTUBE_API_KEY to enable official video discovery. No extra service is needed.</p>}
              {clipReport && <p className="module-note">{clipReport}</p>}
              <div className="radar-clip-grid">
                {clips.map((candidate) => (
                  <article className={"radar-clip " + (clip?.id === candidate.id ? "chosen" : "")} key={candidate.id}>
                    {previewId === candidate.id ? (
                      <iframe title={"YouTube preview: " + candidate.title} src={"https://www.youtube-nocookie.com/embed/" + candidate.id} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
                    ) : (
                      <button className="radar-thumb" type="button" onClick={() => setPreviewId(candidate.id)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={"YouTube thumbnail for " + candidate.title} src={candidate.thumbnail} loading="lazy" />
                        <span>Preview with original audio</span>
                      </button>
                    )}
                    <b>{candidate.title}</b>
                    <p>{candidate.seconds}s verified · {shortDate(candidate.publishedAt)}</p>
                    <small>Audio: UNKNOWN · People: UNKNOWN · License: UNKNOWN</small>
                    <div className="module-actions">
                      <button className="secondary" type="button" onClick={() => { setClip(candidate); setStatus("Clip Review"); }}>Use reference</button>
                      <a href={candidate.url} target="_blank" rel="noopener noreferrer">Open original ↗</a>
                    </div>
                  </article>
                ))}
              </div>
              <h3>3. Optional authorized local video preview</h3>
              <p className="module-note">Select a video you own or may legally edit. You can save it on this browser using private IndexedDB storage; it is never uploaded to Launchpad, is not synced between devices, and can be cleared with browser site data. Duration can be checked; speech, people and licensing remain unverified.</p>
              <input aria-label="Owned or licensed local video" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                setLocalVideo(""); setLocalVideoName(""); setLocalVideoFile(undefined); setLocalDuration(undefined); setMediaError("");
                if (!file) return;
                if (file.size > 120 * 1024 * 1024) { setMediaError("Local preview file exceeds 120 MB."); return; }
                setLocalVideo(URL.createObjectURL(file)); setLocalVideoName(file.name); setLocalVideoFile(file);
              }} />
              {localVideo && <div className="radar-local-media">
                <video controls playsInline src={localVideo} onLoadedMetadata={(e) => {
                  const media = e.currentTarget;
                  const seconds = media.duration;
                  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 15) {
                    setMediaError("Local media must be 1–15 seconds. This file is not suitable for the default workflow.");
                    setLocalDuration(undefined);
                    return;
                  }
                  setMediaError("");
                  setLocalDuration(seconds);
                  setNotice("Local video metadata checked. Audible speech and character suitability remain unverified.");
                }} />
                <p>{localVideoName} · {localDuration !== undefined ? localDuration.toFixed(2) + "s verified from browser metadata" : "Duration unverified"} · Local preview only</p>
              </div>}
              {mediaError && <p role="alert" className="module-error">{mediaError}</p>}
              <p><strong>Chosen @Video1:</strong> {clip ? clip.title + " (" + clip.seconds + "s)" : localDuration !== undefined ? localVideoName + " (local file; not persisted)" : "None yet"}</p>
              <h3>4. Character replacement assignments</h3>
              <p className="module-note">Assign each original person a distinct reference image. Optional selected image files are saved privately in this browser when you save the project, not uploaded or sent to Kling.</p>
              {assignments.map((a, i) => (
                <div className="radar-assignment" key={i}>
                  <input aria-label={"Original role " + (i + 1)} value={a.role} maxLength={80} onChange={(e) => setAssignments((prev) => prev.map((v, j) => j === i ? { ...v, role: e.target.value } : v))} />
                  <select aria-label={"Image tag " + (i + 1)} value={a.imageTag} onChange={(e) => setAssignments((prev) => prev.map((v, j) => j === i ? { ...v, imageTag: e.target.value } : v))}>
                    {Array.from({ length: 12 }, (_, j) => "@Image" + (j + 1)).map((v) => <option key={v}>{v}</option>)}
                  </select>
                  <div className="radar-image-field">
                    <input aria-label={"Image filename " + (i + 1)} placeholder="Reference image filename" value={a.imageFilename} maxLength={200} onChange={(e) => setAssignments((prev) => prev.map((v, j) => j === i ? { ...v, imageFilename: e.target.value } : v))} />
                    <input aria-label={"Select character image " + (i + 1)} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => {
                      const file = e.currentTarget.files?.[0]; if (!file) return;
                      setLocalImages((old) => ({ ...old, [a.imageTag]: file }));
                      setAssignments((old) => old.map((v, j) => j === i ? { ...v, imageFilename: file.name } : v));
                    }} />
                    {storedAssets.includes(a.imageTag) && !localImages[a.imageTag] && <small>Saved in this browser</small>}
                  </div>
                  {assignments.length > 1 && <button className="secondary" type="button" onClick={() => setAssignments((v) => v.filter((_, j) => j !== i))}>Remove</button>}
                </div>
              ))}
              <button type="button" className="secondary" disabled={assignments.length >= 10} onClick={() => {
                const unused = Array.from({ length: 12 }, (_, i) => "@Image" + (i + 1)).find((v) => !assignments.some((a) => a.imageTag === v));
                if (unused) setAssignments((v) => [...v, { role: "another character", imageTag: unused, imageFilename: "" }]);
              }}>Add character or background dancer</button>
              <label className="radar-inline-label">Environment image tag (optional, separate from character tags)
                <input placeholder="@Image3" value={environmentTag} maxLength={20} onChange={(e) => setEnvironmentTag(e.target.value)} />
              </label>
              <h3>5. Kling character replacement prompt</h3>
              <div className="radar-prompt"><pre>{prompt}</pre><Copy value={prompt} /></div>
              <h3>6. Captions adapted to each platform</h3>
              {platforms.map((platform) => (
                <div className="radar-caption" key={platform}>
                  <label><strong>{platform}</strong>
                    <textarea value={captions[platform] || ""} maxLength={1000} rows={3} onChange={(e) => setCaptions((prev) => ({ ...prev, [platform]: e.target.value }))} />
                  </label>
                  <Copy value={captions[platform] || ""} />
                </div>
              ))}
              <h3>7. Save production progress</h3>
              <div className="radar-save-controls">
                <label>Status
                  <select value={status} onChange={(e) => setStatus(e.target.value as RadarStatus)}>
                    {radarStatuses.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label>Published video URL
                  <input type="url" placeholder="https://youtube.com/shorts/..." value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} />
                </label>
              </div>
              <label className="radar-inline-label">Production notes / performance
                <textarea value={notes} maxLength={4000} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="What happened, what worked, and what to improve" />
              </label>
              <button type="button" className="primary" disabled={!!busy} onClick={() => void run("Saving project", async () => {
                if (localVideoFile && localDuration === undefined) throw new Error("The uploaded video must be between 1 and 15 seconds before saving.");
                const saved = await request<RadarProject>({
                  action: "save", id: savedId || undefined, story: selected, clip: clip || null,
                  manualVideoUrl: "", assignments, environmentTag, captions, status, notes,
                  publishedUrls: publishedUrl.trim() ? [publishedUrl.trim()] : [],
                  mediaNote: localVideoName ? "Browser-local source: " + localVideoName + ". File not uploaded or synced." : "",
                });
                setSavedId(saved.id);
                const assets = Object.entries(localImages).map(([role, file]) => ({ role, file }));
                if (localVideoFile) assets.push({ role: "video", file: localVideoFile });
                let mediaSaved = false;
                try {
                  await saveLocalAssets(saved.id, assets);
                  mediaSaved = true;
                  if (assets.length) setStoredAssets((prior) => [...new Set([...prior, ...assets.map((a) => a.role)])]);
                } catch (e) { setNotice("Project metadata saved, but media was NOT saved locally: " + (e instanceof Error ? e.message : "Storage unavailable.")); }
                await load(hours);
                if (mediaSaved) setNotice(assets.length ? "Project and selected media saved on this browser only. Keep separate backups for Kling." : "Project saved. Existing browser-local media is unchanged.");
              })}>Save Trend Radar project</button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
