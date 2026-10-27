import {
  JOB_WINDOW_MS,
  recentPosting,
  activeBoardPosting,
} from "./job-freshness";
import { db } from "./db";
import { discover } from "./discovery";
import { match, relevant, fullyRemote } from "./matching";
import type { Job } from "./types";
import { emptyProfile } from "./types";
import { DISCOVERY_REVISION } from "./discovery-types";
import type { DiscoveryResponse, DiscoverySummary } from "./discovery-types";
export async function runDiscovery(): Promise<
  DiscoveryResponse & DiscoverySummary
> {
  const result = await discover();
  if (!process.env.MONGODB_URI) return { ...result, persisted: false };
  try {
    const database = await db();
    await Promise.all([
      database.collection("jobs").createIndex({ id: 1 }, { unique: true }),
      database
        .collection("notifications")
        .createIndex({ id: 1 }, { unique: true }),
    ]);
    for (const source of result.sources
      .filter((s) => s.status === "ok")
      .map((s) => s.source))
      await database.collection("jobs").deleteMany({
        source,
        id: {
          $nin: result.jobs.filter((j) => j.source === source).map((j) => j.id),
        },
      });
    const profile =
      (await database.collection("profile").findOne({ key: "owner" }))
        ?.profile || emptyProfile;
    const scoredJobs = result.jobs.map((job) => match(job, profile));
    if (scoredJobs.length) {
      await database.collection("jobs").bulkWrite(
        scoredJobs.map((job) => ({
          updateOne: {
            filter: { id: job.id },
            update: {
              $set: { ...job, lastSeenAt: result.checkedAt },
              $unset: { closedAt: "" },
              $setOnInsert: { firstSeenAt: result.checkedAt },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      const notifications = scoredJobs.filter(
        (job) =>
          job.score >= 65 &&
          job.eligibility === "eligible" &&
          Date.now() - Date.parse(job.postedAt) <= 72 * 3600000,
      );
      if (notifications.length)
        await database.collection("notifications").bulkWrite(
          notifications.map((job) => ({
            updateOne: {
              filter: { id: job.id },
              update: {
                $setOnInsert: {
                  id: job.id,
                  title: `New match: ${job.title} at ${job.company}`,
                  createdAt: result.checkedAt,
                  read: false,
                },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
    }
    await database.collection("jobs").deleteMany({
      $or: [
        {
          $and: [
            {
              postedAt: {
                $lt: new Date(Date.now() - JOB_WINDOW_MS).toISOString(),
              },
            },
            {
              $or: [
                { lastVerifiedAt: { $exists: false } },
                {
                  lastVerifiedAt: {
                    $lt: new Date(Date.now() - 24 * 3600000).toISOString(),
                  },
                },
              ],
            },
          ],
        },
        { expiresAt: { $lt: new Date().toISOString() } },
      ],
    });
    const summary = {
      revision: DISCOVERY_REVISION,
      checkedAt: result.checkedAt,
      sources: result.sources,
      failures: result.failures,
      successfulSources: result.successfulSources,
    };
    await database
      .collection("discovery_state")
      .updateOne({ key: "latest" }, { $set: summary }, { upsert: true });
    const cached = await database
      .collection("jobs")
      .find({closedAt:{$exists:false}})
      .sort({ postedAt: -1 })
      .limit(500)
      .toArray();
    return {
      ...result,
      jobs: cached
        .filter(
          (j) =>
            (recentPosting(j.postedAt, Date.now(), 30) ||
              (activeBoardPosting(j as unknown as Job) || (j.source?.startsWith("Verified lead") && Date.now()-Date.parse(j.lastVerifiedAt || "")<86400000))) &&
            (!j.expiresAt || Date.parse(j.expiresAt) >= Date.now()) &&
            relevant(j.title, j.description) &&
            fullyRemote(j.title, j.location, j.description),
        )
        .map((j) => match(j as unknown as Job, profile)),
      persisted: true,
    };
  } catch (error) {
    console.error(
      "Discovery storage failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return {
      ...result,
      persisted: false,
      storageWarning:
        "Live results are shown, but could not be saved. Check your MongoDB connection before saving jobs or preparing applications.",
    };
  }
}
