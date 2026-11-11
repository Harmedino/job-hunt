import { XMLParser } from "fast-xml-parser";
import type { RadarCategory, RadarStory } from "./core";
import { opportunityReason, storyScore } from "./core";
export type RadarFeed = {
  name: string;
  category: RadarCategory;
  url: string;
  community?: boolean;
};
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  processEntities: false,
});
const clean = (v: unknown, max = 800) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|apos);/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
export function parseRadarFeed(
  xml: string,
  feed: RadarFeed,
  now = Date.now(),
): RadarStory[] {
  if (xml.length > 500000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error(
      "Feed exceeds bounds or contains unsupported XML declarations.",
    );
  const root = parser.parse(xml);
  const raw = root?.rss?.channel?.item ?? root?.feed?.entry;
  return (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .slice(0, 35)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const title = clean(item.title?.["#text"] ?? item.title, 240);
      const links = Array.isArray(item.link) ? item.link : [item.link];
      const link = links.find(
        (l: unknown) =>
          typeof l === "string" ||
          (l &&
            typeof l === "object" &&
            (!("@_rel" in l) || l["@_rel"] === "alternate")),
      );
      const rawUrl = typeof link === "string" ? link : link?.["@_href"];
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return [];
      }
      if (
        !title ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port
      )
        return [];
      const date = Date.parse(
        String(item.pubDate ?? item.published ?? item.updated ?? ""),
      );
      if (
        !Number.isFinite(date) ||
        date > now + 300000 ||
        date < now - 72 * 3600000
      )
        return [];
      const publishedAt = new Date(date).toISOString();
      const story: RadarStory = {
        id: "feed:" + url.href,
        title,
        summary: clean(
          item.description ??
            item.summary ??
            item.content?.["#text"] ??
            item.content,
        ),
        category: feed.category,
        sources: [
          {
            publisher: feed.name,
            url: url.href,
            publishedAt,
            kind: feed.community ? "community" : "report",
          },
        ],
        publishedAt,
        checkedAt: new Date(now).toISOString(),
        score: 0,
        why: "",
        people: [],
      };
      if (feed.community)
        story.summary =
          "Unverified community discussion; claims and popularity are not established. " +
          story.summary.slice(0, 650);
      story.score = storyScore(story, now);
      story.why = opportunityReason(story);
      return [story];
    });
}
/** Source-reported scores only. Never assigns individual blame or claims official stats. */
export function reportedHeavyDefeats(stories: RadarStory[]) {
  return stories
    .filter(
      (s) =>
        s.category === "Football" &&
        !s.sources.every((src) => src.kind === "community") &&
        /\b\d{1,2}\s*[–−-]\s*\d{1,2}\b/.test(s.title),
    )
    .flatMap((story) => {
      if (
        /\b(?:predict(?:ion|s|ed)?|odds|will|could|must|needs?|preview|would)\b/i.test(
          story.title,
        )
      )
        return [];
      const match = story.title.match(
        /(?<![\d–−-])\b(\d{1,2})\s*[–−-]\s*(\d{1,2})\b(?![\d–−-])/,
      );
      if (!match) return [];
      const [home, away] = [Number(match[1]), Number(match[2])];
      if (home > 20 || away > 20 || Math.abs(home - away) < 3) return [];
      return [
        {
          story,
          scoreline: match[0],
          note: "Scoreline reported in the linked headline. Fixture statistics, starting lineup, player ratings and current squad are unavailable; no individual underperformance is inferred.",
        },
      ];
    })
    .slice(0, 5);
}
