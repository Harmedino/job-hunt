import { createHash, randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { db } from "./db";
import type { Application } from "./types";
import { extractCv, CvInputError } from "./cv";
import { resumePdf } from "./resume-pdf";
import { resumeDocx } from "./resume-docx";
import { resumeFilename } from "./resume-filename";
export type SubmissionFileInfo = {
  id: string;
  kind: "cv" | "letter";
  name: string;
  mime: string;
  size: number;
  sha256: string;
  createdAt: string;
  source: "uploaded original" | "rendered selected version";
  supersedes?: string;
  correctionReason?: string;
};
export async function originalFileInfo(file: File) {
  let warning = "";
  try {
    await extractCv(file);
  } catch (e) {
    if (e instanceof CvInputError && e.code === "NO_READABLE_TEXT")
      warning =
        "No selectable text was found. The validated original is preserved, but its contents require your review.";
    else throw e;
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = /\.pdf$/i.test(file.name)
    ? "application/pdf"
    : /\.docx$/i.test(file.name)
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "text/plain; charset=utf-8";
  return { bytes, mime, warning };
}
export async function fileResponse(applicationId: string, fileId: string) {
  const record = await (await db())
    .collection("application_files")
    .findOne({ id: fileId, applicationId });
  if (!record)
    return Response.json(
      { error: "Original document not found." },
      { status: 404 },
    );
  const bytes = Buffer.from(
    record.data instanceof Binary ? record.data.value() : record.data.buffer,
  );
  if (createHash("sha256").update(bytes).digest("hex") !== record.sha256)
    return Response.json(
      {
        error:
          "Stored file integrity check failed; no replacement was generated.",
      },
      { status: 503 },
    );
  const safe = String(record.name).replace(/[^a-zA-Z0-9_.-]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": record.mime,
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(record.name)}`,
    },
  });
}
export async function freezeSelectedDocuments(app: Application) {
  const cv = app.documentSnapshot?.cv;
  if (!cv?.content) return;
  const capturedAt = app.documentSnapshot!.capturedAt,
    collection = (await db()).collection("application_files"),
    files: SubmissionFileInfo[] = [];
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ applicationId: 1 });
  const letters =
    app.documentSnapshot?.coverLetter &&
    app.documentSnapshot.coverLetterUsed !== "no"
      ? (["cv", "letter"] as const)
      : (["cv"] as const);
  for (const kind of letters)
    for (const format of ["pdf", "docx"] as const) {
      const key = createHash("sha256")
        .update(JSON.stringify([app.id, capturedAt, kind, format]))
        .digest("hex");
      const letter =
          kind === "letter" ? app.documentSnapshot!.coverLetter : undefined,
        bytes = Buffer.from(
          format === "pdf"
            ? await resumePdf(
                cv.content,
                cv.target,
                cv.template,
                letter,
                cv.layoutVersion !== 2,
                cv.sectionOrder,
              )
            : await resumeDocx(
                cv.content,
                cv.target,
                cv.template,
                letter,
                cv.layoutVersion !== 2,
                cv.sectionOrder,
              ),
        );
      const info: SubmissionFileInfo = {
        id: "snapshot-" + key,
        kind,
        name: resumeFilename(cv.content, app.job, kind, format),
        mime:
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        createdAt: capturedAt,
        source: "rendered selected version",
      };
      await collection.updateOne(
        { id: info.id, applicationId: app.id },
        {
          $setOnInsert: {
            ...info,
            applicationId: app.id,
            data: new Binary(bytes),
          },
        },
        { upsert: true },
      );
      files.push(info);
    }
  await (await db())
    .collection("applications")
    .updateOne(
      { id: app.id, "documentSnapshot.capturedAt": capturedAt },
      { $set: { "documentSnapshot.files": files } },
    );
}
export async function storeOriginalFile(
  app: Application,
  file: File,
  kind: "cv" | "letter",
  reason: string,
  correctionConfirmed: boolean,
) {
  const currentId = app.originalFileIds?.[kind],
    current = app.originalFiles?.find((f) => f.id === currentId);
  const { bytes, mime, warning } = await originalFileInfo(file),
    hash = createHash("sha256").update(bytes).digest("hex");
  if (current?.sha256 === hash) return { file: current, warning };
  if (current && (!correctionConfirmed || reason.trim().length < 3))
    return {
      error:
        "An original file already exists. Confirm a correction and record its reason; earlier files will remain available.",
      status: 409,
    };
  const name =
      file.name
        .split(/[\\/]/)
        .at(-1)!
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 160) || "submitted-document",
    now = new Date().toISOString(),
    info: SubmissionFileInfo = {
      id: randomUUID(),
      kind,
      name,
      mime,
      size: bytes.length,
      sha256: hash,
      createdAt: now,
      source: "uploaded original",
      ...(current
        ? { supersedes: current.id, correctionReason: reason.trim() }
        : {}),
    };
  const database = await db(),
    collection = database.collection("application_files");
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ applicationId: 1 });
  await collection.insertOne({
    ...info,
    applicationId: app.id,
    data: new Binary(bytes),
  });
  const result = await database
    .collection<Application>("applications")
    .updateOne(
      {
        id: app.id,
        [`originalFileIds.${kind}`]: currentId || { $exists: false },
      },
      {
        $set: { [`originalFileIds.${kind}`]: info.id, updatedAt: now },
        $push: { originalFiles: info },
      },
    );
  if (!result.matchedCount) {
    await collection.deleteOne({ id: info.id, applicationId: app.id });
    return {
      error:
        "Another original file was recorded at the same time. Reload the application before correcting it.",
      status: 409,
    };
  }
  return { file: info, warning };
}
