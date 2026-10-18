import { db } from "./db";
import { discover } from "./discovery";
import { match } from "./matching";
import { emptyProfile } from "./types";
export async function runDiscovery() {
  const result = await discover();
  if (!process.env.MONGODB_URI) return { ...result, persisted: false };
  const database = await db();
  await Promise.all([
    database.collection("jobs").createIndex({ id: 1 }, { unique: true }),
    database
      .collection("notifications")
      .createIndex({ id: 1 }, { unique: true }),
  ]);
  for (const source of result.successfulSources)
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
    postedAt: { $lt: new Date(Date.now() - 30 * 86400000).toISOString() },
  });
  return {
    ...result,
    jobs: result.jobs.map((j) => match(j, profile)),
    persisted: true,
  };
}
