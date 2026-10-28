import type { Job } from "@/lib/types";
import { db, errorResponse } from "@/lib/db";
import {
  applicationHeaders,
  applicationError,
  ApplicationInputError,
  applicationIndexes,
  ensureJobApplication,
  updateApplication,
  createManualApplication,
} from "@/lib/application-store";
export async function GET() {
  try {
    return Response.json(
      await (
        await applicationIndexes()
      )
        .find({}, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .toArray(),
      { headers: applicationHeaders },
    );
  } catch (e) {
    return applicationError(e) || errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApplicationInputError("Invalid application.");
    if (body.manual === true)
      return Response.json(await createManualApplication(body), {
        headers: applicationHeaders,
      });
    if (typeof body.jobId !== "string" || body.jobId.length > 200)
      throw new ApplicationInputError("Invalid job ID.");
    if (
      body.markApplied === true &&
      (!body.applicationDate || body.submissionConfirmed !== true)
    )
      throw new ApplicationInputError(
        "Confirm submission and enter the date you actually applied.",
      );
    const database = await db(),
      job =
        (await database.collection("jobs").findOne({ id: body.jobId })) ||
        (await database
          .collection("manual_jobs")
          .findOne({ id: body.jobId })) ||
        (
          await database
            .collection("applications")
            .findOne({ "job.id": body.jobId })
        )?.job;
    if (!job)
      throw new ApplicationInputError(
        "Refresh discovery before saving this job, or record an outside application manually.",
      );
    const app = await ensureJobApplication(
      job as unknown as Job,
      job.manual ? "manual" : "discovered",
    );
    return Response.json(
      body.markApplied
        ? await updateApplication({ ...body, id: app.id, status: "Submitted" })
        : app,
      { headers: applicationHeaders },
    );
  } catch (e) {
    return applicationError(e) || errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    await updateApplication(await request.json());
    return Response.json({ ok: true }, { headers: applicationHeaders });
  } catch (e) {
    return applicationError(e) || errorResponse(e);
  }
}
