import { db, errorResponse } from "@/lib/db";
import { emptyProfile, type Profile } from "@/lib/types";
export async function GET() {
  try {
    const doc = await (
      await db()
    )
      .collection("profile")
      .findOne({ key: "owner" });
    return Response.json(doc?.profile || emptyProfile);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const profile = { ...emptyProfile };
    for (const key of Object.keys(profile) as (keyof Profile)[]) {
      if (typeof body[key] !== "string" || body[key].length > 50000)
        return Response.json(
          { error: "Invalid profile field: " + key },
          { status: 400 },
        );
      profile[key] = body[key];
    }
    await (
      await db()
    )
      .collection("profile")
      .updateOne({ key: "owner" }, { $set: { profile } }, { upsert: true });
    return Response.json(profile);
  } catch (e) {
    return errorResponse(e);
  }
}
