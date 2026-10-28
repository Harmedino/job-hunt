import { extractRequirements, skillMention } from "./job-intelligence";
import { emptyProfile, type Profile } from "./types";
import { materializeCareerProfile } from "./career-records";
export type JobKeyword = {
  id: string;
  text: string;
  kind: "required" | "preferred" | "custom";
  priority: number;
};
export function validateKeywords(value: unknown): JobKeyword[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new Error("Use at most 50 job-specific keywords.");
  const ids = new Set<string>();
  return value.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.id !== "string" ||
      !v.id ||
      v.id.length > 100 ||
      ids.has(v.id) ||
      typeof v.text !== "string" ||
      !v.text.trim() ||
      v.text.length > 200 ||
      !["required", "preferred", "custom"].includes(v.kind) ||
      !Number.isInteger(v.priority) ||
      v.priority < 1 ||
      v.priority > 5
    )
      throw new Error(
        "Keywords need unique IDs, text, required/preferred/custom status and priority from 1 to 5.",
      );
    ids.add(v.id);
    return {
      id: v.id,
      text: v.text.trim(),
      kind: v.kind,
      priority: v.priority,
    };
  });
}
export function suggestJobKeywords(description: string): JobKeyword[] {
  const result: JobKeyword[] = [];
  for (const requirement of extractRequirements(description, emptyProfile))
    for (const skill of requirement.skills) {
      const previous = result.find(
        (k) => k.text.toLowerCase() === skill.toLowerCase(),
      );
      if (previous) {
        if (requirement.kind === "required") previous.kind = "required";
        continue;
      }
      result.push({
        id: "suggested-" + result.length,
        text: skill,
        kind: requirement.kind,
        priority: requirement.kind === "required" ? 3 : 2,
      });
    }
  return result.slice(0, 50);
}
export function keywordEvidence(keywords: JobKeyword[], profile: Profile) {
  const p = materializeCareerProfile(profile),
    evidence = [
      p.skills,
      p.experience,
      p.projects,
      p.education,
      profile.career?.securitySkills,
      profile.career?.securityExperience,
      profile.career?.securityProjects,
      ...(profile.customFields || [])
        .filter((f) => f.confirmed)
        .map((f) => f.value),
    ].join("\n");
  return keywords.map((k) => ({
    ...k,
    supported: skillMention(evidence, k.text),
    notice:
      "A source mention needs context review and does not establish proficiency.",
  }));
}
