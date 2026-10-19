import { db } from "../db";
import { AiError } from "../ai";
import { ModuleError } from "./validation";
export const OWNER = "owner"; // Existing application is one authenticated personal workspace.
export const buckets = [
  "bounties",
  "tracked",
  "payments",
  "profiles",
  "topics",
  "ideas",
  "prompts",
  "metadata",
  "entries",
  "journal",
  "settings",
  "sources",
] as const;
export type Bucket = (typeof buckets)[number];
export const ownerFilter = (filter: Record<string, unknown> = {}) => ({
  ...filter,
  owner: OWNER,
});
export async function collection(bucket: Bucket) {
  return (await db()).collection(`workspace_${bucket}`);
}
export async function ensureModuleIndexes() {
  const database = await db();
  await Promise.all([
    ...buckets.map((bucket) =>
      database
        .collection(`workspace_${bucket}`)
        .createIndex({ owner: 1, id: 1 }, { unique: true }),
    ),
    database
      .collection("workspace_youtube_cache")
      .createIndex({ owner: 1, kind: 1, id: 1 }, { unique: true }),
    database
      .collection("workspace_youtube_cache")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database
      .collection("workspace_oauth")
      .createIndex({ owner: 1, id: 1 }, { unique: true }),
    database
      .collection("workspace_oauth")
      .createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 }),
    database
      .collection("workspace_ephemeral")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database
      .collection("workspace_ephemeral")
      .createIndex({ owner: 1, key: 1 }, { unique: true }),
    database
      .collection("workspace_ai_cache")
      .createIndex({ owner: 1, key: 1 }, { unique: true }),
    database
      .collection("workspace_ai_cache")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
export async function list<T>(bucket: Bucket): Promise<T[]> {
  return (await (
    await collection(bucket)
  )
    .find(ownerFilter(), { projection: { _id: 0, owner: 0 } })
    .sort({ updatedAt: -1 })
    .limit(500)
    .toArray()) as unknown as T[];
}
export async function get<T>(bucket: Bucket, id: string): Promise<T> {
  const record = await (
    await collection(bucket)
  ).findOne(ownerFilter({ id }), { projection: { _id: 0, owner: 0 } });
  if (!record)
    throw new ModuleError("Record not found in your workspace.", 404);
  return record as T;
}
export async function put<T extends { id: string }>(bucket: Bucket, record: T) {
  await (
    await collection(bucket)
  ).updateOne(
    ownerFilter({ id: record.id }),
    { $set: { ...record, owner: OWNER } },
    { upsert: true },
  );
  return record;
}
export async function remove(bucket: Bucket, id: string) {
  await (await collection(bucket)).deleteOne(ownerFilter({ id }));
}
export async function lease(key: string, seconds: number) {
  const records = (await db()).collection("workspace_ephemeral");
  const now = new Date();
  try {
    const result = await records.findOneAndUpdate(
      ownerFilter({
        key,
        $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }],
      }),
      { $set: { expiresAt: new Date(Date.now() + seconds * 1000) } },
      { upsert: true, returnDocument: "after" },
    );
    return !!result;
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === 11000)
      return false;
    throw e;
  }
}
export function moduleError(error: unknown) {
  if (error instanceof ModuleError || error instanceof AiError)
    return Response.json(
      {
        error: error.message,
        ...("retryAt" in error && error.retryAt
          ? { retryAt: error.retryAt }
          : {}),
      },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    "Workspace service:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "Workspace storage or upstream service unavailable. Check configuration and retry.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export function json(value: unknown) {
  return Response.json(value, { headers: { "Cache-Control": "no-store" } });
}
