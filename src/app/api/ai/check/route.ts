import { AiError, aiJson, aiModel, aiConnection } from "@/lib/ai";
export const maxDuration = 30;
export async function POST() {
  try {
    const result = (await aiJson(
      'Return {"ok":true}. This is a connectivity check with no personal data.',
      {},
    )) as { ok?: boolean } | null;
    if (result?.ok !== true)
      throw new AiError("AI returned an unexpected response. Please retry.");
    return Response.json(
      {
        ok: true,
        provider: aiConnection().provider,
        model: aiModel(),
        message: `${aiConnection().label} connection verified. CV extraction, tailored CV and cover-letter writing, and job-specific evidence ranking are available.`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AiError
            ? error.message
            : "AI connection check failed.",
      },
      {
        status: error instanceof AiError ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
