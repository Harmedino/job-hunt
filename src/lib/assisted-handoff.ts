import { randomBytes } from "node:crypto";
import { db } from "./db";
import {
  assistedCollection,
  AssistedError,
  attemptCommand,
  bounded,
  digest,
  loadAttempt,
} from "./assisted-store";
const extensionPattern = /^[a-p]{32}$/;
export function extensionId(value: unknown) {
  if (typeof value !== "string" || !extensionPattern.test(value))
    throw new AssistedError(
      "Enter the extension ID shown by chrome://extensions.",
    );
  return value;
}
export function companionCors(request: Request) {
  const id = request.headers.get("x-launchpad-extension") || "";
  const origin =
    request.headers.get("origin") ||
    (extensionPattern.test(id) ? `chrome-extension://${id}` : "");
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin))
    throw new AssistedError(
      "This endpoint accepts the paired Launchpad extension only.",
      403,
    );
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Launchpad-Extension",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}
export async function createHandoff(attemptId: string, id: unknown) {
  const ext = extensionId(id),
    a = await loadAttempt(attemptId);
  if (
    a.closedAt ||
    ["confirmed-submission", "uncertain-submission"].includes(a.state)
  )
    throw new AssistedError(
      "Resume or reconcile this attempt before pairing.",
      409,
    );
  const collection = (await db()).collection("assisted_handoffs");
  await collection.createIndex({ hash: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  if (
    (await collection.countDocuments({
      attemptId,
      createdAt: { $gte: new Date(Date.now() - 60000) },
    })) >= 5
  )
    throw new AssistedError(
      "Wait one minute before creating another handoff.",
      429,
    );
  const token = randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 120000);
  await collection.insertOne({
    hash: digest(token),
    attemptId,
    extensionId: ext,
    expiresAt,
    createdAt: new Date(),
  });
  return { token, attemptId, expiresAt: expiresAt.toISOString() };
}
export async function consumeHandoff(
  request: Request,
  body: Record<string, unknown>,
) {
  companionCors(request);
  const ext = extensionId(request.headers.get("x-launchpad-extension"));
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== `chrome-extension://${ext}`
  )
    throw new AssistedError("Extension origin mismatch.", 403);
  const token = bounded(body.token, "one-time handoff", 100);
  const handoff = await (await db())
    .collection("assisted_handoffs")
    .findOneAndDelete({
      hash: digest(token),
      extensionId: ext,
      expiresAt: { $gt: new Date() },
    });
  if (!handoff)
    throw new AssistedError(
      "Handoff expired, already used or belongs to another extension. Create a fresh one in Launchpad.",
      401,
    );
  const claimed = await attemptCommand(handoff.attemptId, { action: "claim" });
  await (
    await assistedCollection()
  ).updateOne(
    {
      id: handoff.attemptId,
      "lease.hash": digest((claimed as { leaseToken: string }).leaseToken),
    },
    { $set: { companionOrigin: `chrome-extension://${ext}` } },
  );
  return claimed;
}
export async function authenticateCompanion(request: Request, id: string) {
  companionCors(request);
  const ext = extensionId(request.headers.get("x-launchpad-extension"));
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([\w-]{43})$/)?.[1];
  const a = await loadAttempt(id);
  if (
    !token ||
    !a.lease ||
    a.lease.expires <= Date.now() ||
    digest(token) !== a.lease.hash ||
    a.companionOrigin !== `chrome-extension://${ext}` ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== a.companionOrigin)
  )
    throw new AssistedError(
      "Pairing expired or is not authorized for this attempt.",
      401,
    );
  return { attempt: a, token };
}
