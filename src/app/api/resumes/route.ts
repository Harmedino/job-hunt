import { careerPath } from "@/lib/career-policy";
import {
  validateResumeOptions,
  validateNyscInContent,
  validateStatementReviews,
} from "@/lib/resume-options";
import { resumeRecoveryKey } from "@/lib/resume-recovery";
import type { ResumeGenerationCheckpoint } from "@/lib/resume-builder";
import { cleanResumeLayout } from "@/lib/resume-layout";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { emptyProfile } from "@/lib/types";
import { buildResume, resumeEvidence } from "@/lib/resume-builder";
import {
  ResumeInputError,
  validateResumeContent,
  validateCoverLetter,
  validateTemplate,
  validateSectionOrder,
  type ResumeDraft,
} from "@/lib/resume-types";
import {
  loadResume,
  privateHeaders,
  resumeError,
  resumeTarget,
} from "@/lib/resume-store";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      throw new ResumeInputError("Invalid CV history page.");
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
            kind: 1,
            "options.track": 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .skip(offset)
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
      const storedProfile =
        (await database.collection("profile").findOne({ key: "owner" }))
          ?.profile || original.profileSnapshot;
      let options;
      try {
        options = validateResumeOptions(
          body.options === undefined ? original.options : body.options,
          { ...original.profileSnapshot, nysc: storedProfile.nysc },
        );
      } catch (e) {
        throw new ResumeInputError((e as Error).message);
      }
      const nextContent = cleanResumeLayout(
        validateResumeContent(body.content),
      );
      const nextLetter =
        body.coverLetter === undefined
          ? original.coverLetter
          : validateCoverLetter(body.coverLetter);
      let reviews;
      try {
        reviews =
          body.statementReviews === undefined
            ? original.statementReviews
            : validateStatementReviews(body.statementReviews);
        validateNyscInContent(nextContent, storedProfile, options);
        validateNyscInContent(nextLetter || "", storedProfile, options);
      } catch (e) {
        throw new ResumeInputError((e as Error).message);
      }
      draft = {
        ...original,
        options,
        statementReviews: reviews,
        profileSnapshot: {
          ...original.profileSnapshot,
          nysc: storedProfile.nysc,
        },
        id,
        previousId: original.id,
        createdAt: new Date().toISOString(),
        content: nextContent,
        layoutVersion: 2,
        coverLetter: nextLetter,
        template:
          body.template === undefined
            ? original.template
            : validateTemplate(body.template),
        sectionOrder:
          body.sectionOrder === undefined
            ? original.sectionOrder
            : validateSectionOrder(body.sectionOrder),
        manualEdits: true,
      };
    } else if (body.action === "generate") {
      if (typeof body.useAi !== "boolean")
        throw new ResumeInputError(
          "Choose AI tailoring or a profile-based draft.",
        );
      let target = await resumeTarget(body);
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
      if (body.retry !== undefined && typeof body.retry !== "boolean")
        throw new ResumeInputError("Invalid retry request.");
      let options;
      try {
        options = validateResumeOptions(
          body.options === undefined
            ? {
                track:
                  body.masterTrack ||
                  (careerPath(target.title, target.description) ===
                  "cybersecurity"
                    ? "cybersecurity"
                    : "development"),
                keywords: target.keywords || [],
              }
            : body.options,
          profile,
        );
      } catch (e) {
        throw new ResumeInputError((e as Error).message);
      }
      target = { ...target, keywords: options.keywords };
      const key = resumeRecoveryKey(profile, target, options);
      const recovery = database.collection("resume_generation_recovery");
      let checkpoint: ResumeGenerationCheckpoint | undefined;
      if (body.useAi) {
        await recovery.createIndex({ key: 1 }, { unique: true });
        await recovery.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        if (body.retry)
          checkpoint = (
            await recovery.findOne({ key, expiresAt: { $gt: new Date() } })
          )?.checkpoint as ResumeGenerationCheckpoint | undefined;
      }
      const built = await buildResume(profile, target, body.useAi, {
        cvOptions: options,
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
      try {
        validateNyscInContent(built.content, profile, options);
      } catch (e) {
        throw new ResumeInputError((e as Error).message);
      }
      if (body.useAi) await recovery.deleteOne({ key });
      draft = {
        id,
        familyId: id,
        kind:
          body.masterTrack === "development"
            ? "master-development"
            : body.masterTrack === "cybersecurity"
              ? "master-cybersecurity"
              : "tailored",
        options,
        createdAt: new Date().toISOString(),
        target,
        ...built,
        template:
          body.template === undefined
            ? "classic"
            : validateTemplate(body.template),
        content: cleanResumeLayout(validateResumeContent(built.content)),
        layoutVersion: 2,
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
