import { AiError } from "./ai";
import { db, errorResponse } from "./db";
import {
  ResumeInputError,
  type ResumeDraft,
  type ResumeTarget,
} from "./resume-types";
export const privateHeaders = { "Cache-Control": "no-store" };
export function resumeError(error: unknown) {
  if (error instanceof AiError || error instanceof ResumeInputError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: privateHeaders },
    );
  return errorResponse(error);
}
export function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 100;
}
export async function loadResume(id: unknown) {
  if (!validId(id)) throw new ResumeInputError("Invalid CV version.");
  const record = await (
    await db()
  )
    .collection<ResumeDraft>("resumes")
    .findOne({ id }, { projection: { _id: 0 } });
  if (!record) throw new ResumeInputError("CV version not found.", 404);
  return record as ResumeDraft;
}
export async function resumeTarget(
  body: Record<string, unknown>,
): Promise<ResumeTarget> {
  if (body.jobId !== undefined) {
    if (!validId(body.jobId)) throw new ResumeInputError("Invalid job.");
    const database = await db();
    let job = await database.collection("jobs").findOne({ id: body.jobId });
    if (body.applicationId !== undefined) {
      if (!validId(body.applicationId))
        throw new ResumeInputError("Invalid application.");
      const application = await database
        .collection("applications")
        .findOne({ id: body.applicationId, "job.id": body.jobId });
      if (!application)
        throw new ResumeInputError("Application not found.", 404);
      job = application.job;
    }
    if (!job)
      throw new ResumeInputError(
        "Job not found. You can paste its description into the CV builder instead.",
        404,
      );
    return {
      title: job.title,
      company: job.company,
      description: job.description,
      url: job.url,
      jobId: body.jobId,
      ...(typeof body.applicationId === "string"
        ? { applicationId: body.applicationId }
        : {}),
    };
  }
  const target = body.target;
  if (!target || typeof target !== "object" || Array.isArray(target))
    throw new ResumeInputError("Choose a job or paste its description.");
  const value = target as Record<string, unknown>;
  for (const key of ["title", "company", "description", "url"]) {
    if (
      typeof value[key] !== "string" ||
      value[key].length > (key === "description" ? 25000 : 500)
    )
      throw new ResumeInputError(`Invalid job ${key}.`);
  }
  if (
    !(value.title as string).trim() ||
    (value.description as string).trim().length < 50
  )
    throw new ResumeInputError(
      "Add a role title and at least 50 characters of job description.",
    );
  if (value.url) {
    try {
      const url = new URL(value.url as string);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error();
    } catch {
      throw new ResumeInputError(
        "Use a valid HTTPS job link, or leave it blank.",
      );
    }
  }
  return {
    title: (value.title as string).trim(),
    company: (value.company as string).trim(),
    description: (value.description as string).trim(),
    url: (value.url as string).trim(),
  };
}
