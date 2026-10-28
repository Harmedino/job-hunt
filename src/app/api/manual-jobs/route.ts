import { db, errorResponse } from "@/lib/db";
import { validateManualJob, type ManualJob } from "@/lib/manual-jobs";
export async function GET() {
  try {
    return Response.json(
      await (
        await db()
      )
        .collection<ManualJob>("manual_jobs")
        .find({}, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .toArray(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
async function save(request: Request, edit: boolean) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return Response.json({ error: "Invalid manual job." }, { status: 400 });
    const collection = (await db()).collection<ManualJob>("manual_jobs");
    await collection.createIndex({ id: 1 }, { unique: true });
    let existing: ManualJob | undefined;
    if (edit) {
      if (typeof body.id !== "string" || body.id.length > 100)
        return Response.json(
          { error: "Invalid manual job ID." },
          { status: 400 },
        );
      existing =
        (await collection.findOne(
          { id: body.id },
          { projection: { _id: 0 } },
        )) || undefined;
      if (!existing)
        return Response.json(
          { error: "Manual job not found." },
          { status: 404 },
        );
    }
    let job;
    try {
      job = validateManualJob(body, existing);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
    if (existing) {
      const result = await collection.replaceOne(
        { id: existing.id, updatedAt: body.updatedAt || existing.updatedAt },
        job,
      );
      if (!result.matchedCount)
        return Response.json(
          { error: "This job changed elsewhere. Reload before replacing it." },
          { status: 409 },
        );
    } else await collection.insertOne(job);
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
