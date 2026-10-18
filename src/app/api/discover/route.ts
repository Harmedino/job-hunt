import { runDiscovery } from "@/lib/run-discovery";
import { db, errorResponse } from "@/lib/db";
import { match, fullyRemote } from "@/lib/matching";
import { emptyProfile } from "@/lib/types";
export async function POST() {
  try {
    return Response.json(await runDiscovery());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET() {
  if (!process.env.MONGODB_URI)
    return Response.json({ jobs: [], persisted: false });
  try {
    const database = await db();
    const profile =
      (await database.collection("profile").findOne({ key: "owner" }))
        ?.profile || emptyProfile;
    const jobs = await database
      .collection("jobs")
      .find({
        postedAt: { $gte: new Date(Date.now() - 30 * 86400000).toISOString() },
      })
      .sort({ postedAt: -1 })
      .limit(500)
      .toArray();
    return Response.json({
      jobs: jobs
        .filter((j) => fullyRemote(j.title, j.location, j.description))
        .map((j) => match(j as unknown as import("@/lib/types").Job, profile)),
      persisted: true,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
