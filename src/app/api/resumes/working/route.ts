import { db } from "@/lib/db";
import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import {
  validateResumeContent,
  validateCoverLetter,
  validateTemplate,
  ResumeInputError,
} from "@/lib/resume-types";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("draftId");
    await loadResume(id);
    const copy = await (
      await db()
    )
      .collection("resume_working_copies")
      .findOne(
        { draftId: id, expiresAt: { $gt: new Date() } },
        { projection: { _id: 0 } },
      );
    return Response.json({ copy }, { headers: privateHeaders });
  } catch (e) {
    return resumeError(e);
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    await loadResume(body.draftId);
    if (
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0 ||
      body.revision > Date.now() + 60000
    )
      throw new ResumeInputError("Invalid autosave revision.");
    const copy = {
      draftId: body.draftId,
      content: validateResumeContent(body.content),
      coverLetter: validateCoverLetter(body.coverLetter),
      template: validateTemplate(body.template),
      revision: body.revision,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    };
    const c = (await db()).collection("resume_working_copies");
    await c.createIndex({ draftId: 1 }, { unique: true });
    await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await c.updateOne(
      { draftId: body.draftId },
      [
        {
          $set: {
            copy: {
              $cond: [
                { $gt: [body.revision, { $ifNull: ["$revision", -1] }] },
                { $literal: copy },
                "$$ROOT",
              ],
            },
          },
        },
        { $replaceWith: "$copy" },
      ],
      { upsert: true },
    );
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return resumeError(e);
  }
}
