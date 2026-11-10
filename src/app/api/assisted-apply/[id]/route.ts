import {
  assistedHeaders,
  assistedError,
  loadAttempt,
  publicAttempt,
  attemptCommand,
} from "@/lib/assisted-store";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, ctx: Context) {
  try {
    return Response.json(
      publicAttempt(await loadAttempt((await ctx.params).id)),
      { headers: assistedHeaders },
    );
  } catch (e) {
    return assistedError(e);
  }
}
export async function POST(request: Request, ctx: Context) {
  try {
    return Response.json(
      await attemptCommand((await ctx.params).id, await request.json()),
      { headers: assistedHeaders },
    );
  } catch (e) {
    return assistedError(e);
  }
}
