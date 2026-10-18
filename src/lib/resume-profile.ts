import { aiJson } from "./ai";

import { importFields, type ImportField, type ProfilePatch } from "./profile-import-fields";
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const headings: Record<string, ImportField | "ignore"> = {
  skills: "skills", "technical skills": "skills", "core skills": "skills", "core competencies": "skills",
  experience: "experience", "work experience": "experience", "professional experience": "experience", "employment history": "experience",
  education: "education", "academic qualifications": "education",
  projects: "projects", "personal projects": "projects", "selected projects": "projects",
  summary: "ignore", "professional summary": "ignore", profile: "ignore", certifications: "ignore", references: "ignore", interests: "ignore", languages: "ignore", awards: "ignore", volunteer: "ignore",
};
// Deterministic import works without any AI credentials. Unknown details stay blank.
export function basicResumeProfile(text: string): ProfilePatch {
  const patch: ProfilePatch = {};
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) patch.email = email;
  const phone = text.match(/(?:\+\d{1,3}[ ()-]*)?(?:\(?\d{3,4}\)?[ .-]*){2}\d{3,4}\b/)?.[0];
  if (phone && phone.replace(/\D/g, "").length >= 10) patch.phone = phone;
  for (const line of lines) {
    const contact = line.match(/^(name|full name|location|based in|portfolio|website)\s*:\s*(.+)$/i);
    if (contact) {
      const field = /name/i.test(contact[1]) ? "name" : /location|based/i.test(contact[1]) ? "location" : "portfolio";
      patch[field] = contact[2].trim();
    }
    const urls = line.match(/(?:https?:\/\/)?(?:www\.)?(?:github\.com|linkedin\.com)\/[^\s|,]+/gi) || [];
    for (const url of urls) {
      // Web profile inputs require a full HTTPS URL; the account path is never inferred.
      patch[/github\.com/i.test(url) ? "github" : "linkedin"] = /^https?:\/\//i.test(url) ? url : "https://" + url;
    }
  }
  const first = lines[0];
  if (!patch.name && first && /^[\p{L}][\p{L}.'’-]*(?:\s+[\p{L}][\p{L}.'’-]*){1,4}$/u.test(first) &&
      !/resume|curriculum|vitae|developer|engineer|analyst|designer|skills|experience|education|summary|profile/i.test(first))
    patch.name = first;
  let section: ImportField | "ignore" | undefined;
  for (const line of lines) {
    const match = line.match(/^([^:]{2,40}):\s*(.*)$/);
    const title = (match ? match[1] : line).toLowerCase().replace(/[:\s]+$/, "");
    if (Object.hasOwn(headings, title)) {
      section = headings[title];
      if (section !== "ignore" && match?.[2]) patch[section] = [patch[section], match[2]].filter(Boolean).join("\n");
    } else if (section && section !== "ignore") {
      patch[section] = [patch[section], line].filter(Boolean).join("\n");
    }
  }
  return patch;
}
export function quotedResumeProfile(text: string, result: unknown): ProfilePatch {
  if (!result || typeof result !== "object" || !("fields" in result)) throw new Error("Invalid resume fields");
  const fields = result.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("Invalid resume fields");
  const source = normalize(text);
  const patch: ProfilePatch = {};
  for (const key of importFields) {
    const excerpts = (fields as Record<string, unknown>)[key];
    if (!Array.isArray(excerpts) || excerpts.length > 100) continue;
    // Every value must be an exact excerpt. A single invented excerpt rejects that field.
    if (!excerpts.length || excerpts.some((v) => typeof v !== "string" || !normalize(v) || !source.includes(normalize(v)))) continue;
    const value = [...new Set<string>(excerpts)].map(normalize).join(key === "skills" ? ", " : "\n");
    if (value.length > 50000 || (["name", "email", "phone", "location", "github", "linkedin", "portfolio"].includes(key) && (excerpts.length !== 1 || value.length > 300))) continue;
    if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) continue;
    if (["github", "linkedin", "portfolio"].includes(key) && !/^https?:\/\/[^\s]+$/i.test(value)) continue;
    patch[key] = value;
  }
  return patch;
}
export async function extractResumeProfile(text: string) {
  const basic = basicResumeProfile(text);
  if (!process.env.OPENAI_API_KEY) return { fields: basic, method: "CV section import", warning: undefined as string | undefined };
  try {
    const result = await aiJson(
      'Extract the candidate’s profile from this CV. Return {"fields":{"name":["exact quote"],"email":[],"phone":[],"location":[],"github":[],"linkedin":[],"portfolio":[],"skills":[],"experience":[],"education":[],"projects":[]}}. Each item MUST be a verbatim excerpt from the CV. Extract actual qualifications only, preserving employers, dates and context. Never treat desired job skills as possessed skills. Omit unknown fields, never infer or invent. Contact fields have at most one excerpt. Do not include section headings in values.',
      { cv: text },
    );
    return { fields: { ...basic, ...quotedResumeProfile(text, result) }, method: "AI-assisted CV import", warning: undefined as string | undefined };
  } catch (error) {
    return { fields: basic, method: "CV section import", warning: (error instanceof Error ? error.message : "AI extraction unavailable.") + " Imported recognised sections instead; review your profile." };
  }
}
