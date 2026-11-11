"use client";
import { useEffect, useState } from "react";
import type { RadarStory } from "@/lib/trend-radar/core";
type XPost = { id: string; text: string; createdAt: string; url: string; likes?: number; reposts?: number; replies?: number };
type Result = { posts: XPost[]; checkedAt: string; note: string };
export default function TrendXResearch({ onPick }: { onPick: (story: RadarStory) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [query, setQuery] = useState("football funny reactions");
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/trend-radar?scope=connections").then((r) => r.json()).then((v) => {
      if (active) setEnabled(v.x?.configured === true);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const run = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/trend-radar", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "x-search", query }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "X search unavailable.");
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "X search failed."); }
    finally { setBusy(false); }
  };
  const choose = (post: XPost) => {
    const story: RadarStory = {
      id: "manual:x:" + post.id, title: post.text.slice(0, 210),
      summary: "Public X post text and counts supplied by X's official API. Claims, accusations and popularity outside these counts are not independently verified.",
      category: "Football", sources: [{ publisher: "X API post " + post.id, url: post.url, publishedAt: post.createdAt }],
      publishedAt: post.createdAt, checkedAt: result?.checkedAt || new Date().toISOString(),
      score: 0, why: "A public post can inspire fictional comedy; the post does not establish the factual accuracy of its claims.", people: [],
    };
    onPick(story);
  };
  return <section className="radar-x-research">
    <h3>X Football Reactions · Optional official API</h3>
    {!enabled && <p className="module-note">X API recent search is not connected. Add X_BEARER_TOKEN with recent-search access, or paste an X post link in the manual reference section. No unverified social counts are shown.</p>}
    <form className="module-actions" onSubmit={(e) => { e.preventDefault(); void run(); }}>
      <input value={query} maxLength={150} aria-label="X post search" onChange={(e) => setQuery(e.target.value)} />
      <button className="secondary" type="submit" disabled={!enabled || busy}>{busy ? "Searching X…" : "Search public X posts"}</button>
    </form>
    {error && <p role="alert" className="module-error">{error}</p>}
    {result && <p className="module-note">{result.note} Checked {new Date(result.checkedAt).toLocaleString()}.</p>}
    <div className="radar-template-grid">
      {(result?.posts || []).map((post) => <article className="radar-template-card" key={post.id}>
        <p>{post.text}</p>
        <small>Published: {post.createdAt ? new Date(post.createdAt).toLocaleString() : "unknown"}</small>
        <small>{post.likes === undefined ? "Likes UNKNOWN" : post.likes + " likes"} · {post.reposts === undefined ? "Reposts UNKNOWN" : post.reposts + " reposts"} · {post.replies === undefined ? "Replies UNKNOWN" : post.replies + " replies"}</small>
        <div className="module-actions">
          <button className="secondary" type="button" onClick={() => choose(post)}>Create fictional parody</button>
          <a href={post.url} target="_blank" rel="noopener noreferrer">Original post ↗</a>
        </div>
      </article>)}
    </div>
  </section>;
}
