import { db, errorResponse } from "@/lib/db";
import type { Application } from "@/lib/types";
import { storeOriginalFile } from "@/lib/application-files";
import { CvInputError } from "@/lib/cv";
import { MAX_CV_BYTES } from "@/lib/cv-limits";
import { applicationWasApplied } from "@/lib/vacancy-groups";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (
      Number(request.headers.get("content-length")) >
      MAX_CV_BYTES + 128 * 1024
    )
      return Response.json(
        { error: "Choose a document up to 4 MB." },
        { status: 413 },
      );
    const app = await (await db())
      .collection<Application>("applications")
      .findOne({ id: (await params).id });
    if (!app)
      return Response.json(
        { error: "Application not found." },
        { status: 404 },
      );
    if (!applicationWasApplied(app))
      return Response.json(
        {
          error:
            "Record actual submission before attaching the original submitted documents.",
        },
        { status: 409 },
      );
    const form = await request.formData(),
      file = form.get("file"),
      kind = form.get("kind");
    if (
      !(file instanceof File) ||
      !["cv", "letter"].includes(String(kind)) ||
      form.get("originalConfirmed") !== "true"
    )
      return Response.json(
        {
          error:
            "Choose a CV or cover-letter file and confirm that it is the actual submitted document.",
        },
        { status: 400 },
      );
    const reason = String(form.get("correctionReason") || "");
    if (reason.length > 1000)
      return Response.json(
        { error: "Keep correction reasons under 1,000 characters." },
        { status: 400 },
      );
    const result = await storeOriginalFile(
      app,
      file,
      kind as "cv" | "letter",
      reason,
      form.get("correctionConfirmed") === "true",
    );
    if ("error" in result)
      return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof CvInputError)
      return Response.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
