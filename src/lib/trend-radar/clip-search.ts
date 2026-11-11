import { createHash } from "node:crypto";
import { db } from "../db";
import { ownerFilter, OWNER, lease } from "../modules/store";
import { ModuleError } from "../modules/validation";
import { youtubeData, normalizeVideo } from "../modules/youtube";
import { videoCandidate, exactYouTubeSeconds, type RadarClip } from "./core";
import type { YoutubeVideo } from "../modules/types";
const SEARCH_HOST = "YouTube Data API v3";
export type ShortClipReport = {
  clips: RadarClip[];
  checked: number;
  pages: number;
  rejectedByDuration: number;
  rejectedMissingMetadata: number;
  rejectedDuplicates: number;
  error?: string;
  note: string;
  cached: boolean;
  queriedAt: string;
};
export function classifyVideoBatch(items: YoutubeVideo[], seconds = 15, seen = new Set<string>()) {
  const clips: RadarClip[] = [];
  let rejectedByDuration = 0, rejectedMissingMetadata = 0, rejectedDuplicates = 0;
  for (const item of items) {
    if (seen.has(item.id)) { rejectedDuplicates++; continue; }
    seen.add(item.id);
    const duration = exactYouTubeSeconds(item.duration);
    if (duration === null) { rejectedMissingMetadata++; continue; }
    if (duration < 1 || duration > seconds) { rejectedByDuration++; continue; }
    const eligible = videoCandidate(item);
    if (eligible) clips.push(eligible);
  }
  return { clips, rejectedByDuration, rejectedMissingMetadata, rejectedDuplicates };
}
export async function searchRadarClips(input: {
  query: string; maxSeconds?: number; pages?: number; order?: "date" | "relevance";
  skipCache?: boolean;
}): Promise<ShortClipReport> {
  if (!process.env.YOUTUBE_API_KEY?.trim())
    throw new ModuleError("YOUTUBE_API_KEY is missing. Approved clips in your private library remain usable.", 503);
  const query = input.query.trim().replace(/\s+/g, " ");
  if (query.length < 3 || query.length > 160) throw new ModuleError("Enter a 3–160-character comedy scene search.");
  const seconds = Number(input.maxSeconds ?? 15);
  const pages = Number(input.pages ?? 2);
  const order = input.order ?? "relevance";
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 15 ||
      !Number.isInteger(pages) || pages < 1 || pages > 3 ||
      !["relevance", "date"].includes(order))
    throw new ModuleError("Maximum duration is 15s; search budget is 1–3 pages and order is relevance/date.");
  const key = [query.toLowerCase(), seconds, pages, order].join("|");
  const col = (await db()).collection("trend_radar_video_search");
  await col.createIndex({ owner: 1, key: 1 }, { unique: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const previous = await col.findOne(ownerFilter({ key }));
  if (!input.skipCache && previous && Date.parse(String(previous.queriedAt)) > Date.now() - 8 * 3600000)
    return { ...(previous.report as ShortClipReport), cached: true };
  if (!(await lease("trend-radar-clip-search:" + createHash("sha256").update(key).digest("hex").slice(0, 20), 15))) {
    if (previous) return { ...(previous.report as ShortClipReport), cached: true,
      note: "Another search is active. Older source-backed results shown." };
    throw new ModuleError("A video search is already running. Try again shortly.", 429);
  }
  const ids = new Set<string>();
  const seen = new Set<string>();
  let token: string | undefined;
  let checked = 0, usedPages = 0;
  let rejectedByDuration = 0, rejectedMissingMetadata = 0, rejectedDuplicates = 0;
  const clips: RadarClip[] = [];
  for (let i = 0; i < pages; i++) {
    const result = await youtubeData("search", {
      part: "snippet", type: "video", maxResults: "50", order,
      videoDuration: "short", q: query,
      ...(token ? { pageToken: token } : {}),
      safeSearch: "moderate",
    });
    const entries = Array.isArray(result.items) ? result.items as Record<string, unknown>[] : [];
    usedPages++;
    token = typeof result.nextPageToken === "string" ? result.nextPageToken : undefined;
    const pageIds = entries.map((v) => {
      const id = v.id && typeof v.id === "object" ? (v.id as Record<string, unknown>).videoId : "";
      return typeof id === "string" && /^[\w-]{11}$/.test(id) ? id : "";
    }).filter((id): id is string => !!id);
    const unseen = pageIds.filter((id) => { if (ids.has(id)) { rejectedDuplicates++; return false; } ids.add(id); return true; });
    if (unseen.length) {
      const detail = await youtubeData("videos", { part: "snippet,contentDetails,statistics", id: unseen.join(",") });
      const items = (Array.isArray(detail.items) ? detail.items : []).map(normalizeVideo);
      checked += items.length;
      const batch = classifyVideoBatch(items, seconds, seen);
      clips.push(...batch.clips);
      rejectedByDuration += batch.rejectedByDuration;
      rejectedMissingMetadata += batch.rejectedMissingMetadata;
      rejectedDuplicates += batch.rejectedDuplicates;
      rejectedMissingMetadata += unseen.length - items.length;
    }
    if (clips.length >= 12 || !token) break;
  }
  const report: ShortClipReport = {
    clips: clips.slice(0, 12), checked, pages: usedPages,
    rejectedByDuration, rejectedMissingMetadata, rejectedDuplicates,
    note: SEARCH_HOST + ": real YouTube preview references. Duration is metadata-verified; original audio, reuse rights, performer count and orientation are UNKNOWN without authorized video inspection. No download rights implied.",
    cached: false, queriedAt: new Date().toISOString(),
  };
  await col.updateOne(ownerFilter({ key }), {
    $set: { key, owner: OWNER, report, queriedAt: report.queriedAt,
      expiresAt: new Date(Date.now() + 2 * 86400000) },
  }, { upsert: true });
  return report;
}
export function sceneSearchFor(kind: string) {
  if (kind === "defeat") return "funny group dancing embarrassing moment comedy skit";
  if (kind === "goalkeeper") return "funny reaction fail shocked face comedy";
  if (kind === "manager") return "funny arguing frustrated coach sketch";
  if (kind === "rivalry") return "funny two people arguing comedy scene";
  if (kind === "winning") return "funny group celebration dancing";
  return "funny awkward interview conversation comedy";
}
