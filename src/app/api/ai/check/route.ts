import { AiError, aiJson, aiModel, aiConnection } from "@/lib/ai";
export const maxDuration = 30;
export async function POST() {
  try {
    let usedModel=aiModel();
    const result = (await aiJson(
      'Return {"ok":true}. This is a connectivity check with no personal data.',
      {},
      {onModelUsed:model=>{usedModel=model;}},
    )) as { ok?: boolean } | null;
    if (result?.ok !== true)
      throw new AiError("AI returned an unexpected response. Please retry.");
    return Response.json(
      {
        ok: true,
        provider: aiConnection().provider,
        model: usedModel,
        recovered:usedModel!==aiModel(),
        message: `${aiConnection().label} connection verified using ${usedModel}${usedModel!==aiModel()?" after automatic recovery":""}. Full CV requests still require successful factual checks.`,
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
