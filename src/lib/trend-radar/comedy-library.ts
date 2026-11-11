import { randomUUID } from "node:crypto";
import { db } from "../db";
import { ownerFilter, OWNER } from "../modules/store";
import { ModuleError } from "../modules/validation";
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
async function collection() {
  const database = await db();
  const col = database.collection<ComedyTemplate>("trend_radar_comedy_templates");
  await col.createIndex({ owner: 1, id: 1 }, { unique: true });
  return col;
}
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
export async function listComedyTemplates() {
  return (await (await collection()).find(ownerFilter(), { projection: { _id: 0, owner: 0 } })
    .sort({ updatedAt: -1 }).limit(100).toArray()) as ComedyTemplate[];
}
function validText(value: unknown, max: number): string {
  return typeof value === "string" && value.length <= max ? value.trim() : "";
}
export async function saveComedyTemplate(input: Record<string, unknown>): Promise<ComedyTemplate> {
  const category = validText(input.category, 80);
  if (!(templateCategories as readonly string[]).includes(category)) throw new ModuleError("Choose an approved comedy-template category.");
  const seconds = Number(input.seconds), width = Number(input.width), height = Number(input.height);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 15) throw new ModuleError("Upload a 1–15 second source video.");
  if (!Number.isInteger(width) || width < 16 || width > 8192 ||
      !Number.isInteger(height) || height < 16 || height > 8192)
    throw new ModuleError("Video dimensions must be inspected before saving.");
  const title = validText(input.title, 160);
  if (!title) throw new ModuleError("A template title is required.");
  const evidence = validText(input.evidence, 1000);
  const rights = validText(input.rights, 40);
  if (!["owner-confirmed", "license-confirmed", "creator-authorized"].includes(rights))
    throw new ModuleError("Confirm lawful reuse rights before adding a template.");
  if (rights !== "owner-confirmed" && !evidence)
    throw new ModuleError("Provide a license or creator-permission reference.");
  if (input.approved !== true) throw new ModuleError("Approve the template after inspecting it.");
  const count = input.performers === null ? null : Number(input.performers);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 20))
    throw new ModuleError("Confirm up to 20 visible performers, or leave unknown.");
  const sourceTrack = String(input.audioTrack || "unknown");
  const speech = String(input.speech || "unknown");
  const allowed = ["present", "absent", "unknown"];
  if (!allowed.includes(sourceTrack) || !["yes", "no", "unknown"].includes(speech))
    throw new ModuleError("Unknown audio inspection values.");
  const id = typeof input.id === "string" && /^template-[\w-]{12,70}$/.test(input.id)
    ? input.id : "template-" + randomUUID();
  const template: ComedyTemplate = {
    id, title, category: category as TemplateCategory, seconds, width, height,
    audioTrack: sourceTrack as ComedyTemplate["audioTrack"],
    speech: speech as ComedyTemplate["speech"],
    performers: count,
    description: validText(input.description, 800),
    rights: rights as ComedyTemplate["rights"],
    evidence, approved: true, localFile: true, updatedAt: new Date().toISOString(),
  };
  await (await collection()).updateOne(ownerFilter({ id }), {
    $set: { ...template, owner: OWNER },
  }, { upsert: true });
  return template;
}
