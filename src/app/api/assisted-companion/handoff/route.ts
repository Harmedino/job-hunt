import { companionCors, consumeHandoff } from "@/lib/assisted-handoff";
import { assistedError } from "@/lib/assisted-store";
export async function OPTIONS(request: Request) {
  try {
    return new Response(null, { status: 204, headers: companionCors(request) });
  } catch (e) {
    return assistedError(e);
  }
}
export async function POST(request: Request) {
  try {
    return Response.json(await consumeHandoff(request, await request.json()), {
      headers: companionCors(request),
    });
  } catch (e) {
    const r = assistedError(e);
    try {
      for (const [k, v] of Object.entries(companionCors(request)))
        r.headers.set(k, v);
    } catch {}
    return r;
  }
}
