import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyHumiliation,
  playerEvidence,
  scoringForOpportunity,
} from "../src/lib/trend-radar/football-core";
import {
  characterPrompt,
  validateImageTagApprovals,
} from "../src/lib/trend-radar/image-policy";
import { classifyVideoBatch } from "../src/lib/trend-radar/clip-search";
import type { YoutubeVideo } from "../src/lib/modules/types";
const fixture = (score: [number, number], status = "FT") => ({
  fixture: { id: 777, date: "2026-11-10T14:00:00Z", status: { short: status } },
  league: { name: "League" },
  teams: {
    home: { id: 10, name: "Home FC" },
    away: { id: 20, name: "Away FC" },
  },
  goals: { home: score[0], away: score[1] },
});
test("finished heavy defeats only; identify losing side and avoid implying individual blame", () => {
  const homeLoss = classifyHumiliation(
    fixture([0, 4]),
    Date.parse("2026-11-11T00:00:00Z"),
  );
  assert.equal(homeLoss?.loser.id, 10);
  assert.equal(homeLoss?.margin, 4);
  assert.match(
    homeLoss?.reason || "",
    /does NOT show individual poor performances/,
  );
  assert.equal(classifyHumiliation(fixture([2, 3])), null);
  assert.equal(classifyHumiliation(fixture([0, 5], "2H")), null);
  assert.equal(classifyHumiliation(fixture([4, 1]))?.loser.id, 20);
});
test("only actual participants qualify, and strong players are not called poor performers", () => {
  const rows = [
    {
      team: { id: 10, name: "Home FC" },
      players: [
        {
          player: { id: 1, name: "Good player" },
          statistics: [
            { games: { minutes: 90, rating: "8.5", substitute: false } },
          ],
        },
        {
          player: { id: 2, name: "Low rated" },
          statistics: [
            { games: { minutes: 75, rating: "5.7", substitute: false } },
          ],
        },
        {
          player: { id: 3, name: "Unused" },
          statistics: [
            { games: { minutes: 0, rating: null, substitute: true } },
          ],
        },
      ],
    },
  ];
  const result = playerEvidence(rows, 10);
  assert.equal(result.length, 2);
  assert.equal(result.find((p) => p.id === 1)?.qualifies, false);
  assert.equal(result.find((p) => p.id === 2)?.qualifies, true);
  assert.equal(
    result.some((p) => p.id === 3),
    false,
  );
});
test("clips are rejected by exact duration with transparent accounting", () => {
  const make = (id: string, duration: string) =>
    ({
      id,
      duration,
      title: id,
      url: "https://www.youtube.com/watch?v=" + id,
      channelId: "",
      channelTitle: "",
      publishedAt: "2026-11-11T10:00:00Z",
      thumbnail: "",
      description: "",
      fetchedAt: "",
      expiresAt: "",
    }) as YoutubeVideo;
  const rows = [
    make("abcdefghijk", "PT12S"),
    make("bcdefghijkl", "PT16S"),
    make("cdefghijklm", "unknown"),
    make("abcdefghijk", "PT12S"),
  ];
  const result = classifyVideoBatch(rows);
  assert.equal(result.clips.length, 1);
  assert.equal(result.rejectedByDuration, 1);
  assert.equal(result.rejectedMissingMetadata, 1);
  assert.equal(result.rejectedDuplicates, 1);
});
test("scene-matched prompts demand one complete reference, not a group collage", () => {
  const prompt = characterPrompt({
    assignment: {
      characterId: "p1",
      role: "original dancer A",
      imageTag: "@Image1",
      imageFilename: "",
      identity: "An original fictional football coach",
      outfit: "navy tracksuit, white trainers",
    },
    story: { title: "Match result", category: "Football" },
    scene: "Three football players dancing in a room with bright lights",
    style: "Photorealistic",
  });
  assert.match(prompt, /SINGLE separate/);
  assert.match(prompt, /BOTH FEET/);
  assert.match(prompt, /navy tracksuit/);
  assert.match(prompt, /9:16/);
  assert.deepEqual(
    validateImageTagApprovals(
      [
        {
          characterId: "p1",
          role: "dancer",
          imageTag: "@Image1",
          imageFilename: "",
        },
      ],
      [],
      [],
    ),
    ["Image not approved for dancer (@Image1)."],
  );
});
test("an opportunity with an approved template ranks above source-only gossip", () => {
  const a = scoringForOpportunity({
    storyFreshness: 20,
    verifiedMatch: true,
    clipVerified: true,
    rightsApproved: true,
    eligibleCast: 3,
  });
  const b = scoringForOpportunity({
    storyFreshness: 20,
    verifiedMatch: false,
    clipVerified: false,
    rightsApproved: false,
    eligibleCast: 0,
  });
  assert.ok(a.score > b.score);
  assert.equal(a.score, 90);
});

test("malformed scorelines and unknown lineup roles never become verified evidence", () => {
  assert.equal(
    classifyHumiliation({ ...fixture([0, 4]), goals: { home: null, away: 4 } }),
    null,
  );
  assert.equal(classifyHumiliation(fixture([-1, 4])), null);
  const participants = playerEvidence(
    [
      {
        team: { id: 10, name: "Home FC" },
        players: [
          {
            player: { id: 3, name: "Participant" },
            statistics: [{ games: { minutes: 20, rating: "invalid" } }],
          },
        ],
      },
    ],
    10,
  );
  assert.equal(participants[0].started, null);
  assert.equal(participants[0].rating, null);
  assert.equal(participants[0].qualifies, false);
});
