import { randomUUID } from "node:crypto";
import { db, errorResponse } from "@/lib/db";
import { searchLink } from "@/lib/job-search-links";
export async function GET() {
  try {
    return Response.json(
      await (
        await db()
      )
        .collection("job_search_links")
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  let input;
  try {
    input = searchLink(await request.json());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  try {
    const c = (await db()).collection("job_search_links");
    await c.createIndex({ url: 1 }, { unique: true });
    await c.updateOne(
      { url: input.url },
      {
        $setOnInsert: {
          ...input,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (typeof id !== "string" || id.length > 100)
      return Response.json({ error: "Invalid search" }, { status: 400 });
    await (await db()).collection("job_search_links").deleteOne({ id });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
