import { db } from "@/lib/db";
import {
  assistedHeaders,
  assistedError,
  bankAnswers,
  saveAnswer,
  bounded,
} from "@/lib/assisted-store";
export async function GET() {
  try {
    return Response.json(await bankAnswers(), { headers: assistedHeaders });
  } catch (e) {
    return assistedError(e);
  }
}
export async function PUT(request: Request) {
  try {
    return Response.json(await saveAnswer(await request.json()), {
      headers: assistedHeaders,
    });
  } catch (e) {
    return assistedError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    await (await db())
      .collection("assisted_answers")
      .deleteOne({ id: bounded(body.id, "answer", 100) });
    return Response.json({ ok: true }, { headers: assistedHeaders });
  } catch (e) {
    return assistedError(e);
  }
}
