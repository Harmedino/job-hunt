"use client";
import { useEffect, useState } from "react";
import { templateCategories, matchingTemplates, type ComedyTemplate } from "@/lib/trend-radar/comedy-core";
import { saveLocalAssets, readLocalAssets } from "@/lib/trend-radar/local-media";
import { inspectOwnedAudioTrack, type TrackInspection } from "@/lib/trend-radar/media-inspect";
type Props = {
  kind: string;
  onSelect: (template: ComedyTemplate, file: File) => void;
  onLoaded?: (templates: ComedyTemplate[]) => void;
};
export default function ComedyTemplateLibrary({ kind, onSelect, onLoaded }: Props) {
  const [templates, setTemplates] = useState<ComedyTemplate[]>([]);
  const [file, setFile] = useState<File>();
  const [sourceUrl, setSourceUrl] = useState("");
  const [seconds, setSeconds] = useState<number>();
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [audio, setAudio] = useState<TrackInspection>({ audioTrack: "unknown", reason: "Not inspected" });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof templateCategories)[number]>("Group dancing");
  const [performers, setPerformers] = useState("");
  const [speech, setSpeech] = useState("unknown");
  const [rights, setRights] = useState("owner-confirmed");
  const [evidence, setEvidence] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function reload() {
    const result = await fetch("/api/trend-radar?scope=templates", { cache: "no-store" });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || "Library unavailable");
    const items = data.templates as ComedyTemplate[];
    setTemplates(items); onLoaded?.(items);
  }
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { if (active) void reload().catch((e) => setError(e.message)); }, 0);
    return () => { active = false; window.clearTimeout(timer); };
    // The library is loaded once, and then explicitly reloaded after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = async (template: ComedyTemplate) => {
    setError("");
    try {
      const assets = await readLocalAssets(template.id);
      const asset = assets.find((a) => a.role === "video");
      if (!asset) throw new Error("This browser no longer has the original video. Re-import the licensed file before use.");
      onSelect(template, new File([asset.blob], asset.filename, { type: asset.mime }));
    } catch (e) { setError(e instanceof Error ? e.message : "Local template file unavailable."); }
  };
  const save = async () => {
    if (busy) return;
    setBusy("Saving comedy template"); setError("");
    try {
      if (!file || !seconds || seconds > 15 || seconds < 1) throw new Error("Upload a playable video between 1 and 15 seconds.");
      if (file.size > 80 * 1024 * 1024) throw new Error("Maximum owned video size is 80MB.");
      const response = await fetch("/api/trend-radar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "template-save", title, category, seconds, width, height,
          audioTrack: audio.audioTrack, speech, performers: performers ? Number(performers) : null,
          description, rights, evidence, approved: true,
        }),
      });
      const item = await response.json();
      if (!response.ok) throw new Error(item.error || "Saving template metadata failed.");
      try { await saveLocalAssets((item as ComedyTemplate).id, [{ role: "video", file }]); }
      catch { throw new Error("Metadata saved, but the original video could not be stored in this browser. Check available device storage; template is not ready for reuse."); }
      await reload();
      setTitle(""); setFile(undefined); setSourceUrl(""); setSeconds(undefined);
      setPerformers(""); setDescription("");
    } catch (e) { setError(e instanceof Error ? e.message : "Template could not be saved."); }
    finally { setBusy(""); }
  };
  const recommended = matchingTemplates(templates, kind);
  return (
    <section className="radar-template-library">
      <h3>Reusable Comedy Video Library</h3>
      <p className="module-note">Approved, owner-supplied videos appear first, before searching external websites. Original audio is preserved in the local video file. Rights are owner-confirmed, not independently adjudicated.</p>
      {error && <p role="alert" className="module-error">{error}</p>}
      <div className="radar-template-grid">
        {recommended.map((template) => (
          <article className="radar-template-card" key={template.id}>
            <strong>{template.title}</strong>
            <small>{template.category} · {template.seconds.toFixed(2)}s · {template.width}×{template.height}</small>
            <small>{template.performers ? template.performers + " performers (owner-confirmed)" : "Performer count UNKNOWN"} · Audio track {template.audioTrack} · Speech {template.speech}</small>
            <small>Rights: {template.rights} {template.evidence ? "· Evidence recorded" : ""}</small>
            <button className="primary" type="button" onClick={() => void choose(template)}>Use my original video</button>
          </article>
        ))}
      </div>
      {!recommended.length && <p className="module-note">No approved local comedy templates yet. Save an owned or licensed 1–15 second video to build your reusable library.</p>}
      <details className="radar-library-editor">
        <summary>Import an owned or licensed funny video template</summary>
        <div className="radar-library-fields">
          <label>Template title <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Six people dancing awkwardly" /></label>
          <label>Scene category <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {templateCategories.map((v) => <option key={v}>{v}</option>)}
          </select></label>
          <label>Original video file <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => {
            const selected = e.target.files?.[0]; setFile(selected); setSeconds(undefined);
            setAudio({ audioTrack: "unknown", reason: "Not inspected" });
            if (sourceUrl) URL.revokeObjectURL(sourceUrl);
            setSourceUrl(selected ? URL.createObjectURL(selected) : "");
            if (selected) { setTitle((value) => value || selected.name); void inspectOwnedAudioTrack(selected).then(setAudio); }
          }} /></label>
          {sourceUrl && <video controls playsInline src={sourceUrl} style={{ width: "min(320px, 100%)" }} onLoadedMetadata={(event) => {
            const v = event.currentTarget;
            setSeconds(v.duration); setWidth(v.videoWidth); setHeight(v.videoHeight);
          }} />}
          <p className="module-note">Duration: {seconds && Number.isFinite(seconds) ? seconds.toFixed(2) + "s" : "UNKNOWN"} · {width}×{height} · Container audio: {audio.audioTrack}. Listen manually to confirm dialogue or laughter.</p>
          <label>Visible performers (manually confirmed, or leave empty) <input type="number" min="1" max="20" value={performers} onChange={(e) => setPerformers(e.target.value)} /></label>
          <label>Does the clip audibly contain speech or laughter? (manual) <select value={speech} onChange={(e) => setSpeech(e.target.value)}>
            <option value="unknown">UNKNOWN</option><option value="yes">Yes — I listened</option><option value="no">No — I listened</option>
          </select></label>
          <label>Video description <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Positions, who moves, and whether people cross paths" /></label>
          <label>Reuse authorization <select value={rights} onChange={(e) => setRights(e.target.value)}>
            <option value="owner-confirmed">I own the video</option>
            <option value="license-confirmed">I have a reuse license</option>
            <option value="creator-authorized">Creator gave permission</option>
          </select></label>
          <label>License/permission evidence link or notes <input value={evidence} maxLength={1000} onChange={(e) => setEvidence(e.target.value)} /></label>
          <button type="button" className="primary" disabled={!!busy || !file || !seconds || seconds > 15 || seconds < 1} onClick={() => void save()}>{busy || "Approve and save reusable template"}</button>
        </div>
      </details>
    </section>
  );
}
