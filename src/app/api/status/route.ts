import { aiConnection } from "@/lib/ai";
export const dynamic = "force-dynamic";
export async function GET() {
  const connection = aiConnection();
  return Response.json(
    {
      database: !!process.env.MONGODB_URI,
      ai: connection.configured,
      aiProvider: connection.provider,
      aiLabel: connection.label,
      aiModel: connection.model,
      aiConfigurationError: connection.configurationError,
      scheduler: !!process.env.CRON_SECRET,
      protected: !!process.env.APP_PASSWORD,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
