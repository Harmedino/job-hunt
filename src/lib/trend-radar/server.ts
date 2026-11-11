import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { db } from "../db";
import { lease, OWNER, ownerFilter } from "../modules/store";
import { ModuleError } from "../modules/validation";
import { discoverVideos } from "../modules/youtube";
import {
  type RadarStory, type RadarSource, type RadarCategory, type RadarProject, type RadarClip,
  type RadarAssignment, radarStatuses, storyScore, opportunityReason, mergeStories,
  visibleStories, videoCandidate, klingReplacementPrompt, captionDrafts,
} from "./core";
const feeds: { name: string; category: RadarCategory; url: string }[] = [
  { name: "BBC Sport", category: "Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { name: "The Guardian Football", category: "Football", url: "https://www.theguardian.com/football/rss" },
  { name: "BBC Entertainment", category: "Entertainment", url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml" },
  { name: "The Guardian Culture", category: "Entertainment", url: "https://www.theguardian.com/culture/rss" },
  { name: "BBC Technology", category: "Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { name: "The Guardian Technology", category: "Technology", url: "https://www.theguardian.com/uk/technology/rss" },
  { name: "BBC World", category: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
];
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true, processEntities: false });
const strip = (value: unknown, limit = 500) => String(value ?? "")
  .replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|apos);/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, limit);
