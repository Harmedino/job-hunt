import {
  candidateSources,
  researchSources,
  type ResearchSource,
} from "@/lib/source-directory";
import { db, errorResponse } from "@/lib/db";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  if (!process.env.MONGODB_URI)
    return Response.json({ sources: candidateSources, persisted: false });
  try {
    const saved = await (
      await db()
    )
      .collection<ResearchSource>("source_directory")
      .find({}, { projection: { _id: 0 } })
      .toArray();
    const candidates = new Set(candidateSources.map((s) => s.id));
    const relevant = saved.filter(
      (s) =>
        candidates.has(s.id) ||
        (s.publisherId && candidates.has(s.publisherId)),
    );
    const ids = new Set(relevant.map((s) => s.id));
    return Response.json({
      sources: [...relevant, ...candidateSources.filter((s) => !ids.has(s.id))],
      persisted: true,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST() {
  try {
    const result = await researchSources();
    let persisted = false;
    if (process.env.MONGODB_URI) {
      const collection = (await db()).collection<ResearchSource>(
        "source_directory",
      );
      await collection.createIndex({ id: 1 }, { unique: true });
      for (const publisher of result.sources.filter(
        (s) =>
          s.platform === "Publisher website" &&
          s.status === "Website accessible",
      )) {
        await collection.deleteMany({
          publisherId: publisher.id,
          id: {
            $nin: result.sources
              .filter((s) => s.publisherId === publisher.id)
              .map((s) => s.id),
          },
        });
      }
      for (const source of result.sources)
        await collection.updateOne(
          { id: source.id },
          { $set: source },
          { upsert: true },
        );
      persisted = true;
    }
    return Response.json({ ...result, persisted });
  } catch (e) {
    return errorResponse(e);
  }
}
