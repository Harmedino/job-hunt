import { db } from "@/lib/db";
import {
  assistantPolicy,
  validateAssistantPolicy,
} from "@/lib/assistant-policy";
import { assistedHeaders, assistedError } from "@/lib/assisted-store";
export async function GET() {
  try {
    return Response.json(await assistantPolicy(), { headers: assistedHeaders });
  } catch (e) {
    return assistedError(e);
  }
}
export async function PUT(request: Request) {
  try {
    const policy = validateAssistantPolicy(await request.json());
    await (await db())
      .collection("assistant_settings")
      .updateOne(
        { key: "owner" },
        { $set: { policy, updatedAt: new Date().toISOString() } },
        { upsert: true },
      );
    return Response.json(policy, { headers: assistedHeaders });
  } catch (e) {
    return assistedError(e);
  }
}
