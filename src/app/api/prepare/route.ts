import { db, errorResponse } from "@/lib/db";
import { AiError, rankEvidence } from "@/lib/ai";
import { facts } from "@/lib/matching";
import { discover } from "@/lib/discovery";
import type { Profile } from "@/lib/types";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (typeof id !== "string")
      return Response.json(
        { error: "Invalid application ID" },
        { status: 400 },
      );
    const database = await db();
    const application = await database
      .collection("applications")
      .findOne({ id });
    if (!application)
      return Response.json({ error: "Application not found" }, { status: 404 });
    if (
      ["Submitted", "Interview", "Rejected", "Offer"].includes(
        application.status,
      )
    )
      return Response.json(
        {
          error:
            "This application has already progressed. Its prepared documents are preserved.",
        },
        { status: 409 },
      );
    const profile = (
      await database.collection("profile").findOne({ key: "owner" })
    )?.profile as Profile | undefined;
    if (!profile?.name || !profile.email || !facts(profile).length)
      return Response.json(
        {
          error:
            "Save your name, email, and qualifications in My Profile first.",
        },
        { status: 400 },
      );
    const live = await discover();
    if (!live.jobs.some((j) => j.id === application.job.id))
      return Response.json(
        {
          error:
            "This posting could not be confirmed in the current source feeds. Check the original listing before proceeding.",
        },
        { status: 409 },
      );
    if (application.job.eligibility !== "eligible")
      return Response.json(
        {
          error:
            "Nigeria eligibility needs manual confirmation on the original posting. Preparation is blocked until the source explicitly supports your location.",
        },
        { status: 409 },
      );
    const evidence = facts(profile);
    let chosen = evidence;
    let method = "Profile-based template";
    if (process.env.OPENAI_API_KEY) {
      chosen = await rankEvidence(application.job.description, evidence);
      method = "AI-ranked profile evidence";
    }
    const coverLetter = `Dear Hiring Team,\n\nI am applying for the ${application.job.title} position at ${application.job.company}. Please consider the following qualifications from my profile:\n\n${chosen.join("\n\n")}\n\nI would welcome the opportunity to discuss how my background fits your team. Thank you for considering my application.\n\n${profile.name}`;
    await database.collection("applications").updateOne(
      { id },
      {
        $set: {
          status: "Ready for review",
          cvFacts: chosen,
          coverLetter,
          profileSnapshot: profile,
          preparationMethod: method,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    return Response.json({ ok: true, method });
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