function checkedUrl(value: unknown, allowed?: string[]): string {
  if (typeof value !== "string" || value.length > 2048) throw new ModuleError("Invalid source URL.");
  let u: URL;
  try { u = new URL(value); } catch { throw new ModuleError("Invalid source URL."); }
  if (u.protocol !== "https:" || u.username || u.password || u.port ||
    !u.hostname || (allowed && !allowed.includes(u.hostname)))
    throw new ModuleError("Use a supported original HTTPS URL.");
  return u.href;
}
function numericHours(hours: unknown): number {
  const n = Number(hours ?? 24);
  if (![6, 12, 24, 48].includes(n)) throw new ModuleError("Choose 6, 12, 24 or 48 hours.");
  return n;
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || value.length > max) throw new ModuleError("Invalid " + label + ".");
  return value.trim();
}
async function indexes() {
  const database = await db();
  await Promise.all([
    database.collection("trend_radar_stories").createIndex({ owner: 1, id: 1 }, { unique: true }),
    database.collection("trend_radar_stories").createIndex({ owner: 1, publishedAt: -1 }),
    database.collection("trend_radar_projects").createIndex({ owner: 1, id: 1 }, { unique: true }),
    database.collection("trend_radar_projects").createIndex({ owner: 1, updatedAt: -1 }),
    database.collection("trend_radar_refresh").createIndex({ owner: 1, key: 1 }, { unique: true }),
  ]);
}
function newsItem(item: Record<string, unknown>, category: RadarCategory, feed: string, now: string): RadarStory | null {
  const title = strip(item.title, 240);
  const raw = typeof item.link === "string" ? item.link : "";
  if (!title || !raw) return null;
  let url: string;
  try { url = checkedUrl(raw); } catch { return null; }
  const date = new Date(String(item.pubDate || item.published || ""));
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000 ||
      date.getTime() < Date.now() - 3 * 86400000) return null;
  const source: RadarSource = { publisher: feed, url, publishedAt: date.toISOString() };
  const story: RadarStory = {
    id: "feed:" + url, title, summary: strip(item.description, 800),
    category, sources: [source], publishedAt: source.publishedAt,
    checkedAt: now, score: 0, why: "", people: [],
  };
  story.score = storyScore(story); story.why = opportunityReason(story);
  return story;
}
async function feedStories(feed: (typeof feeds)[number], now: string): Promise<RadarStory[]> {
  let res: Response;
  try {
    res = await fetch(feed.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "LaunchpadTrendRadar/1.0" }, redirect: "error", signal: AbortSignal.timeout(7500), cache: "no-store" });
  } catch { throw new Error(feed.name + " could not be reached."); }
  if (!res.ok) throw new Error(feed.name + " returned HTTP " + res.status + ".");
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > 500000) throw new Error(feed.name + " feed too large.");
  const xml = await res.text();
  if (xml.length > 500000) throw new Error(feed.name + " feed too large.");
  let parsed: unknown;
  try { parsed = parser.parse(xml); } catch { throw new Error(feed.name + " RSS malformed."); }
  const root = parsed as { rss?: { channel?: { item?: unknown } }; feed?: { entry?: unknown } };
  const items = root?.rss?.channel?.item;
  return (Array.isArray(items) ? items : items ? [items] : [])
    .slice(0, 35).map((entry) => newsItem(entry, feed.category, feed.name, now))
    .filter((v): v is RadarStory => v !== null);
}
async function fetchRefresh(force: boolean) {
  await indexes();
  const database = await db();
  const collection = database.collection("trend_radar_refresh");
  const state = await collection.findOne(ownerFilter({ key: "news" }));
  if (!force && state?.checkedAt && Date.now() - Date.parse(state.checkedAt) < 20 * 60000)
    return { checkedAt: state.checkedAt as string, failures: (state.failures || []) as string[] };
  if (!(await lease("trend-radar-refresh", 90))) {
    if (state?.checkedAt) return { checkedAt: state.checkedAt as string, failures: ["Another refresh is in progress. Showing cached results."] };
    throw new ModuleError("Trend Radar is refreshing. Try again shortly.", 429);
  }
  const now = new Date().toISOString();
  const results = await Promise.allSettled(feeds.map((f) => feedStories(f, now)));
  const rows: RadarStory[] = [];
  const failures: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") rows.push(...result.value);
    else failures.push(feeds[i].name + ": " + (result.reason instanceof Error ? result.reason.message : "Unavailable."));
  });
  if (rows.length) {
    const clustered = mergeStories(rows);
    const col = database.collection("trend_radar_stories");
    for (const story of clustered.slice(0, 160)) {
      const existing = await col.findOne(ownerFilter({ id: story.id }));
      await col.updateOne(ownerFilter({ id: story.id }), {
        $set: { ...story, hidden: existing?.hidden === true, owner: OWNER },
      }, { upsert: true });
    }
    await col.deleteMany(ownerFilter({ id: { $not: /^manual:/ }, publishedAt: { $lt: new Date(Date.now() - 7 * 86400000).toISOString() } }));
  }
  const checkedAt = rows.length ? now : (state?.checkedAt as string || "");
  await collection.updateOne(ownerFilter({ key: "news" }), {
    $set: { owner: OWNER, key: "news", checkedAt, attemptedAt: now, failures },
  }, { upsert: true });
  return { checkedAt, failures };
}
export async function radarDashboard(hours: unknown = 24, refresh = false) {
  const windowHours = numericHours(hours);
  if (refresh) await fetchRefresh(true);
  else await fetchRefresh(false);
  const database = await db();
  const [stories, meta, projects] = await Promise.all([
    database.collection<RadarStory>("trend_radar_stories")
      .find(ownerFilter(), { projection: { _id: 0, owner: 0 } })
      .sort({ publishedAt: -1 }).limit(220).toArray(),
    database.collection("trend_radar_refresh").findOne(ownerFilter({ key: "news" })),
    database.collection<RadarProject>("trend_radar_projects")
      .find(ownerFilter(), { projection: { _id: 0, owner: 0 } })
      .sort({ updatedAt: -1 }).limit(100).toArray(),
  ]);
  const merged = mergeStories(stories.filter((story) => !story.id.startsWith("manual:")));
  const manualReferences = stories.filter((story) => story.id.startsWith("manual:") && !story.hidden).slice(0, 20);
  const hidden = new Set(stories.filter((s) => s.hidden).flatMap((s) => s.sources.map((x) => x.url)));
  const filtered = merged.filter((s) => !s.sources.some((src) => hidden.has(src.url)));
  return {
    stories: visibleStories(filtered, windowHours), manualReferences,
    checkedAt: meta?.checkedAt || null, attemptedAt: meta?.attemptedAt || null,
    failures: (meta?.failures || []) as string[], projects,
    connected: { rss: true, youtube: !!process.env.YOUTUBE_API_KEY, ai: !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY), x: false },
    ranking: "Editorial relevance, freshness and independently sourced reports; not measured social popularity.",
  };
}
export async function hideStory(id: unknown) {
  const key = text(id, 2048, "story ID");
  const result = await (await db()).collection("trend_radar_stories")
    .updateOne(ownerFilter({ id: key }), { $set: { hidden: true } });
  if (!result.matchedCount) throw new ModuleError("Story not found.", 404);
  return { ok: true };
}
export function suggestedSearch(story: RadarStory): string {
  const words = story.title.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const base = words.slice(0, 5).join(" ");
  return story.category === "Football" ? base + " funny reaction comedy" : base + " funny reaction";
}
export async function radarClips(query: unknown, range: unknown = 15) {
  const phrase = text(query, 160, "clip search").replace(/\s+/g, " ");
  if (!phrase || phrase.length < 3) throw new ModuleError("Enter a specific video search.");
  const maxSeconds = Number(range);
  if (!Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 15)
    throw new ModuleError("Video duration must be between 1 and 15 seconds.");
  const result = await discoverVideos({ query: phrase, duration: "short" });
  const clips = result.videos.map(videoCandidate).filter((x): x is RadarClip => x !== null && x.seconds <= maxSeconds);
  return { clips: clips.slice(0, 12), searched: result.videos.length,
    rejectedByDuration: result.videos.length - clips.length,
    note: "Exact public ISO 8601 duration verified through YouTube metadata. Audio, people, aspect ratio, edit rights and suitability remain UNKNOWN. YouTube previews are references, not downloadable media.",
    nextPageToken: result.nextPageToken };
}
function validateStory(input: unknown): RadarStory {
  if (!input || typeof input !== "object") throw new ModuleError("Choose a story.");
  const row = input as RadarStory;
  const title = text(row.title, 240, "story");
  if (!title) throw new ModuleError("Story title is required.");
  if (!["Football", "Entertainment", "Technology", "World"].includes(row.category))
    throw new ModuleError("Choose a valid category.");
  if (!Array.isArray(row.sources) || !row.sources.length || row.sources.length > 8)
    throw new ModuleError("An evidence link is required.");
  const sources = row.sources.map((s) => ({
    publisher: text(s.publisher, 100, "publisher"),
    url: checkedUrl(s.url),
    publishedAt: Number.isFinite(Date.parse(s.publishedAt)) ? s.publishedAt : "",
  }));
  const publishedAt = Number.isFinite(Date.parse(row.publishedAt)) ? row.publishedAt : "";
  const story: RadarStory = {
    id: text(row.id, 2048, "story ID") || "manual:" + randomUUID(),
    title, category: row.category, summary: text(row.summary || "", 800, "summary"),
    sources, publishedAt, checkedAt: new Date().toISOString(),
    people: [], score: 0, why: "", hidden: false,
  };
  story.score = storyScore(story); story.why = opportunityReason(story);
  return story;
}
function validatedClip(value: unknown): RadarClip | undefined {
  if (!value) return undefined;
  if (typeof value !== "object") throw new ModuleError("Invalid video reference.");
  const clip = value as RadarClip;
  if (clip.source !== "YouTube" || !/^[\w-]{11}$/.test(clip.id) ||
    !clip.url.startsWith("https://www.youtube.com/watch?v=") ||
    typeof clip.seconds !== "number" || clip.seconds < 1 || clip.seconds > 15)
    throw new ModuleError("Choose a verified-duration YouTube reference.");
  return {
    ...clip, title: text(clip.title, 500, "video title"),
    rights: "unknown", speech: "unknown", peopleCount: "unknown",
    aspectRatio: "unknown", suitability: "unverified",
  };
}
export async function saveRadarProject(body: Record<string, unknown>): Promise<RadarProject> {
  await indexes();
  const database = await db();
  const id = typeof body.id === "string" && /^[\w-]{5,80}$/.test(body.id) ? body.id : randomUUID();
  const current = await database.collection<RadarProject>("trend_radar_projects").findOne(ownerFilter({ id }));
  const story = validateStory(body.story || current?.story);
  const assignments: RadarAssignment[] = Array.isArray(body.assignments) ? body.assignments.map((a: RadarAssignment) => ({
    role: text(a.role, 80, "character role"),
    imageTag: text(a.imageTag, 20, "image tag"),
    imageFilename: text(a.imageFilename || "", 200, "image filename"),
  })) : current?.assignments || [];
  if (assignments.length > 10) throw new ModuleError("Use up to ten character assignments.");
  let prompt = "";
  if (assignments.length) {
    try { prompt = klingReplacementPrompt(assignments, text(body.environmentTag || "", 20, "environment tag")); }
    catch (e) { throw new ModuleError(e instanceof Error ? e.message : "Invalid character tags."); }
  }
  const status = typeof body.status === "string" && radarStatuses.includes(body.status as RadarProject["status"]) ?
    body.status as RadarProject["status"] : current?.status || "Discovered";
  const captions = body.captions && typeof body.captions === "object" && !Array.isArray(body.captions) ?
    Object.fromEntries(Object.entries(body.captions).slice(0, 8).map(([key, value]) =>
      [text(key, 50, "caption platform"), text(value, 1000, "caption")])) : current?.captions || captionDrafts(story);
  const clip = body.clip === null ? undefined : body.clip ? validatedClip(body.clip) : current?.clip;
  const manualVideoUrl = text(body.manualVideoUrl || current?.manualVideoUrl || "", 2048, "manual video URL");
  if (manualVideoUrl) checkedUrl(manualVideoUrl);
  const publishedUrls = Array.isArray(body.publishedUrls) ?
    body.publishedUrls.slice(0, 12).map((u: unknown) => checkedUrl(u)) : current?.publishedUrls || [];
  const project: RadarProject = {
    id, story, clip, manualVideoUrl, assignments,
    environmentTag: text(body.environmentTag || "", 20, "environment tag"),
    prompt, captions, status, publishedUrls,
    notes: text(body.notes || current?.notes || "", 4000, "notes"),
    mediaNote: text(body.mediaNote || current?.mediaNote || "", 500, "media note"),
    updatedAt: new Date().toISOString(), archived: body.archived === true,
  };
  await database.collection("trend_radar_projects").updateOne(ownerFilter({ id }), {
    $set: { ...project, owner: OWNER },
  }, { upsert: true });
  return project;
}
export async function manualStory(body: Record<string, unknown>): Promise<RadarStory> {
  const title = text(body.title, 240, "headline");
  const url = checkedUrl(body.url);
  if (!title) throw new ModuleError("Enter the headline shown by the source.");
  const category = ["Football", "Entertainment", "Technology", "World"].includes(String(body.category)) ?
    body.category as RadarCategory : "World";
  const now = new Date().toISOString();
  const story = validateStory({
    title, id: "manual:" + randomUUID(), category,
    publishedAt: "", summary: "Manually supplied reference; contents and publication time not independently checked.",
    sources: [{ publisher: new URL(url).hostname, url, publishedAt: "" }],
  });
  await indexes();
  await (await db()).collection("trend_radar_stories").insertOne({ ...story, owner: OWNER });
  return story;
}
