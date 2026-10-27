import { db, errorResponse } from "@/lib/db";
import { extractLead } from "@/lib/lead-extraction";
import { leadJob } from "@/lib/lead-verification";
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
  let additional: ReturnType<typeof parseSocialLead>[] = [];
  try {
    const body = await request.json();
    const blocks =
      body.platform === "Indeed alert" && typeof body.text === "string"
        ? body.text
            .split(/\n(?=(?:Job title|Title|Position|Role):)/i)
            .filter((text: string) => text.trim().length >= 30)
        : [];
    if (blocks.length > 1) {
      additional = blocks
        .slice(0, 20)
        .map((text: string) =>
          parseSocialLead({
            ...body,
            text,
            url: extractLead(text).applicationUrl || "",
          }),
        );
      lead = additional.shift()!;
    } else lead = parseSocialLead(body);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid post" },
      { status: 400 },
    );
  }
  try {
    const collection = (await db()).collection("social_leads");
    await collection.createIndex({ id: 1 }, { unique: true });
    for (const item of [lead, ...additional]) {
      await collection.updateOne(
        { id: item.id },
        {
          $setOnInsert: {
            ...item,
            createdAt: new Date().toISOString(),
            status: "Needs verification",
          },
        },
        { upsert: true },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id))
      return Response.json({ error: "Invalid lead ID" }, { status: 400 });
    if (body.action === "verify") {
      const database = await db();
      const lead = await database.collection("social_leads").findOne({ id });
      if (!lead)
        return Response.json({ error: "Post not found" }, { status: 404 });
      let job;
      try {
        job = leadJob(
          lead as unknown as import("@/lib/social").SocialLead,
          body,
        );
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 400 });
      }
      const duplicate = await database
        .collection("jobs")
        .findOne({ $or: [{ id: job.id }, { url: job.url }] });
      const jobId = duplicate?.id || job.id;
      if (!duplicate)
        await database
          .collection("jobs")
          .updateOne({ id: job.id }, { $setOnInsert: job }, { upsert: true });
      await database
        .collection("social_leads")
        .updateOne(
          { id },
          {
            $set: {
              status: "Verified",
              jobId,
              verification: {
                reviewedAt: new Date().toISOString(),
                evidenceUrl: body.evidenceUrl,
                method: "User-reviewed original posting",
              },
            },
          },
        );
      return Response.json({ ok: true, jobId, job: duplicate || job });
    }
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
