import { runDiscovery } from "@/lib/run-discovery";
import { db, errorResponse } from "@/lib/db";
import { match, fullyRemote, relevant } from "@/lib/matching";
import { DISCOVERY_REVISION } from "@/lib/discovery-types";
import { emptyProfile } from "@/lib/types";
export const maxDuration = 60;
export async function POST() {
  try {
    return Response.json(await runDiscovery());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET() {
  if (!process.env.MONGODB_URI)
    return Response.json({
      jobs: [],
      persisted: false,
      refreshRecommended: true,
    });
  try {
    const database = await db();
    const profile =
      (await database.collection("profile").findOne({ key: "owner" }))
        ?.profile || emptyProfile;
    const latest = await database
      .collection("discovery_state")
      .findOne({ key: "latest" });
    const jobs = await database
      .collection("jobs")
      .find({
        postedAt: { $gte: new Date(Date.now() - 30 * 86400000).toISOString() },
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gte: new Date().toISOString() } },
        ],
      })
      .sort({ postedAt: -1 })
      .limit(500)
      .toArray();
    return Response.json({
      checkedAt: latest?.checkedAt,
      sources: latest?.sources,
      failures: latest?.failures || [],
      successfulSources: latest?.successfulSources || [],
      refreshRecommended:
        latest?.revision !== DISCOVERY_REVISION ||
        !latest?.checkedAt ||
        Date.now() - Date.parse(latest.checkedAt) >
          (latest.successfulSources?.length ? 6 * 3600000 : 15 * 60000),
      jobs: jobs
        .filter(
          (j) =>
            relevant(j.title, j.description) &&
            fullyRemote(j.title, j.location, j.description),
        )
        .map((j) => match(j as unknown as import("@/lib/types").Job, profile)),
      persisted: true,
    });
  } catch (error) {
    console.error(
      "Discovery cache unavailable:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json({
      jobs: [],
      persisted: false,
      refreshRecommended: true,
      storageWarning:
        "Saved jobs could not be loaded. A live search can still run; check MongoDB before saving.",
    });
  }
}
