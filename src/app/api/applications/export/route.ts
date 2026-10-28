import type { Application } from "@/lib/types";
import { db, errorResponse } from "@/lib/db";
import { applicationExport, applicationsCsv } from "@/lib/application-export";
import { calendarToday } from "@/lib/application-updates";
import { applicationHeaders } from "@/lib/application-store";
export async function GET(request: Request) {
  try {
    const format = new URL(request.url).searchParams.get("format") || "json";
    if (!["json", "csv"].includes(format))
      return Response.json({ error: "Choose CSV or JSON." }, { status: 400 });
    const apps = await (await db())
      .collection<Application>("applications")
      .find({})
      .sort({ createdAt: 1 })
      .toArray();
    return new Response(
      format === "csv"
        ? applicationsCsv(apps)
        : JSON.stringify(
            {
              schemaVersion: 1,
              exportedAt: new Date().toISOString(),
              applications: apps.map(applicationExport),
            },
            null,
            2,
          ),
      {
        headers: {
          ...applicationHeaders,
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="application-history-${calendarToday()}.${format}"`,
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
