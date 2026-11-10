import { db } from "@/lib/db";
import {
  assistantPolicy,
  recommendedApplications,
} from "@/lib/assistant-policy";
import {
  assistedCollection,
  assistedHeaders,
  assistedError,
  publicAttempt,
} from "@/lib/assisted-store";
import { emptyProfile, type Application, type Job } from "@/lib/types";
import { applicationActions } from "@/lib/application-history";
import { applicationWasApplied } from "@/lib/vacancy-groups";
export async function GET() {
  try {
    const database = await db(),
      [jobs, apps, attempts, profile, policy] = await Promise.all([
        database.collection<Job>("jobs").find({}).toArray(),
        database.collection<Application>("applications").find({}).toArray(),
        (await assistedCollection())
          .find({})
          .sort({ updatedAt: -1 })
          .limit(500)
          .toArray(),
        database.collection("profile").findOne({ key: "owner" }),
        assistantPolicy(),
      ]);
    return Response.json(
      {
        recommended: recommendedApplications(
          jobs,
          apps,
          { ...emptyProfile, ...profile?.profile },
          policy,
        ).slice(0, 50),
        attempts: attempts.map(publicAttempt),
        policy,
        counts: {
          discovered: jobs.length,
          eligible: jobs.filter((j) => j.eligibility === "eligible").length,
          shortlisted: apps.filter(
            (a) =>
              a.saved !== false &&
              !applicationWasApplied(a) &&
              a.status !== "Archived",
          ).length,
          packages: attempts.length,
          filled: attempts.filter((a) => a.report?.ready).length,
          intervention: attempts.filter(
            (a) =>
              !a.closedAt &&
              ["awaiting-user", "uncertain-submission"].includes(a.state),
          ).length,
          browserConfirmed: attempts.filter(
            (a) =>
              a.state === "confirmed-submission" &&
              a.history.some((h) => h.reason.startsWith("Companion observed")),
          ).length,
          ownerReconciled: attempts.filter(
            (a) =>
              a.state === "confirmed-submission" &&
              !a.history.some((h) => h.reason.startsWith("Companion observed")),
          ).length,
          ownerReported: apps.filter(
            (a) =>
              a.submittedAt &&
              !attempts.some(
                (t) =>
                  t.applicationId === a.id &&
                  t.state === "confirmed-submission",
              ),
          ).length,
          responses: apps.filter((a) => a.employerResponse).length,
          interviews: apps.filter(
            (a) => a.status === "Interview" || a.interviewDate,
          ).length,
          offers: apps.filter((a) => a.status === "Offer").length,
          rejections: apps.filter((a) => a.status === "Rejected").length,
          followUps: applicationActions(apps).filter(
            (a) => a.kind === "Follow-up",
          ).length,
        },
        actions: applicationActions(apps).map((a) => ({
          applicationId: a.app.id,
          company: a.app.job.company,
          title: a.app.job.title,
          kind: a.kind,
          date: a.date,
          overdue: a.overdue,
        })),
      },
      { headers: assistedHeaders },
    );
  } catch (e) {
    return assistedError(e);
  }
}
