import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { db } from "../db";
import { providerJson } from "./http";
import { ownerFilter, OWNER } from "./store";
import { ModuleError, object, text } from "./validation";
import { youtubeData } from "./youtube";
import type { AnalyticsSnapshot, YoutubeReport } from "./types";
export const scopes = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
export function encryptionKey() {
  const input = process.env.OAUTH_ENCRYPTION_KEY || "";
  const key = Buffer.from(input, "base64");
  if (key.length !== 32)
    throw new ModuleError(
      "Set OAUTH_ENCRYPTION_KEY to a base64-encoded 32-byte key.",
      503,
    );
  return key;
}
export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("launchpad-youtube:owner"));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptToken(value: string) {
  try {
    const parts = value.split(".");
    if (
      parts.length !== 3 ||
      parts.some(
        (part) =>
          !/^[A-Za-z0-9_-]+$/.test(part) ||
          Buffer.from(part, "base64url").toString("base64url") !== part,
      ) ||
      Buffer.from(parts[0], "base64url").length !== 12 ||
      Buffer.from(parts[1], "base64url").length !== 16
    )
      throw new Error("Invalid encrypted token");
    const [iv, tag, encrypted] = parts;
    const cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    cipher.setAAD(Buffer.from("launchpad-youtube:owner"));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      cipher.update(Buffer.from(encrypted, "base64url")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ModuleError(
      "Stored YouTube connection cannot be decrypted. Reconnect the channel.",
      503,
    );
  }
}
export function oauthConfigured() {
  return !!(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REDIRECT_URI &&
    process.env.OAUTH_ENCRYPTION_KEY
  );
}
export function oauthConfiguration() {
  if (!oauthConfigured())
    throw new ModuleError(
      "Configure YouTube OAuth client ID, secret, redirect URI and encryption key.",
      503,
    );
  encryptionKey();
  const redirect = new URL(process.env.YOUTUBE_REDIRECT_URI!);
  if (
    redirect.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(redirect.hostname)
    )
  )
    throw new ModuleError("Use an HTTPS OAuth redirect URI.", 503);
  return {
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    redirect_uri: redirect.href,
  };
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function beginOAuth() {
  const config = oauthConfiguration();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  await (await db()).collection("workspace_ephemeral").insertOne({
    owner: OWNER,
    key: `oauth:${hash(state)}`,
    verifier: encryptToken(verifier),
    expiresAt: new Date(Date.now() + 10 * 60000),
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { url: url.href, state };
}
export function validOAuthState(state: string, cookie: string) {
  return (
    /^[\w-]{43}$/.test(state) &&
    state.length === cookie.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(cookie))
  );
}
export async function finishOAuth(code: string, state: string, cookie: string) {
  if (!validOAuthState(state, cookie))
    throw new ModuleError(
      "OAuth state mismatch. Reconnect from this browser.",
      403,
    );
  const stored = await (
    await db()
  )
    .collection("workspace_ephemeral")
    .findOneAndDelete(
      ownerFilter({
        key: `oauth:${hash(state)}`,
        expiresAt: { $gt: new Date() },
      }),
    );
  if (!stored)
    throw new ModuleError("OAuth request expired or already used.", 403);
  const config = oauthConfiguration();
  const tokens = object(
    await providerJson(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ...config,
          code: text(code, "OAuth code", 4000, true),
          grant_type: "authorization_code",
          code_verifier: decryptToken(stored.verifier),
        }),
      },
      "Google OAuth",
    ),
  );
  const granted =
    typeof tokens.scope === "string" ? tokens.scope.split(" ") : [];
  if (!scopes.every((scope) => granted.includes(scope)))
    throw new ModuleError(
      "Both YouTube read-only and Analytics read-only permissions are required. Reconnect and grant both.",
      403,
    );
  const access = text(tokens.access_token, "access token", 10000, true);
  const refresh = text(tokens.refresh_token, "refresh token", 10000, true);
  const channels = await youtubeData(
    "channels",
    { part: "snippet", mine: "true", maxResults: "50" },
    access,
  );
  if (!Array.isArray(channels.items) || !channels.items.length)
    throw new ModuleError("No owned YouTube channel was returned.", 403);
  for (const value of channels.items) {
    const channel = object(value);
    const id = text(channel.id, "channel", 50, true);
    if (!/^UC[\w-]{22}$/.test(id)) continue;
    await (await db()).collection("workspace_oauth").updateOne(
      ownerFilter({ id }),
      {
        $set: {
          owner: OWNER,
          id,
          title: String(object(channel.snippet).title || id),
          accessToken: encryptToken(access),
          refreshToken: encryptToken(refresh),
          scope: granted,
          expiresAt:
            Date.now() +
            Math.min(Number(tokens.expires_in) || 3600, 86400) * 1000,
          connectedAt: new Date().toISOString(),
          authorizedAt: new Date().toISOString(),
          purgeAt: new Date(Date.now() + 29 * 86400000),
        },
      },
      { upsert: true },
    );
  }
}
export async function integrationToken(channelId: string) {
  const col = (await db()).collection("workspace_oauth");
  const record = await col.findOne(ownerFilter({ id: channelId }));
  if (!record)
    throw new ModuleError(
      "Connect this channel through Google OAuth first.",
      403,
    );
  if (!scopes.every((scope) => record.scope?.includes(scope)))
    throw new ModuleError(
      "Reconnect with read-only YouTube and Analytics permissions.",
      403,
    );
  if (record.purgeAt && new Date(record.purgeAt).getTime() <= Date.now()) {
    await col.deleteOne(ownerFilter({ id: channelId }));
    await (
      await db()
    )
      .collection("workspace_youtube_cache")
      .deleteMany(ownerFilter({ kind: "analytics", id: channelId }));
    await (
      await db()
    )
      .collection("workspace_ai_cache")
      .deleteMany(ownerFilter());
    throw new ModuleError(
      "This inactive YouTube connection expired. Reconnect to renew authorization.",
      403,
    );
  }
  if (record.expiresAt > Date.now() + 60000)
    return decryptToken(record.accessToken);
  const config = oauthConfiguration();
  try {
    const refreshed = object(
      await providerJson(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.client_id,
            client_secret: config.client_secret,
            refresh_token: decryptToken(record.refreshToken),
            grant_type: "refresh_token",
          }),
        },
        "Google OAuth",
      ),
    );
    const token = text(refreshed.access_token, "access token", 10000, true);
    await col.updateOne(ownerFilter({ id: channelId }), {
      $set: {
        accessToken: encryptToken(token),
        expiresAt:
          Date.now() +
          Math.min(Number(refreshed.expires_in) || 3600, 86400) * 1000,
        authorizedAt: new Date().toISOString(),
        purgeAt: new Date(Date.now() + 29 * 86400000),
      },
    });
    return token;
  } catch (e) {
    // Delete revoked authorization and any private cached data; do not quietly fall back to public data.
    if (e instanceof ModuleError && e.status === 403) {
      await col.deleteOne(ownerFilter({ id: channelId }));
      await (
        await db()
      )
        .collection("workspace_ai_cache")
        .deleteMany(ownerFilter());
      await (
        await db()
      )
        .collection("workspace_youtube_cache")
        .deleteMany(ownerFilter({ kind: "analytics", id: channelId }));
    }
    throw e;
  }
}
export async function disconnectChannel(id: string) {
  const database = await db();
  const record = await database
    .collection("workspace_oauth")
    .findOne(ownerFilter({ id }));
  if (!record) throw new ModuleError("Channel connection not found.", 404);
  let revoked = false;
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: decryptToken(record.refreshToken) }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    revoked = response.ok;
  } catch {
    /* Local removal still succeeds. */
  }
  // One grant can cover several brand channels. Clear all locally when revoking it.
  await database.collection("workspace_oauth").deleteMany(ownerFilter());
  await database.collection("workspace_ai_cache").deleteMany(ownerFilter());
  await database
    .collection("workspace_youtube_cache")
    .deleteMany(ownerFilter({ kind: "analytics" }));
  return {
    disconnected: true,
    message: revoked
      ? "Google grant revoked and all local channel connections removed."
      : "Local channel connections removed. Revoke remaining Google access at https://myaccount.google.com/permissions .",
  };
}
export async function channelAnalytics(
  channelId: string,
  startDate: string,
  endDate: string,
  video?: string,
): Promise<AnalyticsSnapshot> {
  const token = await integrationToken(channelId);
  if (video) {
    const result = await youtubeData(
      "videos",
      { part: "snippet", id: video },
      token,
    );
    const item = Array.isArray(result.items) ? result.items[0] : undefined;
    if (!item || object(object(item).snippet).channelId !== channelId)
      throw new ModuleError(
        "Video does not belong to the connected channel.",
        403,
      );
  }
  const common = { ids: `channel==${channelId}`, startDate, endDate };
  const specs: Record<string, Record<string, string>> = {
    totals: {
      metrics:
        "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
    },
    videos: {
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "video",
      sort: "-views",
      maxResults: "25",
    },
    traffic: {
      metrics: "views,estimatedMinutesWatched",
      dimensions: "insightTrafficSourceType",
    },
    daily: { metrics: "views,estimatedMinutesWatched", dimensions: "day" },
    ...(video
      ? {
          retention: {
            metrics: "audienceWatchRatio,relativeRetentionPerformance",
            dimensions: "elapsedVideoTimeRatio",
            filters: `video==${video}`,
          },
        }
      : {}),
  };
  const reports: AnalyticsSnapshot["reports"] = {};
  try {
    const source = await youtubeData(
      "channels",
      { part: "statistics", id: channelId },
      token,
    );
    const first = Array.isArray(source.items) ? source.items[0] : undefined;
    const stats = first ? object(object(first).statistics) : {};
    reports.channel = {
      data: {
        columnHeaders: [
          { name: "totalViews" },
          { name: "subscribers" },
          { name: "videoCount" },
        ],
        rows: [
          [
            String(stats.viewCount ?? "Unavailable"),
            stats.hiddenSubscriberCount
              ? "Hidden"
              : String(stats.subscriberCount ?? "Unavailable"),
            String(stats.videoCount ?? "Unavailable"),
          ],
        ],
      },
    };
  } catch {
    reports.channel = { unavailable: "Channel totals unavailable." };
  }
  await Promise.allSettled(
    Object.entries(specs).map(async ([name, params]) => {
      try {
        const result = object(
          await providerJson(
            `https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ...common, ...params })}`,
            { headers: { Authorization: `Bearer ${token}` } },
            "YouTube Analytics",
          ),
        );
        reports[name] = { data: result as YoutubeReport };
      } catch (e) {
        reports[name] = {
          unavailable:
            e instanceof ModuleError ? e.message : "Report unavailable.",
        };
      }
    }),
  );
  reports.returningViewers = {
    unavailable:
      "Returning-viewer data is not available from the reports implemented here.",
  };
  if (!video)
    reports.retention = {
      unavailable:
        "Choose an owned video to request audience retention. Empty reports remain unavailable.",
    };
  await (
    await db()
  )
    .collection("workspace_oauth")
    .updateOne(ownerFilter({ id: channelId }), {
      $set: { lastSyncAt: new Date().toISOString() },
    });
  return {
    channelId,
    startDate,
    endDate,
    fetchedAt: new Date().toISOString(),
    reports,
  };
}
