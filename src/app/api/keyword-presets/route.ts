import { randomUUID } from "node:crypto";
import { db, errorResponse } from "@/lib/db";
import { validateKeywords } from "@/lib/job-keywords";
export async function GET() {
  try {
    return Response.json(
      await (
        await db()
      )
        .collection("keyword_presets")
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
  try {
    const body = await request.json();
    if (
      typeof body?.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 100
    )
      return Response.json(
        { error: "Name this keyword preset (up to 100 characters)." },
        { status: 400 },
      );
    let keywords;
    try {
      keywords = validateKeywords(body.keywords);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
    const id =
        typeof body.id === "string" && body.id.length <= 100
          ? body.id
          : randomUUID(),
      record = {
        id,
        name: body.name.trim(),
        keywords,
        updatedAt: new Date().toISOString(),
      };
    const collection = (await db()).collection("keyword_presets");
    await collection.createIndex({ id: 1 }, { unique: true });
    await collection.updateOne({ id }, { $set: record }, { upsert: true });
    return Response.json(record);
  } catch (e) {
    return errorResponse(e);
  }
}
