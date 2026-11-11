export const templateCategories = [
  "Group dancing", "Clown dancing", "Two-person arguments", "Fighting and referees",
  "Funny conversations", "Angry manager scenes", "Embarrassing reactions",
  "Celebrations", "Funny interviews",
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
export function matchingTemplates(templates: ComedyTemplate[], kind: string): ComedyTemplate[] {
  const suggested: Record<string, string[]> = {
    defeat: ["Group dancing", "Clown dancing", "Embarrassing reactions", "Angry manager scenes"],
    goalkeeper: ["Embarrassing reactions", "Funny conversations"],
    manager: ["Angry manager scenes", "Two-person arguments", "Funny interviews"],
    rivalry: ["Two-person arguments", "Fighting and referees", "Funny conversations"],
    winning: ["Celebrations", "Group dancing"],
    entertainment: ["Funny interviews", "Funny conversations", "Two-person arguments"],
  };
  const desired = suggested[kind] || suggested.defeat;
  return templates.filter((t) => t.approved && t.seconds > 0 && t.seconds <= 15)
    .sort((a, b) => Number(desired.includes(b.category)) - Number(desired.includes(a.category)) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 12);
}
