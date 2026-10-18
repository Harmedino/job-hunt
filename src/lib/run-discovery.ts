import { db } from "./db";
import { discover } from "./discovery";
import { match, relevant, fullyRemote } from "./matching";
import type { Job } from "./types";
import { emptyProfile } from "./types";
import type { DiscoveryResponse, DiscoverySummary } from "./discovery-types";
export async function runDiscovery(): Promise<DiscoveryResponse & DiscoverySummary> {
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
    for (const source of result.sources.filter((s) => s.status === "ok").map((s) => s.source))
      await database.collection("jobs").deleteMany({
        source,
        id: {
          $nin: result.jobs.filter((j) => j.source === source).map((j) => j.id),
        },
      });
    const profile =
      (await database.collection("profile").findOne({ key: "owner" }))?.profile ||
      emptyProfile;
    for (const job of result.jobs) {
      const scored = match(job, profile);
      await database.collection("jobs").updateOne(
        { id: job.id },
        {
          $set: { ...scored, lastSeenAt: result.checkedAt },
          $setOnInsert: { firstSeenAt: result.checkedAt },
        },
        { upsert: true },
      );
      if (
        scored.score >= 65 &&
        scored.eligibility === "eligible" &&
        Date.now() - Date.parse(scored.postedAt) <= 72 * 3600000
      )
        await database.collection("notifications").updateOne(
          { id: job.id },
          {
            $setOnInsert: {
              id: job.id,
              title: `New match: ${job.title} at ${job.company}`,
              createdAt: result.checkedAt,
              read: false,
            },
          },
          { upsert: true },
        );
    }
    await database.collection("jobs").deleteMany({
      $or: [
        { postedAt: { $lt: new Date(Date.now() - 30 * 86400000).toISOString() } },
        { expiresAt: { $lt: new Date().toISOString() } },
      ],
    });
    const summary = { checkedAt: result.checkedAt, sources: result.sources, failures: result.failures, successfulSources: result.successfulSources };
    await database.collection("discovery_state").updateOne(
      { key: "latest" }, { $set: summary }, { upsert: true },
    );
    const cached = await database.collection("jobs").find({}).sort({ postedAt: -1 }).limit(500).toArray();
    return {
      ...result,
      jobs: cached.filter((j) => relevant(j.title, j.description) && fullyRemote(j.title, j.location, j.description))
        .map((j) => match(j as unknown as Job, profile)),
      persisted: true,
    };
  } catch (error) {
    console.error("Discovery storage failed:", error instanceof Error ? error.name : "UnknownError");
    return { ...result, persisted: false, storageWarning: "Live results are shown, but could not be saved. Check your MongoDB connection before saving jobs or preparing applications." };
  }
}
