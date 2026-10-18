export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({
    database: !!process.env.MONGODB_URI,
    ai: !!process.env.OPENAI_API_KEY,
    scheduler: !!process.env.CRON_SECRET,
    protected: !!process.env.APP_PASSWORD,
  });
}
