import { db, errorResponse } from "@/lib/db";
export async function GET() {
  try {
    return Response.json(
      await (
        await db()
      )
        .collection("notifications")
        .find({ read: false })
        .sort({ createdAt: -1 })
        .limit(30)
        .toArray(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH() {
  try {
    await (
      await db()
    )
      .collection("notifications")
      .updateMany({ read: false }, { $set: { read: true } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
