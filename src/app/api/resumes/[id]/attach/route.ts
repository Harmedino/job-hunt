import { db } from "@/lib/db";
import { discover } from "@/lib/discovery";
import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
import { ResumeInputError } from "@/lib/resume-types";
export const maxDuration = 60;
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const draft = await loadResume((await params).id);
    if (!draft.target.applicationId || !draft.target.jobId)
      throw new ResumeInputError(
        "Open the CV builder from an application to link a CV version.",
      );
    const database = await db();
    const query = {
      id: draft.target.applicationId,
      "job.id": draft.target.jobId,
      status: { $in: ["Saved", "Preparing", "Ready for review"] },
    };
    const application = await database
      .collection("applications")
      .findOne(query);
    if (!application)
      throw new ResumeInputError(
        "This application has progressed or no longer exists. Its submitted CV is preserved.",
        409,
      );
    const live = await discover();
    const job = live.jobs.find((j) => j.id === draft.target.jobId);
    if (!job || job.eligibility !== "eligible")
      throw new ResumeInputError(
        "The current source cannot confirm this job and your location eligibility. Your CV remains saved and downloadable; check the original posting before applying.",
        409,
      );
    const coverLetter =
      application.coverLetter ||
      `Dear Hiring Team,\n\nI am applying for the ${draft.target.title} position${draft.target.company ? " at " + draft.target.company : ""}.\n\n${draft.content.summary || draft.content.skills}\n\nThank you for considering my application.\n\n${draft.content.name}`;
    const result = await database
      .collection("applications")
      .updateOne(query, {
        $set: {
          cvDraftId: draft.id,
          profileSnapshot: draft.profileSnapshot,
          preparationMethod: "CV builder saved version",
          coverLetter,
          status: "Ready for review",
          updatedAt: new Date().toISOString(),
        },
      });
    if (!result.modifiedCount)
      throw new ResumeInputError(
        "The application changed while linking. Its CV was not replaced.",
        409,
      );
    return Response.json(
      { ok: true, applicationId: draft.target.applicationId },
      { headers: privateHeaders },
    );
  } catch (error) {
    return resumeError(error);
  }
}
