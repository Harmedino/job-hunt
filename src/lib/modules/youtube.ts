import { db } from "../db";
import { providerJson } from "./http";
import { lease, ownerFilter, OWNER } from "./store";
import type { YoutubeChannel, YoutubeVideo } from "./types";
import { ModuleError, object, text } from "./validation";
const DATA_ROOT = "https://www.googleapis.com/youtube/v3/";
export function normalizeVideo(value: unknown): YoutubeVideo {
  const v = object(value);
  const s = object(v.snippet);
  const stats = v.statistics ? object(v.statistics) : {};
  const details = v.contentDetails ? object(v.contentDetails) : {};
  const id = text(v.id, "video ID", 11, true);
  if (!/^[\w-]{11}$/.test(id))
    throw new ModuleError("Invalid video returned by YouTube.", 502);
  const thumbnails = s.thumbnails ? object(s.thumbnails) : {};
  const thumbnail = thumbnails.medium
    ? object(thumbnails.medium).url
    : undefined;
  const publicCount = (key: string) =>
    typeof stats[key] === "string" && /^\d+$/.test(stats[key] as string)
      ? (stats[key] as string)
      : undefined;
  return {
    id,
    title: String(s.title || "Untitled").slice(0, 500),
    channelId: String(s.channelId || ""),
    channelTitle: String(s.channelTitle || ""),
    publishedAt: String(s.publishedAt || ""),
    description: String(s.description || "").slice(0, 5000),
    thumbnail:
      typeof thumbnail === "string" &&
      /^https:\/\/i\.ytimg\.com\//.test(thumbnail)
        ? thumbnail
        : "",
    duration: String(details.duration || "Unknown"),
    views: publicCount("viewCount"),
    likes: publicCount("likeCount"),
    comments: publicCount("commentCount"),
    url: `https://www.youtube.com/watch?v=${id}`,
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 29 * 86400000).toISOString(),
  };
}
export async function reserveYoutubeQuota(cost: number) {
  const database = await db();
  const key = `youtube-quota:${new Date().toISOString().slice(0, 10)}`;
  const limit = Math.max(
    100,
    Math.min(10000, Number(process.env.YOUTUBE_DAILY_QUOTA_BUDGET) || 2000),
  );
  try {
    const result = await database
      .collection("workspace_ephemeral")
      .findOneAndUpdate(
        ownerFilter({
          key,
          $or: [{ used: { $lte: limit - cost } }, { used: { $exists: false } }],
        }),
        {
          $inc: { used: cost },
          $setOnInsert: { expiresAt: new Date(Date.now() + 2 * 86400000) },
        },
        { upsert: true, returnDocument: "after" },
      );
    if (!result) throw new Error();
  } catch {
    throw new ModuleError(
      "Local YouTube daily quota budget exhausted. Try tomorrow (UTC).",
      429,
    );
  }
}
export async function youtubeData(
  resource: string,
  parameters: Record<string, string>,
  token?: string,
) {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!token && !key)
    throw new ModuleError(
      "Set YOUTUBE_API_KEY to enable official YouTube research.",
      503,
    );
  await reserveYoutubeQuota(resource === "search" ? 100 : 1);
  return object(
    await providerJson(
      `${DATA_ROOT}${resource}?${new URLSearchParams({ ...parameters, ...(!token ? { key: key! } : {}) })}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      "YouTube",
    ),
  );
}
export async function discoverVideos(input: Record<string, unknown>) {
  if (!(await lease("youtube-search", 30)))
    throw new ModuleError(
      "Wait 30 seconds between YouTube searches to conserve quota.",
      429,
    );
  const q = text(input.query || "", "keyword", 200);
  const channelId = text(input.channelId || "", "channel ID", 50);
  if (!q && !channelId) throw new ModuleError("Enter a keyword or channel ID.");
  if (channelId && !/^UC[\w-]{22}$/.test(channelId))
    throw new ModuleError("Use a YouTube channel ID beginning with UC.");
  const params: Record<string, string> = {
    part: "snippet",
    type: "video",
    maxResults: "20",
    order: "date",
    ...(q ? { q } : {}),
    ...(channelId ? { channelId } : {}),
  };
  for (const name of ["publishedAfter", "publishedBefore"])
    if (input[name]) {
      const d = text(input[name], name, 40);
      if (!Number.isFinite(Date.parse(d)))
        throw new ModuleError("Invalid search date.");
      params[name] = new Date(d).toISOString();
    }
  if (
    params.publishedAfter &&
    params.publishedBefore &&
    params.publishedAfter > params.publishedBefore
  )
    throw new ModuleError("Start date must precede end date.");
  if (
    input.duration &&
    ["short", "medium", "long"].includes(String(input.duration))
  )
    params.videoDuration = String(input.duration);
  if (input.pageToken) {
    params.pageToken = text(input.pageToken, "page token", 300);
    if (!/^[\w=-]+$/.test(params.pageToken))
      throw new ModuleError("Invalid page token.");
  }
  const result = await youtubeData("search", params);
  const ids = (Array.isArray(result.items) ? result.items : [])
    .map((v) => String(object(object(v).id).videoId || ""))
    .filter((v) => /^[\w-]{11}$/.test(v));
  if (!ids.length)
    return {
      videos: [],
      nextPageToken: result.nextPageToken,
      message: "No research candidates found.",
    };
  const details = await youtubeData("videos", {
    part: "snippet,contentDetails,statistics",
    id: ids.join(","),
  });
  return {
    videos: (Array.isArray(details.items) ? details.items : []).map(
      normalizeVideo,
    ),
    nextPageToken:
      typeof result.nextPageToken === "string"
        ? result.nextPageToken
        : undefined,
  };
}
export async function fetchVideo(id: string) {
  if (!/^[\w-]{11}$/.test(id)) throw new ModuleError("Invalid video ID.");
  const result = await youtubeData("videos", {
    part: "snippet,contentDetails,statistics",
    id,
  });
  if (!Array.isArray(result.items) || !result.items.length)
    throw new ModuleError("Video unavailable.", 404);
  return normalizeVideo(result.items[0]);
}
export async function fetchChannel(id: string): Promise<YoutubeChannel> {
  if (!/^UC[\w-]{22}$/.test(id))
    throw new ModuleError("Use a channel ID beginning with UC.");
  const result = await youtubeData("channels", {
    part: "snippet,statistics",
    id,
  });
  if (!Array.isArray(result.items) || !result.items.length)
    throw new ModuleError("Channel unavailable.", 404);
  const item = object(result.items[0]);
  const snippet = object(item.snippet);
  const stats = object(item.statistics || {});
  return {
    id,
    title: String(snippet.title || "Untitled channel"),
    description: String(snippet.description || "").slice(0, 5000),
    url: `https://www.youtube.com/channel/${id}`,
    subscribers:
      !stats.hiddenSubscriberCount && typeof stats.subscriberCount === "string"
        ? stats.subscriberCount
        : undefined,
    views: typeof stats.viewCount === "string" ? stats.viewCount : undefined,
    videoCount:
      typeof stats.videoCount === "string" ? stats.videoCount : undefined,
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 29 * 86400000).toISOString(),
  };
}
export async function saveYoutube(
  kind: "video" | "channel",
  record: YoutubeVideo | YoutubeChannel,
) {
  await (await db()).collection("workspace_youtube_cache").updateOne(
    ownerFilter({ kind, id: record.id }),
    {
      $set: {
        ...record,
        kind,
        owner: OWNER,
        expiresAt: new Date(record.expiresAt),
      },
    },
    { upsert: true },
  );
  return record;
}
export async function savedYoutube<T>(kind: "video" | "channel"): Promise<T[]> {
  return (await (
    await db()
  )
    .collection("workspace_youtube_cache")
    .find(ownerFilter({ kind, expiresAt: { $gt: new Date() } }), {
      projection: { _id: 0, owner: 0, kind: 0 },
    })
    .limit(200)
    .toArray()) as unknown as T[];
}
export async function refreshSavedYoutube() {
  const records = await (
    await db()
  )
    .collection("workspace_youtube_cache")
    .find(
      ownerFilter({
        kind: { $in: ["video", "channel"] },
        expiresAt: { $gt: new Date() },
      }),
    )
    .sort({ fetchedAt: 1 })
    .limit(10)
    .toArray();
  const failures: string[] = [];
  await Promise.allSettled(
    records.map(async (record) => {
      try {
        await saveYoutube(
          record.kind,
          record.kind === "video"
            ? await fetchVideo(record.id)
            : await fetchChannel(record.id),
        );
      } catch (e) {
        if (e instanceof ModuleError && e.status === 404)
          await (
            await db()
          )
            .collection("workspace_youtube_cache")
            .deleteOne(ownerFilter({ kind: record.kind, id: record.id }));
        failures.push(
          e instanceof ModuleError ? e.message : "Research refresh failed.",
        );
      }
    }),
  );
  await (
    await db()
  )
    .collection("workspace_youtube_cache")
    .deleteMany(ownerFilter({ expiresAt: { $lte: new Date() } }));
  return failures;
}
