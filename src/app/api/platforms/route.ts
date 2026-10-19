import { jobPlatforms, platformEnabled } from "@/lib/job-platforms";
export async function GET() {
  const platforms = jobPlatforms.map((p) => ({
    ...p,
    enabled: platformEnabled(p),
  }));
  return Response.json(
    {
      platforms,
      automated: platforms.filter((p) => p.access !== "manual").length,
      enabled: platforms.filter((p) => p.enabled).length,
      manual: platforms.filter((p) => p.access === "manual").length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
