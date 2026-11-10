import {
  assistedCollection,
  assistedHeaders,
  assistedError,
  approveAttempt,
  publicAttempt,
} from "@/lib/assisted-store";
export async function GET() {
  try {
    return Response.json(
      await (
        await assistedCollection()
      )
        .find({})
        .sort({ updatedAt: -1 })
        .limit(100)
        .toArray()
        .then((rows) => rows.map(publicAttempt)),
      { headers: assistedHeaders },
    );
  } catch (e) {
    return assistedError(e);
  }
}
export async function POST(request: Request) {
  try {
    return Response.json(await approveAttempt(await request.json()), {
      status: 201,
      headers: assistedHeaders,
    });
  } catch (e) {
    return assistedError(e);
  }
}
