import { db, errorResponse } from "@/lib/db";
export async function GET(request: Request) {
  try {
    const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      return Response.json(
        { error: "Invalid profile history page." },
        { status: 400 },
      );
    return Response.json(
      await (
        await db()
      )
        .collection("profile_history")
        .find({ key: "owner" }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(100)
        .toArray(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
