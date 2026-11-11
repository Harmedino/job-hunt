import { createHash } from "node:crypto";
import { db } from "../db";
import { ownerFilter, OWNER, lease } from "../modules/store";
import { ModuleError } from "../modules/validation";
export type PublicXPost = {
  id: string; text: string; createdAt: string; url: string;
  likes?: number; reposts?: number; replies?: number;
  quoteTweets?: number; verifiedBy: "X API v2";
};
export function xConnection() { return { configured: !!process.env.X_BEARER_TOKEN?.trim() }; }
export async function searchXPosts(query: unknown): Promise<{ posts: PublicXPost[]; checkedAt: string; note: string }> {
  const token = process.env.X_BEARER_TOKEN?.trim();
  if (!token) throw new ModuleError("Official X API research is not configured. Add X_BEARER_TOKEN with recent-search access or import post links manually.", 503);
  if (typeof query !== "string" || query.length < 3 || query.length > 150) throw new ModuleError("Enter a 3–150 character public post search.");
  const clean = query.trim().replace(/\s+/g, " ");
  const key = "search:" + createHash("sha256").update(clean).digest("hex");
  const col = (await db()).collection("trend_radar_x_cache");
  await Promise.all([
    col.createIndex({ owner: 1, key: 1 }, { unique: true }),
    col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  const previous = await col.findOne(ownerFilter({ key }));
  if (previous && Date.parse(String(previous.checkedAt)) > Date.now() - 30 * 60000)
    return previous.result as { posts: PublicXPost[]; checkedAt: string; note: string };
  if (!(await lease("radar-x:" + key, 60))) {
    if (previous) return previous.result as { posts: PublicXPost[]; checkedAt: string; note: string };
    throw new ModuleError("This X search is already running. Try again shortly.", 429);
  }
  const url = "https://api.x.com/2/tweets/search/recent?" + new URLSearchParams({
    query: clean + " -is:retweet",
    max_results: "20", "tweet.fields": "created_at,public_metrics",
  });
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8500),
    });
  } catch { throw new ModuleError("X recent-search API unavailable; no posts were invented.", 502); }
  if (response.status === 429) throw new ModuleError("X API rate limit reached.", 429);
  if ([401, 403].includes(response.status)) throw new ModuleError("X API access denied. Your plan or token might not include recent search.", 503);
  if (!response.ok) throw new ModuleError("X returned HTTP " + response.status + ".", 502);
  const data = await response.json() as Record<string, unknown>;
  const items = Array.isArray(data.data) ? data.data : [];
  const posts = items.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = String(row.id || "");
    if (!/^\d{10,25}$/.test(id)) return [];
    const metrics = row.public_metrics && typeof row.public_metrics === "object"
      ? row.public_metrics as Record<string, unknown> : {};
    const metric = (name: string) => typeof metrics[name] === "number" ? Number(metrics[name]) : undefined;
    return [{
      id, text: String(row.text || "").slice(0, 800),
      createdAt: String(row.created_at || ""), url: "https://x.com/i/web/status/" + id,
      likes: metric("like_count"), reposts: metric("retweet_count"),
      replies: metric("reply_count"), quoteTweets: metric("quote_count"),
      verifiedBy: "X API v2" as const,
    }];
  });
  const result = { posts, checkedAt: new Date().toISOString(), note:
    "Real public post metadata returned by official X API. Recent-search results do not by themselves establish platform-wide trending status. Counts are provider-supplied and may change." };
  await col.updateOne(ownerFilter({ key }), {
    $set: { owner: OWNER, key, result, checkedAt: result.checkedAt, expiresAt: new Date(Date.now() + 24 * 3600000) },
  }, { upsert: true });
  return result;
}
