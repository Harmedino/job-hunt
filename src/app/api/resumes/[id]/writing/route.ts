import { randomUUID, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { aiConnection } from "@/lib/ai";
import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import { writeResumePart, type WritingCheckpoint } from "@/lib/resume-writing";
import {
  resumeSections,
  ResumeInputError,
  type ResumeDraft,
  type ResumeSection,
} from "@/lib/resume-types";
import {
  validateNyscInContent,
  validateResumeOptions,
} from "@/lib/resume-options";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json(),
      original = await loadResume((await params).id);
    if (
      typeof body?.useAi !== "boolean" ||
      (body.section !== "coverLetter" &&
        !Object.hasOwn(resumeSections, body.section))
    )
      throw new ResumeInputError(
        "Choose an existing section or optional cover letter and an explicit writing mode.",
      );
    if (body.retry !== undefined && typeof body.retry !== "boolean")
      throw new ResumeInputError("Invalid retry request.");
    const section = body.section as ResumeSection | "coverLetter",
      database = await db(),
      provider = aiConnection(),
      key = createHash("sha256")
        .update(
          JSON.stringify([
            original.id,
            section,
            provider.provider,
            provider.model,
            provider.modelPolicy,
          ]),
        )
        .digest("hex"),
      recovery = database.collection("resume_writing_recovery");
    await recovery.createIndex({ key: 1 }, { unique: true });
    await recovery.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const checkpoint = body.retry
      ? ((await recovery.findOne({ key, expiresAt: { $gt: new Date() } }))
          ?.checkpoint as WritingCheckpoint)
      : undefined;
    const result = await writeResumePart(original, section, body.useAi, {
      checkpoint,
      onCheckpoint: body.useAi
        ? async (value) => {
            await recovery.updateOne(
              { key },
              {
                $set: {
                  checkpoint: value,
                  expiresAt: new Date(Date.now() + 30 * 60000),
                },
              },
              { upsert: true },
            );
          }
        : undefined,
    });
    const now = new Date().toISOString();
    const draft: ResumeDraft = {
      ...original,
      id: randomUUID(),
      previousId: original.id,
      createdAt: now,
      content:
        section === "coverLetter"
          ? original.content
          : { ...original.content, [section]: result.text },
      coverLetter:
        section === "coverLetter" ? result.text : original.coverLetter,
      ...(section === "coverLetter"
        ? { letterGeneration: result.generation }
        : {}),
      statements: [
        ...(original.statements || []).filter((s) => s.section !== section),
        ...result.statements,
      ],
      warnings: [
        ...original.warnings,
        "Only the requested writing stage changed. Review its wording and original evidence; automated checks are not a guarantee.",
      ],
    };
    try {
      const profile =
        (await database.collection("profile").findOne({ key: "owner" }))
          ?.profile || draft.profileSnapshot;
      const options = validateResumeOptions(draft.options);
      validateNyscInContent(draft.content, profile, options);
      validateNyscInContent(draft.coverLetter || "", profile, options);
    } catch (e) {
      throw new ResumeInputError((e as Error).message);
    }
    await database.collection<ResumeDraft>("resumes").insertOne(draft);
    await recovery.deleteOne({ key });
    return Response.json(draft, { headers: privateHeaders });
  } catch (e) {
    return resumeError(e);
  }
}
