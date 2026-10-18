import type { Profile } from "./types";
export const importFields = ["name", "email", "phone", "location", "github", "linkedin", "portfolio", "skills", "experience", "education", "projects"] as const;
export type ImportField = (typeof importFields)[number];
export type ProfilePatch = Partial<Pick<Profile, ImportField>>;
export function missingProfileFields(current: Partial<Profile>, extracted: ProfilePatch) {
  const patch: ProfilePatch = {};
  for (const key of importFields) if (!current[key]?.trim() && extracted[key]) patch[key] = extracted[key];
  return patch;
}
