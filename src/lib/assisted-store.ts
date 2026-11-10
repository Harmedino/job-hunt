import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { db, errorResponse } from "./db";
import { applicationWasApplied, sameVacancy } from "./vacancy-groups";
import { statusHistory } from "./application-history";
import { calendarToday } from "./application-updates";
import { jobAvailable } from "./job-intelligence";
import { loadResume } from "./resume-store";
import { resumePdf } from "./resume-pdf";
import { resumeFilename } from "./resume-filename";
import type { Application } from "./types";
import type { ResumeDraft } from "./resume-types";
import { ResumeInputError } from "./resume-types";
import { AiError } from "./ai";
import {
  factKeys,
  applicationTarget,
  questionKey,
  verifyForm,
  type AssistedPackage,
  type AssistedState,
  type BankAnswer,
  type FormField,
  type Verification,
} from "./assisted-apply";
export const assistedHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export class AssistedError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assistedError(error: unknown) {
  return error instanceof AssistedError ||
    error instanceof ResumeInputError ||
    error instanceof AiError
    ? Response.json(
        { error: error.message },
        { status: error.status, headers: assistedHeaders },
      )
    : errorResponse(error);
}
export const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const packageDigest = (pack: AssistedPackage) =>
  digest(JSON.stringify(pack));
