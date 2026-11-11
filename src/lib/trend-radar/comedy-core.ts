export const templateCategories = [
  "Group dancing",
  "Clown dancing",
  "Two-person arguments",
  "Fighting and referees",
  "Funny conversations",
  "Angry manager scenes",
  "Embarrassing reactions",
  "Celebrations",
  "Funny interviews",
] as const;
export type TemplateCategory = (typeof templateCategories)[number];
export type ComedyTemplate = {
  id: string;
  title: string;
  category: TemplateCategory;
  seconds: number;
  width: number;
  height: number;
  audioTrack: "present" | "absent" | "unknown";
  speech: "yes" | "no" | "unknown";
  performers: number | null;
  description: string;
  rights: "owner-confirmed" | "license-confirmed" | "creator-authorized";
  evidence: string;
  approved: boolean;
  localFile: boolean;
  updatedAt: string;
};
const sceneCategories: Record<string, string[]> = {
  defeat: [
    "Group dancing",
    "Clown dancing",
    "Embarrassing reactions",
    "Angry manager scenes",
  ],
  goalkeeper: ["Embarrassing reactions", "Funny conversations"],
  manager: ["Angry manager scenes", "Two-person arguments", "Funny interviews"],
  rivalry: [
    "Two-person arguments",
    "Fighting and referees",
    "Funny conversations",
  ],
  winning: ["Celebrations", "Group dancing"],
  entertainment: [
    "Funny interviews",
    "Funny conversations",
    "Two-person arguments",
  ],
};
export function matchingTemplates(
  templates: ComedyTemplate[],
  kind: string,
): ComedyTemplate[] {
  const desired = sceneCategories[kind] || sceneCategories.defeat;
  return templates
    .filter((t) => t.approved && t.seconds > 0 && t.seconds <= 15)
    .sort(
      (a, b) =>
        Number(desired.includes(b.category)) -
          Number(desired.includes(a.category)) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 12);
}

export function opportunityKind(story: {
  title: string;
  category: string;
}): string {
  if (/goalkeeper|keeper/i.test(story.title)) return "goalkeeper";
  if (/manager|coach|sack/i.test(story.title)) return "manager";
  if (/rival|derby/i.test(story.title)) return "rivalry";
  if (/win|champion|celebrat/i.test(story.title)) return "winning";
  return story.category === "Football" ? "defeat" : "entertainment";
}
/** Caller must provide only templates whose local source files actually exist. */
export function productionPriority(
  story: { title: string; category: string; score: number },
  available: ComedyTemplate[],
) {
  const kind = opportunityKind(story);
  const matches = matchingTemplates(available, kind).filter((t) =>
    (sceneCategories[kind] || sceneCategories.defeat).includes(t.category),
  );
  const preferred = matches[0];
  return {
    score:
      story.score +
      (preferred ? 40 : 0) +
      (preferred?.audioTrack === "present" ? 5 : 0),
    reason: preferred
      ? "Approved browser-local template available: " +
        preferred.title +
        ". " +
        preferred.rights +
        "; suitability still needs creator review."
      : "Source-only opportunity: no approved video is available in this browser.",
  };
}
