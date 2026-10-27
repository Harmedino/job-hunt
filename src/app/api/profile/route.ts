import {careerPreferences,validateCareerPreferences} from "@/lib/career-preferences";
import {validateJobFilters} from "@/lib/job-filter-state";
import { db, errorResponse } from "@/lib/db";
import { emptyProfile, type Profile } from "@/lib/types";
export async function GET() {
  try {
    const doc = await (
      await db()
    )
      .collection("profile")
      .findOne({ key: "owner" });
    return Response.json({...emptyProfile,...doc?.profile,career:careerPreferences(doc?.profile||emptyProfile)});
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const database=await db();
    const stored=(await database.collection("profile").findOne({key:"owner"}))?.profile;
    const profile:Profile = { ...emptyProfile };
    for (const key of Object.keys(profile) as (keyof Omit<Profile,'career'|'jobSearchDefaults'>)[]) {
      if (typeof body[key] !== "string" || body[key].length > 50000)
        return Response.json(
          { error: "Invalid profile field: " + key },
          { status: 400 },
        );
      profile[key] = body[key];
    }
    try{profile.career=body.career===undefined?careerPreferences(stored||emptyProfile):validateCareerPreferences(body.career);if(body.jobSearchDefaults!==undefined){if(!body.jobSearchDefaults||typeof body.jobSearchDefaults!=='object'||Array.isArray(body.jobSearchDefaults))throw new Error('Invalid saved filter defaults.');profile.jobSearchDefaults={};for(const path of ['development','cybersecurity'] as const){if(body.jobSearchDefaults[path]!==undefined)profile.jobSearchDefaults[path]=validateJobFilters(body.jobSearchDefaults[path]);}}else if(stored?.jobSearchDefaults)profile.jobSearchDefaults=stored.jobSearchDefaults;}catch(e){return Response.json({error:(e as Error).message},{status:400});}
    await database
      .collection("profile")
      .updateOne({ key: "owner" }, { $set: { profile } }, { upsert: true });
    return Response.json(profile);
  } catch (e) {
    return errorResponse(e);
  }
}
