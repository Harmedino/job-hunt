import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { emptyProfile } from "@/lib/types";
import { buildResume, resumeEvidence } from "@/lib/resume-builder";
import {
  ResumeInputError,
  validateResumeContent,
  type ResumeDraft,
} from "@/lib/resume-types";
import {
  loadResume,
  privateHeaders,
  resumeError,
  resumeTarget,
} from "@/lib/resume-store";
export const maxDuration = 60;
export async function GET() {
  try {
    const drafts = await (
      await db()
    )
      .collection("resumes")
      .find(
        {},
        {
          projection: {
            _id: 0,
            id: 1,
            familyId: 1,
            createdAt: 1,
            "target.title": 1,
            "target.company": 1,
            "target.applicationId": 1,
            method: 1,
            manualEdits: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return Response.json({ drafts }, { headers: privateHeaders });
  } catch (error) {
    return resumeError(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ResumeInputError("Provide valid CV input.");
    const database = await db();
    let draft: ResumeDraft;
    const id = randomUUID();
    if (body.action === "save") {
      const original = await loadResume(body.draftId);
      draft = {
        ...original,
        id,
        previousId: original.id,
        createdAt: new Date().toISOString(),
        content: validateResumeContent(body.content),
        manualEdits: true,
      };
    } else if (body.action === "generate") {
      if (typeof body.useAi !== "boolean")
        throw new ResumeInputError(
          "Choose AI tailoring or a profile-based draft.",
        );
      const target = await resumeTarget(body);
      const stored = (
        await database.collection("profile").findOne({ key: "owner" })
      )?.profile;
      const profile = { ...emptyProfile, ...stored };
      if (
        !profile.name?.trim() ||
        !profile.email?.trim() ||
        !resumeEvidence(profile).length
      )
        throw new ResumeInputError(
          "Save your name, email and qualifications in My Profile first. Import your uploaded CV to fill the profile fields.",
        );
      const built = await buildResume(profile, target, body.useAi);
      draft = {
        id,
        familyId: id,
        createdAt: new Date().toISOString(),
        target,
        ...built,
        content: validateResumeContent(built.content),
        profileSnapshot: profile,
        manualEdits: false,
      };
    } else throw new ResumeInputError("Choose generate or save.");
    await database.collection<ResumeDraft>("resumes").insertOne({ ...draft });
    return Response.json(draft, { headers: privateHeaders });
  } catch (error) {
    return resumeError(error);
  }
}
