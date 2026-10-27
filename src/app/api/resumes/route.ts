import {resumeRecoveryKey} from "@/lib/resume-recovery";
import type {ResumeGenerationCheckpoint} from "@/lib/resume-builder";
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
        content: cleanResumeLayout(validateResumeContent(body.content)),
        layoutVersion: 2,
        coverLetter:
          body.coverLetter === undefined
            ? original.coverLetter
            : validateCoverLetter(body.coverLetter),
        template:
          body.template === undefined
            ? original.template
            : validateTemplate(body.template),
        sectionOrder:body.sectionOrder===undefined?original.sectionOrder:validateSectionOrder(body.sectionOrder),
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
      if(body.retry!==undefined && typeof body.retry!=='boolean')throw new ResumeInputError('Invalid retry request.');
      const key=resumeRecoveryKey(profile,target);
      const recovery=database.collection('resume_generation_recovery');
      let checkpoint:ResumeGenerationCheckpoint|undefined;
      if(body.useAi){
        await recovery.createIndex({key:1},{unique:true});
        await recovery.createIndex({expiresAt:1},{expireAfterSeconds:0});
        if(body.retry)checkpoint=(await recovery.findOne({key,expiresAt:{$gt:new Date()}}))?.checkpoint as ResumeGenerationCheckpoint|undefined;
      }
      const built = await buildResume(profile, target, body.useAi, {checkpoint,onCheckpoint:body.useAi?async value=>{await recovery.updateOne({key},{$set:{checkpoint:value,expiresAt:new Date(Date.now()+30*60000)}},{upsert:true});}:undefined});
      if(body.useAi)await recovery.deleteOne({key});
      draft = {
        id,
        familyId: id,
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
