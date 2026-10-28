import { randomUUID } from "node:crypto";
import { validateCustomFields } from "@/lib/custom-fields";
import {
  validateCareerRecords,
  validateNysc,
  validateCvTracks,
} from "@/lib/career-records";
import { validateAvailability } from "@/lib/application-history";
import {
  careerPreferences,
  validateCareerPreferences,
} from "@/lib/career-preferences";
import { validateJobFilters } from "@/lib/job-filter-state";
import { db, errorResponse } from "@/lib/db";
import { emptyProfile, type Profile } from "@/lib/types";
export async function GET() {
  try {
    const doc = await (await db())
      .collection("profile")
      .findOne({ key: "owner" });
    return Response.json({
      ...emptyProfile,
      ...doc?.profile,
      revision: doc?.revision || doc?.updatedAt || "",
      career: careerPreferences(doc?.profile || emptyProfile),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const database = await db();
    const storedDoc = await database
      .collection("profile")
      .findOne({ key: "owner" });
    const stored = storedDoc?.profile;
    if (
      body.revision !== undefined &&
      body.revision !== (storedDoc?.revision || storedDoc?.updatedAt || "")
    )
      return Response.json(
        {
          error:
            "Your master profile changed elsewhere. Reload it before replacing these records.",
        },
        { status: 409 },
      );
    const profile: Profile = { ...emptyProfile };
    for (const key of Object.keys(profile) as (keyof Pick<
      Profile,
      | "name"
      | "email"
      | "location"
      | "phone"
      | "github"
      | "linkedin"
      | "portfolio"
      | "skills"
      | "experience"
      | "education"
      | "projects"
      | "roles"
      | "preferences"
      | "cvText"
    >)[]) {
      if (typeof body[key] !== "string" || body[key].length > 50000)
        return Response.json(
          { error: "Invalid profile field: " + key },
          { status: 400 },
        );
      profile[key] = body[key];
    }
    try {
      profile.availability =
        body.availability === undefined
          ? stored?.availability || { mode: "Not set", readyFrom: "" }
          : validateAvailability(body.availability);
      profile.career =
        body.career === undefined
          ? careerPreferences(stored || emptyProfile)
          : validateCareerPreferences(body.career);
      if (body.jobSearchDefaults !== undefined) {
        if (
          !body.jobSearchDefaults ||
          typeof body.jobSearchDefaults !== "object" ||
          Array.isArray(body.jobSearchDefaults)
        )
          throw new Error("Invalid saved filter defaults.");
        profile.jobSearchDefaults = {};
        for (const path of ["development", "cybersecurity"] as const) {
          if (body.jobSearchDefaults[path] !== undefined)
            profile.jobSearchDefaults[path] = validateJobFilters(
              body.jobSearchDefaults[path],
            );
        }
      } else if (stored?.jobSearchDefaults)
        profile.jobSearchDefaults = stored.jobSearchDefaults;
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
    try {
      profile.skillGroups =
        body.skillGroups == null
          ? (stored?.skillGroups ?? undefined)
          : validateCustomFields(body.skillGroups);
      profile.careerRecords =
        body.careerRecords == null
          ? (stored?.careerRecords ?? undefined)
          : validateCareerRecords(body.careerRecords);
      profile.customFields =
        body.customFields == null
          ? (stored?.customFields ?? undefined)
          : validateCustomFields(body.customFields);
      profile.nysc =
        body.nysc == null
          ? (stored?.nysc ?? undefined)
          : validateNysc(body.nysc);
      profile.cvTracks =
        body.cvTracks == null
          ? (stored?.cvTracks ?? undefined)
          : validateCvTracks(body.cvTracks);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
    for (const key of [
      "careerRecords",
      "nysc",
      "cvTracks",
      "skillGroups",
      "customFields",
    ] as const)
      if (profile[key] == null) delete profile[key];
    if (stored && JSON.stringify(stored) !== JSON.stringify(profile))
      await database
        .collection("profile_history")
        .insertOne({
          id: randomUUID(),
          key: "owner",
          createdAt: new Date().toISOString(),
          profile: stored,
        });
    const revision = randomUUID(),
      updatedAt = new Date().toISOString();
    const result = await database
      .collection("profile")
      .updateOne(
        {
          key: "owner",
          ...(storedDoc
            ? storedDoc.revision
              ? { revision: storedDoc.revision }
              : {
                  revision: { $exists: false },
                  updatedAt: storedDoc.updatedAt || { $exists: false },
                }
            : {}),
        },
        { $set: { profile, updatedAt, revision } },
        { upsert: !storedDoc },
      );
    if (storedDoc && !result.matchedCount)
      return Response.json(
        {
          error:
            "The master profile changed during this save. Your proposed edits remain in the form.",
        },
        { status: 409 },
      );
    return Response.json({ ...profile, revision });
  } catch (e) {
    return errorResponse(e);
  }
}
