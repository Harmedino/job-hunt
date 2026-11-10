import { requestOrigin } from "@/lib/auth";
import { createHandoff } from "@/lib/assisted-handoff";
import { assistedHeaders, assistedError } from "@/lib/assisted-store";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json(),
      result = await createHandoff((await params).id, body.extensionId);
    const code =
      "launchpad1." +
      Buffer.from(
        JSON.stringify({ ...result, origin: requestOrigin(request) }),
      ).toString("base64url");
    return Response.json(
      { code, expiresAt: result.expiresAt },
      { headers: assistedHeaders },
    );
  } catch (e) {
    return assistedError(e);
  }
}
