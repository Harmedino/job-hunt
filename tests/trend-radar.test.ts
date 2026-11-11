import test from "node:test";
import assert from "node:assert/strict";
import {
  exactYouTubeSeconds, videoCandidate, mergeStories, visibleStories, sameStory,
  klingReplacementPrompt, captionDrafts, type RadarStory,
} from "../src/lib/trend-radar/core";
import type { YoutubeVideo } from "../src/lib/modules/types";
const now = Date.parse("2026-11-11T12:00:00Z");
const story = (title: string, url: string, hours = 2): RadarStory => ({
  id: url, title, summary: "", category: "Football",
  publishedAt: new Date(now - hours * 3600000).toISOString(),
  checkedAt: new Date(now).toISOString(), sources: [
    { publisher: "Test publisher", url, publishedAt: new Date(now - hours * 3600000).toISOString() },
  ], score: 0, why: "", people: [],
});
const video = (duration: string): YoutubeVideo => ({
  id: "QWERTY12345", title: "Fixture", channelId: "", channelTitle: "Fixture",
  publishedAt: "2026-11-11T09:00:00Z", thumbnail: "", duration,
  description: "", url: "https://www.youtube.com/watch?v=QWERTY12345",
  fetchedAt: "", expiresAt: "",
});
test("strict ISO duration correctly handles seconds, minutes and hours", () => {
  assert.equal(exactYouTubeSeconds("PT1S"), 1);
  assert.equal(exactYouTubeSeconds("PT15S"), 15);
  assert.equal(exactYouTubeSeconds("PT0.5S"), .5);
  assert.equal(exactYouTubeSeconds("PT0M15S"), 15);
  assert.equal(exactYouTubeSeconds("PT16S"), 16);
  assert.equal(exactYouTubeSeconds("PT1M"), 60);
  assert.equal(exactYouTubeSeconds("PT1H"), 3600);
  for (const raw of ["", "short", "PT", "P1D", "PT1M01S", "PT-1S", "PTINF", "P0DT0S"])
    assert.equal(videoCandidate(video(raw)), null, "invalid or overlong: " + raw);
  assert.ok(videoCandidate(video("PT15S")));
  assert.equal(videoCandidate(video("PT15.001S")), null);
  assert.equal(videoCandidate(video("PT0S")), null);
});
test("short videos do not gain unsupported rights, audio or people claims", () => {
  const result = videoCandidate(video("PT9S"))!;
  assert.equal(result.seconds, 9);
  assert.equal(result.speech, "unknown");
  assert.equal(result.rights, "unknown");
  assert.equal(result.peopleCount, "unknown");
  assert.equal(result.aspectRatio, "unknown");
  assert.equal(result.suitability, "unverified");
});
test("distinct publisher references merge only when headline overlap is strong", () => {
  const first = story("Chelsea manager responds after surprising Arsenal result", "https://example.com/a");
  const second = story("Chelsea manager responds after surprising Arsenal result", "https://example.org/b");
  second.sources[0].publisher = "Second publisher";
  const unrelated = story("NASA launches a new robotic mission", "https://example.com/c");
  assert.ok(sameStory(first.title, second.title));
  const rows = mergeStories([first, second, unrelated], now);
  assert.equal(rows.length, 2);
  const merged = rows.find((x) => x.sources.length === 2);
  assert.ok(merged);
  assert.ok(merged.score > 0);
  assert.match(merged.why, /Multiple publisher reports/);
});
test("freshness filters return small number of real, non-hidden records", () => {
  const fresh = story("Fresh match result and reactions", "https://example.com/fresh", 5);
  const old = story("Old match result and reactions", "https://example.com/old", 40);
  const hidden = { ...story("Hidden story reaction", "https://example.com/hide", 1), hidden: true };
  assert.deepEqual(visibleStories([fresh, old, hidden], 6, now).map((s) => s.id), [fresh.id]);
  assert.equal(visibleStories([fresh, old], 48, now).length, 2);
});
test("character replacement assigns unique image tags without altering scene semantics", () => {
  const text = klingReplacementPrompt([
    { role: "the coach", imageTag: "@Image1", imageFilename: "coach.png" },
    { role: "the player", imageTag: "@Image2", imageFilename: "player.png" },
    { role: "the background dancer", imageTag: "@Image3", imageFilename: "dancer.png" },
  ]);
  assert.match(text, /@Video1 Replace the coach with the person from @Image1/);
  assert.match(text, /background dancer with the person from @Image3/);
  assert.match(text, /original background, movements, gestures/);
  assert.throws(() => klingReplacementPrompt([
    { role: "person 1", imageTag: "@Image1", imageFilename: "" },
    { role: "person 2", imageTag: "@Image1", imageFilename: "" },
  ]), /distinct role/);
  assert.throws(() => klingReplacementPrompt([], ""), /1–10/);
  assert.throws(() => klingReplacementPrompt([
    { role: "person 1", imageTag: "@Image1", imageFilename: "" },
  ], "@Image1"), /separate/);
});
test("caption drafts have disclosure and original source headline, not invented event details", () => {
  const drafts = captionDrafts(story("Chelsea coach reacts to club result", "https://example.com"));
  assert.equal(Object.keys(drafts).length, 5);
  for (const value of Object.values(drafts)) {
    assert.match(value, /AI-generated fictional parody/);
    assert.match(value, /Chelsea coach reacts to club result/);
  }
});
