import { defaultBountySkills } from "./defaults";
import { aiConfigured } from "../ai";
import { db } from "../db";
import { emptyProfile } from "../types";
import { analyzeBounty, discoverBounties, verifySavedBounties } from "./bounties";
import { oauthConfigured, channelAnalytics } from "./oauth";
import { collection, get, lease, list, ownerFilter, put, OWNER } from "./store";
import { refreshSavedYoutube, savedYoutube, discoverVideos } from "./youtube";
import {
  brunoProfile,
  type ModuleSettings,
  type WorkspaceSnapshot,
  type IntegrationSummary,
  type ResearchTopic,
} from "./types";
export const defaultSettings: ModuleSettings = {
  id: "preferences",
  bountyQuery: "",
  bountyRefresh: false,
  youtubeRefresh: false,
  refreshHours: 24,
  highMatch: 65,
};

export async function ownerSkills() {
  if (!process.env.MONGODB_URI) return defaultBountySkills;
  const profile =
    (await (await db()).collection("profile").findOne({ key: "owner" }))
      ?.profile || emptyProfile;
  return typeof profile.skills === "string" && profile.skills.trim()
    ? profile.skills
    : defaultBountySkills;
}
export async function snapshot(): Promise<WorkspaceSnapshot> {
  const base: WorkspaceSnapshot = {
    bounties: [],
    tracked: [],
    payments: [],
    profiles: [brunoProfile],
    topics: [],
    videos: [],
    channels: [],
    ideas: [],
    prompts: [],
    metadata: [],
    entries: [],
    journal: [],
    sources: [],
    integrations: [],
    settings: defaultSettings,
    storageAvailable: false,
    configured: {
      github: !!process.env.BOUNTY_GITHUB_TOKEN,
      youtube: !!process.env.YOUTUBE_API_KEY,
      oauth: oauthConfigured(),
      ai: aiConfigured(),
    },
  };
  if (!process.env.MONGODB_URI)
    return {
      ...base,
      warning:
        "Connect MongoDB to save module work and manage API quotas. Your existing job finder remains available.",
    };
  try {
    const [
      bounties,
      tracked,
      payments,
      profiles,
      topics,
      videos,
      channels,
      ideas,
      prompts,
      metadata,
      entries,
      journal,
      sources,
      settings,
      integrations,
    ] = await Promise.all([
      list<WorkspaceSnapshot["bounties"][number]>("bounties"),
      list<WorkspaceSnapshot["tracked"][number]>("tracked"),
      list<WorkspaceSnapshot["payments"][number]>("payments"),
      list<WorkspaceSnapshot["profiles"][number]>("profiles"),
      list<WorkspaceSnapshot["topics"][number]>("topics"),
      savedYoutube<WorkspaceSnapshot["videos"][number]>("video"),
      savedYoutube<WorkspaceSnapshot["channels"][number]>("channel"),
      list<WorkspaceSnapshot["ideas"][number]>("ideas"),
      list<WorkspaceSnapshot["prompts"][number]>("prompts"),
      list<WorkspaceSnapshot["metadata"][number]>("metadata"),
      list<WorkspaceSnapshot["entries"][number]>("entries"),
      list<WorkspaceSnapshot["journal"][number]>("journal"),
      list<WorkspaceSnapshot["sources"][number]>("sources"),
      get<ModuleSettings>("settings", "preferences").catch(
        () => defaultSettings,
      ),
      (await db())
        .collection("workspace_oauth")
        .find(
          ownerFilter({
            $or: [
              { purgeAt: { $gt: new Date() } },
              { purgeAt: { $exists: false } },
            ],
          }),
          {
            projection: {
              _id: 0,
              id: 1,
              title: 1,
              connectedAt: 1,
              lastSyncAt: 1,
            },
          },
        )
        .limit(50)
        .toArray(),
    ]);
    const skills = await ownerSkills();
    return {
      ...base,
      bounties: bounties.map((b) => ({ ...b, analysis: { ...b.analysis, ...analyzeBounty(b, skills) } })),
      tracked,
      payments,
      profiles: profiles.some((p) => p.id === "bruno")
        ? profiles
        : [brunoProfile, ...profiles],
      topics,
      videos,
      channels,
      ideas,
      prompts,
      metadata,
      entries,
      journal,
      sources,
      integrations: integrations as unknown as IntegrationSummary[],
      settings,
      storageAvailable: true,
    };
  } catch {
    return {
      ...base,
      warning:
        "Module storage unavailable. Check MongoDB; no saved work is being shown as live data.",
    };
  }
}
export async function runModuleSchedule() {
  if (!process.env.MONGODB_URI)
    return { skipped: "Module storage not configured." };
  const failures: string[] = [];
  const settings = await get<ModuleSettings>("settings", "preferences").catch(
    () => defaultSettings,
  );
  // Housekeeping runs even if all automatic discovery switches are off.
  await (
    await db()
  )
    .collection("workspace_youtube_cache")
    .deleteMany(ownerFilter({ expiresAt: { $lte: new Date() } }));
  await (
    await db()
  )
    .collection("workspace_ai_cache")
    .deleteMany(ownerFilter({ expiresAt: { $lte: new Date() } }));
  const tasks: Promise<unknown>[] = [];
  if (
    settings.bountyRefresh &&
    (await lease("bounty-scheduled", settings.refreshHours * 3600))
  )
    tasks.push(
      (async () => {
        const skills = await ownerSkills();
        const checks = await Promise.allSettled([
          discoverBounties(settings.bountyQuery, skills),
          verifySavedBounties(skills),
        ]);
        for (const check of checks) {
          if (check.status === "rejected")
            failures.push(
              check.reason instanceof Error
                ? check.reason.message
                : "Bounty check failed.",
            );
          else
            failures.push(
              ...(Array.isArray(check.value)
                ? check.value
                : check.value.failures),
            );
        }
      })(),
    );
  if (
    settings.youtubeRefresh &&
    (await lease("youtube-scheduled", settings.refreshHours * 3600))
  ) {
    tasks.push(
      refreshSavedYoutube().then((result) => {
        failures.push(...result);
      }),
    );
    tasks.push(
      (async () => {
        const topic = (await list<ResearchTopic>("topics"))[0];
        if (topic) {
          const result = await discoverVideos({
            query: topic.title,
            channelId: topic.channelId,
          });
          await put("sources", {
            id: "youtube",
            name: "YouTube",
            mode: "Official API",
            message: `Research check found ${result.videos.length} candidates for ${topic.title}. Open Research to search and save references.`,
            checkedAt: new Date().toISOString(),
          });
        }
      })(),
    );
    const integrations = await (
      await db()
    )
      .collection("workspace_oauth")
      .find(ownerFilter())
      .sort({ lastSyncAt: 1 })
      .limit(3)
      .toArray();
    for (const integration of integrations)
      tasks.push(
        (async () => {
          const reports = await channelAnalytics(
            integration.id,
            new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
            new Date(Date.now() - 86400000).toISOString().slice(0, 10),
          );
          if (
            !(await (
              await db()
            )
              .collection("workspace_oauth")
              .findOne(ownerFilter({ id: integration.id })))
          )
            return;
          await (await db()).collection("workspace_youtube_cache").updateOne(
            ownerFilter({ kind: "analytics", id: integration.id }),
            {
              $set: {
                owner: OWNER,
                kind: "analytics",
                id: integration.id,
                reports,
                expiresAt: new Date(Date.now() + 86400000),
              },
            },
            { upsert: true },
          );
        })(),
      );
  }
  const checks = await Promise.allSettled(tasks);
  for (const check of checks)
    if (check.status === "rejected")
      failures.push(
        check.reason instanceof Error
          ? check.reason.message
          : "Module background check failed.",
      );
  await (
    await collection("sources")
  ).updateOne(
    ownerFilter({ id: "schedule" }),
    {
      $set: {
        owner: OWNER,
        id: "schedule",
        name: "Module scheduler",
        mode: "Existing daily cron",
        message:
          failures.join(" ") ||
          "Scheduled checks completed. Disabled integrations were skipped.",
        checkedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
  return { failures };
}
