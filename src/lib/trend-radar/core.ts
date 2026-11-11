import type { YoutubeVideo } from "../modules/types";
import type { ImageApproval } from "./image-policy";

export type RadarCategory = "Football" | "Entertainment" | "Technology" | "World";
export type RadarSource = { publisher: string; url: string; publishedAt: string };
export type RadarStory = {
  id: string;
  title: string;
  summary: string;
  category: RadarCategory;
  sources: RadarSource[];
  publishedAt: string;
  checkedAt: string;
  score: number;
  why: string;
  people: string[];
  hidden?: boolean;
};
export type RadarClip = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  duration: string;
  seconds: number;
  thumbnail: string;
  source: "YouTube";
  rights: "unknown";
  speech: "unknown";
  peopleCount: "unknown";
  aspectRatio: "unknown";
  suitability: "unverified";
};
export const radarStatuses = [
  "Discovered", "Clip Review", "Ready for Kling", "Generated", "Edited", "Published",
] as const;
export type RadarStatus = (typeof radarStatuses)[number];
export type RadarAssignment = {
  role: string;
  imageTag: string;
  imageFilename: string;
  characterId?: string;
  identity?: string;
  description?: string;
  outfit?: string;
};
export type RadarProject = {
  id: string;
  story: RadarStory;
  clip?: RadarClip;
  manualVideoUrl?: string;
  mediaNote?: string;
  assignments: RadarAssignment[];
  approvedImages?: ImageApproval[];
  sceneDescription?: string;
  environmentTag?: string;
  prompt: string;
  captions: Record<string, string>;
  status: RadarStatus;
  publishedUrls: string[];
  notes: string;
  updatedAt: string;
  archived: boolean;
};
export function exactYouTubeSeconds(duration: string): number | null {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(duration);
  if (!match || !match.slice(1).some((v) => v !== undefined)) return null;
  const seconds = Number(match[1] || 0) * 86400 +
    Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
export function videoCandidate(video: YoutubeVideo): RadarClip | null {
  const seconds = exactYouTubeSeconds(video.duration);
  if (seconds === null || seconds < 1 || seconds > 15) return null;
  return {
    id: video.id, title: video.title, url: video.url,
    publishedAt: video.publishedAt, duration: video.duration, seconds,
    thumbnail: video.thumbnail, source: "YouTube", rights: "unknown",
    speech: "unknown", peopleCount: "unknown",
    aspectRatio: "unknown", suitability: "unverified",
  };
}
const stopWords = new Set("the a an in on at of to for from with over after as is are was were and but or their its new latest how what why this that has have says say amid about against".split(" "));
function tokens(title: string): string[] {
  return [...new Set(title.toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word)))];
}
export function sameStory(a: string, b: string): boolean {
  const aa = tokens(a), bb = tokens(b);
  if (!aa.length || !bb.length) return false;
  const overlap = aa.filter((part) => bb.includes(part)).length;
  const union = new Set([...aa, ...bb]).size;
  return overlap >= 4 && overlap / union >= 0.72;
}
export function storyScore(story: RadarStory, now = Date.now()): number {
  const published = Date.parse(story.publishedAt);
  if (!Number.isFinite(published)) return 0;
  const ageHours = Math.max(0, (now - published) / 3600000);
  const freshness = Math.max(0, 60 - ageHours * 2.1);
  const importance = story.category === "Football" ? 22 :
    story.category === "Entertainment" ? 19 : story.category === "Technology" ? 15 : 10;
  const corroboration = Math.min(18, (new Set(story.sources.map((s) => s.publisher)).size - 1) * 9);
  return Math.max(0, Math.round(freshness + importance + corroboration));
}
/** Literal proper-name phrases found in the published headline. Not identity verification. */
export function headlineNameMentions(headline: string): string[] {
  const excluded = new Set([
    "Manchester United", "Manchester City", "Real Madrid", "New York",
    "The Guardian", "BBC Sport", "Champions League", "Premier League",
    "United States", "World Cup", "Europa League", "Saudi Arabia",
  ]);
  const phrases = headline.match(/\b[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)?\s+[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)?\b/g) || [];
  return [...new Set(phrases)].filter((p) => !excluded.has(p)).slice(0, 5);
}
export function opportunityReason(story: RadarStory): string {
  if (story.id.startsWith("manual:")) return "Manually supplied reference. Publication time, content, identities and popularity have not been independently verified. Consider an entirely fictional reaction scene.";
  const idea = story.category === "Football"
    ? "A fictional dressing-room reaction or coach-and-player exchange might fit."
    : story.category === "Entertainment"
      ? "A fictional reaction or awkward conversation might fit."
      : story.category === "Technology"
        ? "An imaginary office meeting or surprised reaction might fit."
        : "A short fictional reaction scene might fit.";
  return (story.sources.length > 1
    ? "Multiple publisher reports; this is not a measured social-media trend. "
    : "Recent publisher coverage; popularity has not been measured. ") + idea;
}
export function mergeStories(rows: RadarStory[], now = Date.now()): RadarStory[] {
  const groups: RadarStory[] = [];
  for (const item of [...rows].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    const existing = groups.find((g) => sameStory(g.title, item.title) ||
      g.sources.some((s) => item.sources.some((o) => o.url === s.url)));
    if (!existing) {
      groups.push({ ...item, sources: [...item.sources] });
      continue;
    }
    for (const source of item.sources)
      if (!existing.sources.some((s) => s.url === source.url))
        existing.sources.push(source);
    if (Date.parse(item.publishedAt) > Date.parse(existing.publishedAt))
      existing.publishedAt = item.publishedAt;
  }
  return groups.map((g) => ({
    ...g, people: headlineNameMentions(g.title),
    score: storyScore(g, now), why: opportunityReason(g),
  })).sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt));
}
export function visibleStories(stories: RadarStory[], hours: number, now = Date.now()) {
  return stories.filter((s) =>
    !s.hidden && Number.isFinite(Date.parse(s.publishedAt)) &&
    Date.parse(s.publishedAt) <= now + 300000 &&
    Date.parse(s.publishedAt) >= now - hours * 3600000).slice(0, 12);
}
export function klingReplacementPrompt(assignments: RadarAssignment[], environmentTag = ""): string {
  const roles = new Set<string>(), tags = new Set<string>();
  const lines = assignments.map((a) => {
    const role = a.role.trim();
    if (!role || role.length > 80 || !/^@Image[1-9]\d*$/.test(a.imageTag) ||
        roles.has(role.toLowerCase()) || tags.has(a.imageTag))
      throw new Error("Each character needs a distinct role and @Image reference.");
    roles.add(role.toLowerCase());
    tags.add(a.imageTag);
    return "Replace " + role + " with the person from " + a.imageTag + ".";
  });
  if (!lines.length || lines.length > 10) throw new Error("Assign 1–10 characters.");
  if (environmentTag && (!/^@Image[1-9]\d*$/.test(environmentTag) || tags.has(environmentTag)))
    throw new Error("Use a separate @Image tag for the optional environment.");
  return [
    "@Video1 " + lines.join(" "),
    environmentTag ? "Use " + environmentTag + " only as an optional environment reference; do not overwrite the original scene unless explicitly requested." : "",
    "Keep the original background, movements, gestures, camera movement, lighting, dialogue, sound, rhythm and timing completely unchanged.",
    "Track every character when they switch positions. Preserve each assigned person's distinct face, body proportions and outfit.",
    "Only replace the specified characters. Keep everyone and everything else as in @Video1. No new dialogue or actions.",
  ].filter(Boolean).join("\n\n");
}
const platforms = ["YouTube Shorts", "TikTok", "Instagram Reels", "Facebook Reels", "X"] as const;
export function captionDrafts(story: RadarStory): Record<string, string> {
  const title = story.title.replace(/\s+/g, " ").slice(0, 110);
  return Object.fromEntries(platforms.map((platform, index) => {
    const openers = [
      "Imaginary reactions to the headline:",
      "If the group chat saw this headline:",
      "POV: the fictional meeting after reading:",
      "A totally made-up reaction to:",
      "Parody scene inspired by the headline:",
    ];
    const tags = story.category === "Football" ? "#FootballParody #AIVideo" :
      story.category === "Entertainment" ? "#EntertainmentParody #AIVideo" :
        "#NewsParody #AIVideo";
    return [platform, openers[index] + " " + title + "\nAI-generated fictional parody, not real footage. " + tags];
  }));
}
