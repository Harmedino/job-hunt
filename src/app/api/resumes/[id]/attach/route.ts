import { statusHistory } from "@/lib/application-history";
import { applicationWasApplied } from "@/lib/vacancy-groups";
import type { Application } from "@/lib/types";
import { db } from "@/lib/db";
import { jobAvailable } from "@/lib/job-intelligence";
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
      submittedAt: { $exists: false },
      status: { $in: ["Saved", "Preparing", "Ready for review"] },
    };
    const application = await database
      .collection("applications")
      .findOne(query);
    if (
      !application ||
      applicationWasApplied(application as unknown as Application)
    )
      throw new ResumeInputError(
        "This application has progressed or no longer exists. Its submitted CV is preserved.",
        409,
      );
    if (
      !jobAvailable(application.job) ||
      application.job.eligibility === "restricted"
    )
      throw new ResumeInputError(
        "This posting is closed, expired or location-restricted. Your CV remains saved.",
        409,
      );
    const coverLetter = draft.coverLetter || "";
    const result = await database.collection("applications").updateOne(query, {
      $set: {
        cvDraftId: draft.id,
        profileSnapshot: draft.profileSnapshot,
        preparationMethod: "CV builder saved version",
        coverLetter,
        status: "Ready for review",
        statusHistory: statusHistory(
          application as unknown as Application,
          "Ready for review",
          new Date().toISOString(),
        ),
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
