import { MongoClient } from "mongodb";
let client: MongoClient | undefined;
export async function db() {
  if (!process.env.MONGODB_URI)
    throw new Error("Connect MongoDB by setting MONGODB_URI in .env.local.");
  client ??= new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  return client.db(process.env.MONGODB_DB || "job_hunt");
}
export function errorResponse(error: unknown, status = 503) {
  console.error(error instanceof Error ? error.name : "Service error");
  return Response.json(
    {
      error:
        status === 400 && error instanceof Error
          ? error.message
          : "Storage or upstream service unavailable. Check your environment configuration and try again.",
    },
    { status },
  );
}

export async function closeDb() {
  await client?.close();
  client = undefined;
}
