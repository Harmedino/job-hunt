import { db } from "./db";
import { emptyProfile } from "./types";
import { extractResumeProfile } from "./resume-profile";
import { missingProfileFields, type ProfilePatch } from "./profile-import-fields";

export async function importResume(text: string) {
  const extracted = await extractResumeProfile(text);
  const common = { text, fields: extracted.fields, method: extracted.method, aiWarning: extracted.warning };
  if (!process.env.MONGODB_URI) return {
    ...common, persisted: false, storage: "missing", patchedFields: [],
    warning: "CV read into the form, but not saved. Set MONGODB_URI in Vercel and redeploy, then save your profile. Keep this page open until saved.",
  };
  try {
    const collection = (await db()).collection("profile");
    // Create the defaults once; field-level updates below preserve existing and concurrent edits.
    await collection.updateOne({ key: "owner" }, { $setOnInsert: { profile: { ...emptyProfile } } }, { upsert: true });
    const current = (await collection.findOne({ key: "owner" }))?.profile || {};
    const patch = missingProfileFields(current, extracted.fields);
    const patchedFields: (keyof ProfilePatch)[] = [];
    for (const key of Object.keys(patch) as (keyof ProfilePatch)[]) {
      const update = await collection.updateOne(
        { key: "owner", [`profile.${key}`]: current[key] ?? { $exists: false } },
        { $set: { [`profile.${key}`]: patch[key] } },
      );
      if (update.modifiedCount) patchedFields.push(key);
    }
    await collection.updateOne({ key: "owner" }, { $set: { "profile.cvText": text } });
    return { ...common, persisted: true, patchedFields };
  } catch (error) {
    console.error("CV storage failed:", error instanceof Error ? error.name : "UnknownError");
    return { ...common, persisted: false, storage: "unreachable", patchedFields: [], warning: "CV read into the form, but not saved completely: storage could not be reached. Check MongoDB and save your profile. Keep this page open until saved." };
  }
}
