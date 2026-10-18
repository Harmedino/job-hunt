import { db, errorResponse } from "@/lib/db";
import { parseSocialLead } from "@/lib/social";
export async function GET() {
  try {
    return Response.json(
      await (
        await db()
      )
        .collection("social_leads")
        .find({ status: "Needs verification" }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  let lead: ReturnType<typeof parseSocialLead>;
  try {
    lead = parseSocialLead(await request.json());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid post" },
      { status: 400 },
    );
  }
  try {
    const collection = (await db()).collection("social_leads");
    await collection.createIndex({ id: 1 }, { unique: true });
    await collection.updateOne(
      { id: lead.id },
      {
        $setOnInsert: {
          ...lead,
          createdAt: new Date().toISOString(),
          status: "Needs verification",
        },
      },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const { id } = await request.json();
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id))
      return Response.json({ error: "Invalid lead ID" }, { status: 400 });
    const result = await (
      await db()
    )
      .collection("social_leads")
      .updateOne({ id }, { $set: { status: "Archived" } });
    if (!result.matchedCount)
      return Response.json({ error: "Post not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
