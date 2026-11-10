import { authenticateCompanion, companionCors } from "@/lib/assisted-handoff";
import {
  AssistedError,
  assistedError,
  attemptCommand,
} from "@/lib/assisted-store";
import { proposeMappings } from "@/lib/assisted-mapping";
type Context = { params: Promise<{ id: string }> };
export async function OPTIONS(request: Request) {
  try {
    return new Response(null, { status: 204, headers: companionCors(request) });
  } catch (e) {
    return assistedError(e);
  }
}
export async function GET(request: Request, ctx: Context) {
  try {
    const { attempt } = await authenticateCompanion(
      request,
      (await ctx.params).id,
    );
    return Response.json(
      { package: attempt.package, sha256: attempt.packageHash },
      { headers: companionCors(request) },
    );
  } catch (e) {
    return assistedError(e);
  }
}
export async function POST(request: Request, ctx: Context) {
  try {
    const id = (await ctx.params).id,
      { token, attempt } = await authenticateCompanion(request, id),
      body = await request.json();
    if (body.action === "suggest")
      return Response.json(await proposeMappings(attempt), {
        headers: companionCors(request),
      });
    if (
      ![
        "heartbeat",
        "verify",
        "submit-intent",
        "receipt",
        "release",
        "failure",
      ].includes(body.action)
    )
      throw new AssistedError(
        "This handoff does not authorize that action.",
        403,
      );
    return Response.json(
      await attemptCommand(id, { ...body, leaseToken: token }),
      { headers: companionCors(request) },
    );
  } catch (e) {
    const r = assistedError(e);
    try {
      for (const [k, v] of Object.entries(companionCors(request)))
        r.headers.set(k, v);
    } catch {}
    return r;
  }
}