export function bounded(value: unknown, label: string, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new AssistedError(`Enter a valid ${label}.`);
  return value.trim();
}
export type Attempt = {
  id: string;
  activeKey?: string;
  vacancyKey: string;
  applicationId: string;
  package: AssistedPackage;
  packageHash: string;
  draft: ResumeDraft;
  state: AssistedState;
  revision: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  lease?: { hash: string; expires: number };
  companionOrigin?: string;
  report?: Verification;
  reportHash?: string;
  verifiedAt?: string;
  submissionIntentAt?: string;
  receipt?: { url: string; text: string; observedAt: string };
  history: { state: AssistedState; at: string; reason: string }[];
  syncWarning?: string;
};
export async function assistedCollection() {
  const collection = (await db()).collection<Attempt>("assisted_attempts");
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex(
    { activeKey: 1 },
    { unique: true, sparse: true },
  );
  await collection.createIndex({ updatedAt: -1 });
  return collection;
}
export function publicAttempt(a: Attempt) {
  return {
    id: a.id,
    applicationId: a.applicationId,
    state: a.state,
    revision: a.revision,
    company: a.package.company,
    title: a.package.title,
    target: a.package.target,
    packageHash: a.packageHash,
    draftId: a.package.draftId,
    approvedAt: a.package.approvedAt,
    facts: a.package.facts,
    answers: a.package.answers,
    files: a.package.files.map((file) => ({
      kind: file.kind,
      name: file.name,
      mime: file.mime,
      size: file.size,
      sha256: file.sha256,
    })),
    report: a.report,
    reportHash: a.reportHash,
    verifiedAt: a.verifiedAt,
    submissionIntentAt: a.submissionIntentAt,
    receipt: a.receipt,
    history: a.history,
    closedAt: a.closedAt,
    syncWarning: a.syncWarning,
    leaseActive: !!a.lease && a.lease.expires > Date.now(),
  };
}
export async function loadAttempt(id: string) {
  const attempt = await (
    await assistedCollection()
  ).findOne({ id: bounded(id, "attempt", 100) }, { projection: { _id: 0 } });
  if (!attempt)
    throw new AssistedError("Assisted Apply attempt not found.", 404);
  if (packageDigest(attempt.package) !== attempt.packageHash)
    throw new AssistedError(
      "Approved package integrity failed. No browser action is allowed.",
      409,
    );
  return attempt;
}
export async function bankAnswers(vacancyKey?: string) {
  const profileHash = await currentProfileHash();
  const rows = await (
    await db()
  )
    .collection<BankAnswer>("assisted_answers")
    .find(vacancyKey ? { vacancyKey: { $in: [vacancyKey, "*"] } } : {}, {
      projection: { _id: 0 },
    })
    .sort({ question: 1 })
    .toArray();
  return rows.map((row) => ({
    ...row,
    invalidated: row.profileHash !== profileHash,
  }));
}
export async function currentProfileHash() {
  const row = await (await db())
    .collection("profile")
    .findOne({ key: "owner" });
  return digest(JSON.stringify(row?.profile || {}));
}
export async function saveAnswer(body: Record<string, unknown>) {
  if (body.confirmed !== true)
    throw new AssistedError(
      "Confirm that this is your accurate answer to this employer’s exact question.",
    );
  const target = applicationTarget(
    bounded(body.url, "supported job URL", 2000),
  );
  const question = bounded(body.question, "exact employer question", 4000),
    answer = bounded(body.answer, "answer", 8000);
  if (
    body.reusable === true &&
    /authoriz|citizenship|citizen|visa|sponsor|legal|consent|agree|salary|compensation|relocat|country/i.test(
      question,
    )
  )
    throw new AssistedError(
      "Keep eligibility, compensation and legal answers scoped to the exact vacancy.",
    );
  const vacancyKey = body.reusable === true ? "*" : target.key;
  const collection = (await db()).collection("assisted_answers");
  await collection.createIndex(
    { vacancyKey: 1, questionKey: 1 },
    { unique: true },
  );
  const entry: BankAnswer = {
    id: randomUUID(),
    question,
    answer,
    vacancyKey,
    confirmedAt: new Date().toISOString(),
    source:
      typeof body.source === "string"
        ? body.source.slice(0, 1000)
        : "Owner-confirmed personal information",
    updatedAt: new Date().toISOString(),
    disabled: body.disabled === true,
    profileHash: await currentProfileHash(),
  };
  await collection.updateOne(
    { vacancyKey, questionKey: questionKey(question) },
    { $set: entry },
    { upsert: true },
  );
  return entry;
}
export async function approveAttempt(body: Record<string, unknown>) {
  if (body.approved !== true)
    throw new AssistedError(
      "Review and explicitly approve the exact CV, profile facts and answer bank before continuing.",
    );
  const database = await db(),
    applicationId = bounded(body.applicationId, "application", 100);
  const app = await database
    .collection<Application>("applications")
    .findOne({ id: applicationId });
  if (!app || applicationWasApplied(app))
    throw new AssistedError(
      "Choose a saved application that has not been submitted.",
      409,
    );
  if (!jobAvailable(app.job) || app.job.eligibility === "restricted")
    throw new AssistedError(
      "This posting is closed or location-restricted.",
      409,
    );
  let target;
  try {
    target = applicationTarget(app.job.url);
  } catch (error) {
    throw new AssistedError((error as Error).message);
  }
  const allApps = await database
    .collection<Application>("applications")
    .find({})
    .toArray();
  if (
    allApps.some(
      (other) =>
        applicationWasApplied(other) &&
        (sameVacancy(other.job, app.job) ||
          (() => {
            try {
              return applicationTarget(other.job.url).key === target.key;
            } catch {
              return false;
            }
          })()),
    )
  )
    throw new AssistedError(
      "This vacancy already has a submitted application. No duplicate attempt was created.",
      409,
    );
  const draft = await loadResume(
    bounded(body.draftId, "saved CV version", 100),
  );
  if (
    draft.kind?.startsWith("master-") ||
    !draft.target.url ||
    applicationTarget(draft.target.url).key !== target.key
  )
    throw new AssistedError(
      "Select a tailored CV saved for this exact supported vacancy.",
    );
  const selected = body.verifiedFacts;
  if (
    !Array.isArray(selected) ||
    selected.some((key) => !factKeys.includes(key)) ||
    !selected.includes("firstName") ||
    !selected.includes("lastName") ||
    !selected.includes("email")
  )
    throw new AssistedError(
      "Verify first name, last name and email, and select only facts you have reviewed.",
    );
  const firstName = bounded(body.firstName, "first name", 200),
    lastName = bounded(body.lastName, "last name", 200);
  if (
    questionKey(`${firstName} ${lastName}`) !== questionKey(draft.content.name)
  )
    throw new AssistedError(
      "The reviewed first and last names must reproduce the saved CV name. Edit the CV first if needed.",
    );
  const facts: AssistedPackage["facts"] = {};
  for (const key of selected as (typeof factKeys)[number][]) {
    const value =
      key === "firstName"
        ? firstName
        : key === "lastName"
          ? lastName
          : draft.content[key];
    if (!value?.trim())
      throw new AssistedError(
        `The selected ${key} is empty in this CV version.`,
      );
    facts[key] = value;
  }
  const now = new Date().toISOString(),
    files: AssistedPackage["files"] = [];
  for (const kind of body.includeLetter === true
    ? (["cv", "letter"] as const)
    : (["cv"] as const)) {
    if (kind === "letter" && !draft.coverLetter)
      throw new AssistedError("This saved version has no cover letter.");
    const bytes = Buffer.from(
      await resumePdf(
        draft.content,
        draft.target,
        draft.template,
        kind === "letter" ? draft.coverLetter : undefined,
        draft.layoutVersion !== 2,
        draft.sectionOrder,
      ),
    );
    if (bytes.length > 3 * 1024 * 1024)
      throw new AssistedError(
        "This document exceeds the companion’s 3 MB per-file limit.",
      );
    files.push({
      kind,
      name: resumeFilename(draft.content, app.job, kind, "pdf"),
      mime: "application/pdf",
      size: bytes.length,
      sha256: digest(bytes),
      base64: bytes.toString("base64"),
    });
  }
  const answers = (await bankAnswers(target.key)).filter(
    (a) => !a.invalidated && !a.disabled,
  );
  if (
    body.reviewedAnswers !== undefined &&
    JSON.stringify(body.reviewedAnswers) !== JSON.stringify(answers)
  )
    throw new AssistedError(
      "Private answers changed after review. Reopen the CV selection and review the current answers before approving.",
      409,
    );
  const id = randomUUID(),
    pack: AssistedPackage = {
      version: 1,
      id,
      applicationId: app.id,
      draftId: draft.id,
      approvedAt: now,
      target,
      company: app.job.company,
      title: app.job.title,
      facts,
      answers,
      files,
      profileHash: await currentProfileHash(),
    };
  const attempt: Attempt = {
    id,
    activeKey: target.key,
    vacancyKey: target.key,
    applicationId: app.id,
    package: pack,
    packageHash: packageDigest(pack),
    draft,
    state: "awaiting-user",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        state: "awaiting-user",
        at: now,
        reason:
          "Owner approved an immutable CV package, selected profile facts and exact private answers.",
      },
    ],
  };
  try {
    await (await assistedCollection()).insertOne(attempt);
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AssistedError(
        "An active or confirmed attempt already exists for this supported vacancy. Resume it instead of creating a duplicate.",
        409,
      );
    throw error;
  }
  return publicAttempt(attempt);
}
function parseReport(value: unknown): {
  url: string;
  challenge: string;
  unsupported: string;
  fields: FormField[];
} {
  if (
    !value ||
    typeof value !== "object" ||
    JSON.stringify(value).length > 150000
  )
    throw new AssistedError("Invalid browser verification report.");
  const report = value as Record<string, unknown>;
  if (
    typeof report.url !== "string" ||
    typeof report.challenge !== "string" ||
    typeof report.unsupported !== "string" ||
    !Array.isArray(report.fields) ||
    report.fields.length > 200
  )
    throw new AssistedError("Invalid browser verification report.");
  for (const f of report.fields) {
    if (
      !f ||
      typeof f !== "object" ||
      ["id", "label", "value"].some((key) => typeof f[key] !== "string") ||
      ![
        "text",
        "textarea",
        "select",
        "checkbox",
        "file",
        "unsupported",
        "radio",
        "checkbox-group",
        "date",
      ].includes(f.kind) ||
      typeof f.required !== "boolean" ||
      typeof f.valid !== "boolean" ||
      typeof f.disabled !== "boolean"
    )
      throw new AssistedError("Invalid form field readback.");
    if (
      f.files !== undefined &&
      (!Array.isArray(f.files) ||
        f.files.some(
          (file: Record<string, unknown>) =>
            typeof file.name !== "string" ||
            typeof file.size !== "number" ||
            typeof file.sha256 !== "string",
        ))
    )
      throw new AssistedError("Invalid document readback.");
  }
  return report as ReturnType<typeof parseReport>;
}
export async function attemptCommand(
  id: string,
  body: Record<string, unknown>,
) {
  const collection = await assistedCollection(),
    a = await loadAttempt(id),
    now = new Date().toISOString();
  if (a.closedAt)
    throw new AssistedError(
      "This attempt is closed. Its audit history remains available.",
      409,
    );
  const action = body.action;
  if (action === "revoke") {
    if (body.confirmed !== true)
      throw new AssistedError(
        "Confirm that the companion should stop. Any attempted submission remains uncertain.",
      );
    await cas(
      a,
      {
        state:
          a.state === "confirmed-submission"
            ? a.state
            : a.submissionIntentAt
              ? "uncertain-submission"
              : "awaiting-user",
      },
      { lease: "", companionOrigin: "", reportHash: "", verifiedAt: "" },
      "Owner revoked the browser handoff. Fresh pairing and verification required.",
    );
    return publicAttempt(await loadAttempt(id));
  }
  if (action === "sync") {
    if (a.state !== "confirmed-submission")
      throw new AssistedError(
        "Only confirmed outcomes can be synchronized.",
        409,
      );
    await syncConfirmed(a);
    return publicAttempt(await loadAttempt(id));
  }
  if (action === "claim") {
    if (
      a.package.profileHash &&
      a.package.profileHash !== (await currentProfileHash())
    )
      throw new AssistedError(
        "Your master profile changed after approval. Close this unsubmitted attempt and approve a fresh package.",
        409,
      );
    if (
      a.state === "confirmed-submission" ||
      a.state === "uncertain-submission"
    )
      throw new AssistedError(
        "Submission is confirmed or uncertain. Reconcile it in Launchpad; do not run another submission.",
        409,
      );
    if (a.lease && a.lease.expires > Date.now())
      throw new AssistedError(
        "Another companion owns this attempt. Close it or wait for its ten-minute lease to expire.",
        409,
      );
    const token = randomBytes(32).toString("base64url");
    const result = await collection.updateOne(
      {
        id,
        revision: a.revision,
        $or: [
          { "lease.expires": { $lte: Date.now() } },
          { lease: { $exists: false } },
        ],
      },
      {
        $set: {
          lease: { hash: digest(token), expires: Date.now() + 600000 },
          state: "awaiting-user",
          updatedAt: now,
        },
        $unset: { reportHash: "", verifiedAt: "" },
        $inc: { revision: 1 },
        $push: {
          history: {
            state: "awaiting-user",
            at: now,
            reason: "Companion claimed the attempt; fresh readback required.",
          },
        },
      },
    );
    if (!result.matchedCount)
      throw new AssistedError(
        "The attempt was claimed elsewhere. Reload it.",
        409,
      );
    return { ...publicAttempt(await loadAttempt(id)), leaseToken: token };
  }
  if (action === "reconcile" || action === "close") {
    if (a.lease && a.lease.expires > Date.now())
      throw new AssistedError(
        "Close the companion before reconciling or closing this attempt.",
        409,
      );
    if (body.confirmed !== true)
      throw new AssistedError(
        "Explicitly confirm your reconciliation decision.",
      );
    const reason = bounded(
      body.reason,
      "reconciliation evidence or reason",
      2000,
    );
    if (reason.length < 10)
      throw new AssistedError(
        "Describe the evidence in at least ten characters.",
      );
    if (action === "close") {
      if (
        a.submissionIntentAt ||
        a.state === "confirmed-submission" ||
        a.state === "uncertain-submission"
      )
        throw new AssistedError(
          "An attempted submission cannot be closed as unsubmitted. Reconcile the outcome first.",
          409,
        );
      await cas(a, { closedAt: now }, { activeKey: "", lease: "" }, reason);
    } else {
      if (a.state !== "uncertain-submission")
        throw new AssistedError(
          "Only an uncertain submission can be reconciled.",
          409,
        );
      if (!["confirmed", "not-submitted"].includes(String(body.outcome)))
        throw new AssistedError("Choose the observed submission outcome.");
      const state =
        body.outcome === "confirmed" ? "confirmed-submission" : "awaiting-user";
      await cas(
        a,
        {
          state,
          ...(state === "confirmed-submission"
            ? {
                receipt: {
                  url: a.package.target.url,
                  text: reason,
                  observedAt: now,
                },
              }
            : {}),
        },
        state === "awaiting-user"
          ? {
              submissionIntentAt: "",
              lease: "",
              reportHash: "",
              verifiedAt: "",
            }
          : { lease: "" },
        `Owner reconciliation: ${reason}`,
      );
      if (state === "confirmed-submission")
        await syncConfirmed(await loadAttempt(id));
    }
    return publicAttempt(await loadAttempt(id));
  }
  const token = bounded(body.leaseToken, "companion lease", 100);
  if (
    !a.lease ||
    digest(token) !== a.lease.hash ||
    a.lease.expires <= Date.now()
  )
    throw new AssistedError(
      "Companion lease expired or belongs to another process. No further browser action is allowed.",
      409,
    );
  if (action === "release") {
    await collection.updateOne(
      { id, "lease.hash": a.lease.hash },
      { $unset: { lease: "" } },
    );
    return publicAttempt(await loadAttempt(id));
  }
  if (action === "heartbeat") {
    await collection.updateOne(
      { id, "lease.hash": a.lease.hash, "lease.expires": { $gt: Date.now() } },
      { $set: { "lease.expires": Date.now() + 600000 } },
    );
    return { ok: true };
  }
  if (a.state === "confirmed-submission")
    throw new AssistedError(
      "Submission is already confirmed. No repeat action is allowed.",
      409,
    );
  if (action === "verify") {
    if (a.state === "uncertain-submission")
      throw new AssistedError(
        "Reconcile the uncertain submission before doing anything else.",
        409,
      );
    const manual = body.manualReviewed;
    if (
      !Array.isArray(manual) ||
      manual.some((id) => typeof id !== "string") ||
      (manual.length && body.manualConfirmed !== true)
    )
      throw new AssistedError("Explicitly review manually entered answers.");
    const report = verifyForm(a.package, parseReport(body.report), manual),
      reportHash = digest(JSON.stringify(report));
    await cas(
      a,
      {
        report,
        reportHash,
        verifiedAt: now,
        state: report.ready ? "verified-ready" : "awaiting-user",
      },
      {},
      report.ready
        ? "Every entered field and document read back and reviewed."
        : "Readback found missing, changed or unsupported fields; owner action required.",
    );
    const shape = report.fields.map((f) => ({
      idHash: digest(f.id),
      labelHash: digest(f.label),
      kind: f.kind,
      required: f.required,
      optionCount: f.options?.length || 0,
    }));
    const layoutHash = digest(JSON.stringify(shape));
    await (await db())
      .collection("assisted_form_knowledge")
      .updateOne(
        { key: `${a.package.target.platform || "Greenhouse"}:${layoutHash}` },
        {
          $set: {
            platform: a.package.target.platform || "Greenhouse",
            layoutHash,
            fields: shape,
            lastSeen: now,
            lastResult: report.ready ? "verified" : "needs-owner",
            adapterVersion: 1,
          },
          $inc: { observations: 1 },
        },
        { upsert: true },
      );
    return publicAttempt(await loadAttempt(id));
  }
  if (action === "submit-intent") {
    if (
      a.state !== "verified-ready" ||
      !a.report?.ready ||
      body.reportHash !== a.reportHash ||
      body.confirmed !== true ||
      !a.verifiedAt ||
      Date.now() - Date.parse(a.verifiedAt) > 120000
    )
      throw new AssistedError(
        "Submission requires explicit confirmation of a fresh, fully verified review summary.",
        409,
      );
    const app = await (await db())
      .collection<Application>("applications")
      .findOne({ id: a.applicationId });
    if (!app || applicationWasApplied(app))
      throw new AssistedError(
        "The application was already submitted or removed. No duplicate click is allowed.",
        409,
      );
    const { assistantPolicy, withinOperatingHours, policyDay } = await import(
        "./assistant-policy"
      ),
      policy = await assistantPolicy();
    if (!withinOperatingHours(policy))
      throw new AssistedError(
        "This attempt is outside your configured application hours. Edit the policy or return during those hours.",
        409,
      );
    if (
      !policy.allowedBoards.includes(
        a.package.target.platform || "Greenhouse",
      ) ||
      policy.excludedCompanies.some(
        (c) =>
          c.trim().toLowerCase() === a.package.company.trim().toLowerCase(),
      )
    )
      throw new AssistedError(
        "This employer or board is excluded by your current application policy.",
        409,
      );
    const daily = (
      await collection.find({ submissionIntentAt: { $exists: true } }).toArray()
    ).filter(
      (other) =>
        policyDay(new Date(other.submissionIntentAt!), policy.timezone) ===
        policyDay(new Date(), policy.timezone),
    ).length;
    const dailyLimits = (await db()).collection<{
        _id: string;
        count: number;
        slots: string[];
      }>("assisted_daily_limits"),
      day = policyDay(new Date(), policy.timezone),
      slot = `${a.id}:${a.revision}`;
    await dailyLimits.updateOne(
      { _id: day },
      { $setOnInsert: { count: daily, slots: [] } },
      { upsert: true },
    );
    const reserved = await dailyLimits.findOneAndUpdate(
      { _id: day, count: { $lt: policy.maxPerDay }, slots: { $ne: slot } },
      { $inc: { count: 1 }, $addToSet: { slots: slot } },
      { returnDocument: "after" },
    );
    if (!reserved)
      throw new AssistedError(
        "Your daily submission-attempt limit is reached or this intent was already reserved. Uncertain attempts count; do not retry them blindly.",
        409,
      );
    await cas(
      a,
      { state: "uncertain-submission", submissionIntentAt: now },
      {},
      "Owner explicitly confirmed one submission. Intent persisted before any click; never retry automatically.",
    );
    return publicAttempt(await loadAttempt(id));
  }
  if (action === "receipt") {
    if (a.state !== "uncertain-submission" || !a.submissionIntentAt)
      throw new AssistedError(
        "No owner-confirmed submission intent exists.",
        409,
      );
    const text = bounded(body.text, "Greenhouse confirmation text", 2000),
      url = bounded(body.url, "confirmation URL", 2000);
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      (parsed.hostname !== new URL(a.package.target.url).hostname &&
        !(
          a.package.target.platform === "Greenhouse" &&
          parsed.hostname === "boards.greenhouse.io"
        )) ||
      !parsed.pathname.startsWith(`/${a.package.target.board}/`) ||
      !/thank you for applying|application (?:has been |was )?(?:successfully )?(?:submitted|received)|thank you for your (?:application|interest)/i.test(
        text,
      )
    )
      throw new AssistedError(
        "No recognized employer confirmation was observed. Submission remains uncertain.",
        409,
      );
    await cas(
      a,
      {
        state: "confirmed-submission",
        receipt: { url, text, observedAt: now },
      },
      { lease: "" },
      "Companion observed an explicit Greenhouse application confirmation after the owner-confirmed click.",
    );
    await syncConfirmed(await loadAttempt(id));
    return publicAttempt(await loadAttempt(id));
  }
  if (action === "failure") {
    const reason = bounded(body.reason, "failure summary", 2000);
    await cas(
      a,
      {
        state: a.submissionIntentAt ? "uncertain-submission" : "awaiting-user",
      },
      {},
      reason,
    );
    return publicAttempt(await loadAttempt(id));
  }
  throw new AssistedError("Unknown companion action.");
}
async function cas(
  a: Attempt,
  fields: Partial<Attempt>,
  unset: Record<string, "">,
  reason: string,
) {
  const now = new Date().toISOString(),
    state = fields.state || a.state;
  const result = await (
    await assistedCollection()
  ).updateOne(
    { id: a.id, revision: a.revision },
    {
      $set: { ...fields, updatedAt: now },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $inc: { revision: 1 },
      $push: { history: { state, at: now, reason } },
    },
  );
  if (!result.matchedCount)
    throw new AssistedError(
      "This attempt changed elsewhere. Reload and verify again.",
      409,
    );
}
async function syncConfirmed(a: Attempt) {
  try {
    const database = await db(),
      apps = database.collection<Application>("applications"),
      app = await apps.findOne({ id: a.applicationId });
    if (!app) throw new Error("missing application");
    if (applicationWasApplied(app)) {
      if (app.documentSnapshot?.capturedAt === a.package.approvedAt) {
        await (
          await assistedCollection()
        ).updateOne({ id: a.id }, { $unset: { syncWarning: "" } });
        return;
      }
      throw new Error("existing submission retained");
    }
    const files = a.package.files.map((f) => ({
      id: `assisted-${a.id}-${f.kind}`,
      kind: f.kind,
      name: f.name,
      mime: f.mime,
      size: f.size,
      sha256: f.sha256,
      createdAt: a.package.approvedAt,
      source: "rendered selected version" as const,
    }));
    for (let i = 0; i < files.length; i++)
      await database.collection("application_files").updateOne(
        { id: files[i].id, applicationId: app.id },
        {
          $setOnInsert: {
            ...files[i],
            applicationId: app.id,
            data: new Binary(Buffer.from(a.package.files[i].base64, "base64")),
          },
        },
        { upsert: true },
      );
    const at = a.submissionIntentAt || a.receipt!.observedAt;
    const result = await apps.updateOne(
      {
        id: app.id,
        submittedAt: { $exists: false },
        hasApplied: { $ne: true },
        status: { $nin: ["Submitted", "Interview", "Rejected", "Offer"] },
      },
      {
        $set: {
          status: "Submitted",
          hasApplied: true,
          submittedAt: at,
          applicationDate: calendarToday(new Date(at)),
          saved: true,
          updatedAt: at,
          statusHistory: statusHistory(app, "Submitted", at),
          documentSnapshot: {
            cv: a.draft,
            coverLetter: a.package.files.some((f) => f.kind === "letter")
              ? a.draft.coverLetter
              : undefined,
            coverLetterUsed: a.package.files.some((f) => f.kind === "letter")
              ? "yes"
              : "no",
            capturedAt: a.package.approvedAt,
            profileSnapshot: a.draft.profileSnapshot,
            files,
          },
        },
      },
    );
    if (!result.matchedCount) throw new Error("concurrent submission retained");
    await (
      await assistedCollection()
    ).updateOne({ id: a.id }, { $unset: { syncWarning: "" } });
  } catch {
    await (
      await assistedCollection()
    ).updateOne(
      { id: a.id },
      {
        $set: {
          syncWarning:
            "Submission is confirmed in Assisted Apply. Existing application history was preserved or storage sync failed; review Applications before making any changes. Do not submit again.",
        },
      },
    );
  }
}
