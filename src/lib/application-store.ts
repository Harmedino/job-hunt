import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import type { Application, Job } from "./types";
import {
  sameVacancy,
  vacancyGroupKey,
  applicationWasApplied,
} from "./vacancy-groups";
import {
  applicationUpdate,
  calendarToday,
  validCalendarDate,
} from "./application-updates";
import { applicationActions, statusHistory } from "./application-history";
export class ApplicationInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const applicationHeaders = { "Cache-Control": "no-store" };
export function applicationError(error: unknown) {
  return error instanceof ApplicationInputError
    ? Response.json(
        { error: error.message },
        { status: error.status, headers: applicationHeaders },
      )
    : undefined;
}
function text(v: unknown, label: string, max = 8000, required = false) {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw new ApplicationInputError(`Enter a valid ${label}.`);
  return v.trim();
}
export async function applicationIndexes() {
  const collection = (await db()).collection<Application>("applications");
  await collection.createIndex({ "job.id": 1 }, { unique: true });
  await collection.createIndex(
    { vacancyKey: 1 },
    { unique: true, sparse: true },
  );
  await collection.createIndex({ status: 1, followUpDate: 1 });
  await collection.createIndex({ applicationDate: -1, updatedAt: -1 });
  return collection;
}
export async function ensureJobApplication(
  job: Job,
  origin: Application["origin"] = "discovered",
) {
  const collection = await applicationIndexes(),
    existing = (await collection.find({}).toArray()).find((app) =>
      sameVacancy(job, app.job),
    );
  if (existing) {
    await collection.updateOne(
      { id: existing.id },
      {
        $set: { saved: true, updatedAt: new Date().toISOString() },
        $unset: { unsavedAt: "" },
      },
    );
    return { ...existing, saved: true };
  }
  const now = new Date().toISOString(),
    vacancyKey = createHash("sha256")
      .update(vacancyGroupKey(job) + (job.url ? "" : "|" + job.id))
      .digest("hex");
  const app: Application = {
    id: randomUUID(),
    job,
    status: "Saved",
    saved: true,
    origin,
    vacancyKey,
    createdAt: now,
    updatedAt: now,
    followUp: "",
    customFields: job.customFields || [],
    statusHistory: [{ status: "Saved", at: now }],
  };
  try {
    await collection.insertOne(app);
    return app;
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    const other = await collection.findOne({
      $or: [{ vacancyKey }, { "job.id": job.id }],
    });
    if (!other) throw e;
    return other;
  }
}
export async function updateApplication(body: Record<string, unknown>) {
  let parsed;
  try {
    parsed = applicationUpdate(body);
  } catch (e) {
    throw new ApplicationInputError((e as Error).message);
  }
  const { id, fields, saved, customFields } = parsed,
    collection = await applicationIndexes(),
    app = await collection.findOne({ id });
  if (!app) throw new ApplicationInputError("Application not found.", 404);
  if (saved === false && applicationWasApplied(app))
    throw new ApplicationInputError(
      "Applied jobs stay in application history and cannot be returned to new opportunities.",
      409,
    );
  const now = new Date().toISOString(),
    changes: Record<string, unknown> = { ...fields, updatedAt: now };
  if (customFields !== undefined) changes.customFields = customFields;
  if (saved !== undefined) {
    changes.saved = saved;
    if (!saved) changes.unsavedAt = now;
  }
  if (
    fields.status &&
    ["Submitted", "Interview", "Rejected", "Offer"].includes(fields.status)
  )
    changes.hasApplied = true;
  if (fields.status) {
    changes.statusHistory = statusHistory(app, fields.status, now);
    if (fields.status === "Archived") changes.saved = false;
  }
  const query: Record<string, unknown> = { id, updatedAt: app.updatedAt };
  if (app.updatedAt === undefined) delete query.updatedAt;
  if (saved === false) {
    query.submittedAt = { $exists: false };
    query.status = { $nin: ["Submitted", "Interview", "Rejected", "Offer"] };
  }
  if (fields.status === "Submitted" && !app.submittedAt) {
    if (fields.applicationDate === "")
      throw new ApplicationInputError("Enter the date you actually applied.");
    const supplied = body.cvDraftId !== undefined;
    const cvId = supplied
      ? text(body.cvDraftId, "CV version", 100)
      : app.cvDraftId;
    const cv = cvId
      ? await (await db())
          .collection("resumes")
          .findOne({ id: cvId }, { projection: { _id: 0 } })
      : null;
    if (cvId && !cv)
      throw new ApplicationInputError(
        "The selected original CV version was not found. Choose an available version or record it as unavailable.",
      );
    const usage =
      body.coverLetterUsed === undefined ? "unknown" : body.coverLetterUsed;
    if (!["yes", "no", "unknown"].includes(String(usage)))
      throw new ApplicationInputError(
        "Choose whether a cover letter was used.",
      );
    const letter =
      usage === "no"
        ? undefined
        : body.coverLetter === undefined
          ? usage === "yes"
            ? (cv?.coverLetter ?? app.coverLetter)
            : body.coverLetterUsed === undefined
              ? app.coverLetter
              : undefined
          : text(body.coverLetter, "submitted cover letter", 14000);
    changes.submittedAt = now;
    changes.saved = true;
    changes.documentSnapshot = {
      cv,
      coverLetter: letter,
      coverLetterUsed: usage,
      cvLabel:
        body.cvLabel === undefined
          ? ""
          : text(body.cvLabel, "original CV reference", 500),
      profileSnapshot: app.profileSnapshot,
      cvFacts: app.cvFacts,
      capturedAt: now,
    };
    query.submittedAt = { $exists: false };
  }
  const result = await collection.updateOne(query, { $set: changes });
  if (!result.matchedCount)
    throw new ApplicationInputError(
      "This application changed in another request. Reload it before updating.",
      409,
    );
  if (changes.documentSnapshot) {
    const submitted = await collection.findOne({ id });
    try {
      if (submitted)
        await (
          await import("./application-files")
        ).freezeSelectedDocuments(submitted);
    } catch {
      await collection.updateOne(
        { id },
        {
          $set: {
            "documentSnapshot.renderingWarning":
              "The selected version is preserved, but a file rendering could not be frozen. Attach the original submitted files if available.",
          },
        },
      );
    }
  }
  return await collection.findOne({ id });
}
export async function createManualApplication(body: Record<string, unknown>) {
  const company = text(body.company, "company name", 500, true),
    title = text(body.title, "job title", 500, true),
    url = body.url === undefined ? "" : text(body.url, "posting URL", 2000);
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new Error();
    } catch {
      throw new ApplicationInputError(
        "Use an HTTPS job posting URL without credentials, or leave it blank.",
      );
    }
  }
  const state =
    body.status === "Ready to Apply"
      ? "Ready for review"
      : body.status === "Preparing CV"
        ? "Preparing"
        : body.status || "Submitted";
  const needsSubmission = [
    "Submitted",
    "Interview",
    "Offer",
    "Rejected",
  ].includes(String(state));
  if (
    needsSubmission &&
    (body.submissionConfirmed !== true || !body.applicationDate)
  )
    throw new ApplicationInputError(
      "Confirm that you submitted this application and enter the actual date applied.",
    );
  // Validate before inserting a record, so an invalid form never creates an incomplete history item.
  try {
    applicationUpdate({
      ...body,
      id: "manual-validation",
      status: state,
      submissionConfirmed: body.submissionConfirmed,
    });
  } catch (e) {
    throw new ApplicationInputError((e as Error).message);
  }
  if (body.applicationDate && !validCalendarDate(body.applicationDate))
    throw new ApplicationInputError("Enter a valid application date.");
  const now = new Date().toISOString();
  const job: Job = {
    id:
      "manual-application:" +
      createHash("sha256")
        .update(
          url ? JSON.stringify([company.toLowerCase(), url]) : randomUUID(),
        )
        .digest("hex"),
    company,
    title,
    url,
    location:
      body.location === undefined
        ? "Not recorded"
        : text(body.location, "location", 1000),
    salary: body.salary === undefined ? "" : text(body.salary, "salary", 1000),
    description:
      "User-reported application. The employer vacancy and applicant eligibility have not been independently verified.",
    source: "Manual application",
    postedAt: "",
    discoveredAt: now,
    eligibility: "review",
    eligibilityReason:
      "User-reported application history; not a verified employer vacancy.",
    score: 0,
    matchedSkills: [],
  };
  const app = await ensureJobApplication(job, "manual");
  if (needsSubmission && !app.submittedAt)
    await updateApplication({ ...body, id: app.id, status: "Submitted" });
  return updateApplication({ ...body, id: app.id, status: state });
}
export async function syncApplicationReminders(now = new Date()) {
  const database = await db(),
    apps = await database
      .collection<Application>("applications")
      .find({})
      .toArray(),
    actions = applicationActions(apps, now),
    active: string[] = [];
  for (const action of actions) {
    const id = `application:${action.app.id}:${action.kind}:${action.date}:${action.overdue ? "overdue" : "upcoming"}`;
    active.push(id);
    await database.collection("notifications").updateOne(
      { id },
      {
        $setOnInsert: {
          id,
          kind: "application-reminder",
          applicationId: action.app.id,
          title: `${action.kind} ${action.overdue ? "overdue" : "upcoming"}: ${action.app.job.company} — ${action.app.job.title} (${action.date})`,
          createdAt: now.toISOString(),
          read: false,
        },
      },
      { upsert: true },
    );
  }
  await database
    .collection("notifications")
    .updateMany(
      { kind: "application-reminder", read: false, id: { $nin: active } },
      { $set: { read: true } },
    );
  return { actions: actions.length, asOf: calendarToday(now) };
}
