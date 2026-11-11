import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { db, closeDb } from "../src/lib/db";
import {
  saveRadarProject,
  manualStory,
  radarDashboard,
  hideStory,
} from "../src/lib/trend-radar/server";
import { generateRadarImage } from "../src/lib/trend-radar/image-service";
import type { RadarStory } from "../src/lib/trend-radar/core";
test("Trend Radar API surfaces remain protected by existing authentication", () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      APP_PASSWORD: "fixture-password",
    });
    for (const path of ["/api/trend-radar", "/api/trend-radar/image"]) {
      assert.equal(
        proxy(new NextRequest("https://launchpad.example" + path)).status,
        401,
      );
      assert.equal(
        proxy(
          new NextRequest("https://launchpad.example" + path, {
            method: "POST",
          }),
        ).status,
        401,
      );
    }
  } finally {
    process.env = previous;
  }
});
test(
  "project persistence preserves unrelated records; real provider request contracts fail safely",
  { skip: !process.env.TEST_MONGODB_URI },
  async () => {
    const env = { ...process.env };
    const originalFetch = global.fetch;
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = "radar_test_" + randomUUID().replaceAll("-", "");
    process.env.TREND_RADAR_IMAGE_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "fixture-key";
    process.env.TREND_RADAR_IMAGE_MODEL = "gemini-2.5-flash-image";
    try {
      const database = await db();
      await database
        .collection("applications")
        .insertOne({ id: "untouched", name: "Existing application fixture" });
      const story: RadarStory = {
        id: "manual:fixture",
        title: "Fixture only",
        summary: "",
        category: "Football",
        sources: [
          {
            publisher: "Fixture",
            url: "https://example.com/story",
            publishedAt: "",
          },
        ],
        publishedAt: "",
        checkedAt: "",
        score: 0,
        why: "",
        people: [],
      };
      const manual = await manualStory({
        title: "Manual X fixture",
        url: "https://x.com/example/status/1234567890123456789",
        category: "Football",
      });
      const again = await manualStory({
        title: "Manual X fixture",
        url: "https://x.com/example/status/1234567890123456789",
        category: "Football",
      });
      assert.equal(manual.id, again.id);
      assert.match(manual.summary, /not independently/);
      const assignments = [
        {
          characterId: "stable-A",
          role: "main dancer",
          identity: "Fictional coach",
          imageTag: "@Image1",
          imageFilename: "",
        },
      ];
      const saved = await saveRadarProject({
        story,
        assignments,
        environmentTag: "@Image2",
        notes: "Preserve this",
        sceneDescription: "group dance",
        roleTimeline: [
          {
            characterId: "stable-A",
            start: 0,
            end: 3,
            position: "left",
            action: "crosses right",
          },
        ],
      });
      const changed = await saveRadarProject({
        id: saved.id,
        notes: "",
        approvedImages: [],
      });
      assert.equal(changed.environmentTag, "@Image2");
      assert.equal(changed.notes, "");
      assert.equal(changed.roleTimeline?.[0].characterId, "stable-A");
      assert.equal(changed.sceneDescription, "group dance");
      assert.equal(
        await database
          .collection("applications")
          .countDocuments({ id: "untouched" }),
        1,
      );
      await assert.rejects(
        saveRadarProject({
          story: {
            ...story,
            sources: [
              {
                publisher: "Bad",
                url: "http://127.0.0.1/secret",
                publishedAt: "",
              },
            ],
          },
        }),
        /HTTPS/,
      );
      await assert.rejects(
        saveRadarProject({
          id: saved.id,
          roleTimeline: [
            {
              characterId: "unknown",
              start: 0,
              end: 2,
              position: "",
              action: "",
            },
          ],
        }),
        /stable performer/,
      );
      let article = "https://www.bbc.com/sport/football/fixture-a";
      global.fetch = async (url) =>
        String(url).includes("feeds.bbci.co.uk/sport/football")
          ? new Response(
              `<rss><channel><item><title>Example football manager responds after surprising league defeat</title><link>${article}</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
            )
          : new Response("Unavailable fixture feed", { status: 503 });
      const first = await radarDashboard(24, true);
      const reported = first.stories.find((s) =>
        s.title.startsWith("Example football"),
      )!;
      assert.ok(reported);
      await hideStory(reported.id);
      await database
        .collection("workspace_ephemeral")
        .updateOne(
          { key: "trend-radar-refresh" },
          { $set: { expiresAt: new Date(0) } },
        );
      article = "https://www.bbc.com/sport/football/fixture-b";
      await radarDashboard(24, true);
      const stored = await database
        .collection("trend_radar_stories")
        .findOne({ id: reported.id });
      assert.equal(stored?.hidden, true);
      assert.equal(stored?.sources.length, 2);
      assert.equal(
        await database.collection("trend_radar_notifications").countDocuments(),
        1,
      );
      const png = await readFile(
        new URL("./fixtures/radar/character-fixture.png", import.meta.url),
      );
      let requestBody: Record<string, unknown> = {};
      global.fetch = async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: png.toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        });
      };
      const output = await generateRadarImage({
        prompt:
          "Detailed full body portrait of one fictional football coach wearing a tracksuit, head to toe with shoes visible.",
        imageTag: "@Image1",
        reference: { mime: "image/png", base64: png.toString("base64") },
      });
      assert.equal(output.mime, "image/png");
      assert.equal(output.bytes, png.length);
      assert.equal(
        (
          requestBody.generationConfig as {
            imageConfig: { imageSize?: string };
          }
        ).imageConfig.imageSize,
        undefined,
      );
      const contents = requestBody.contents as {
        parts: Record<string, unknown>[];
      }[];
      assert.ok(contents[0].parts.some((p) => !!p.inlineData));
      global.fetch = async () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: "Only text" }] } }],
        });
      await assert.rejects(
        generateRadarImage({
          prompt:
            "Detailed full body portrait of one fictional football coach wearing a tracksuit, head to toe with shoes visible.",
          imageTag: "@Image1",
        }),
        /no image/,
      );
      global.fetch = async () => new Response("quota", { status: 429 });
      await assert.rejects(
        generateRadarImage({
          prompt:
            "Detailed full body portrait of one fictional football coach wearing a tracksuit, head to toe with shoes visible.",
          imageTag: "@Image1",
        }),
        /quota/,
      );
      process.env.TREND_RADAR_IMAGE_PROVIDER = "openai";
      process.env.TREND_RADAR_IMAGE_MODEL = "gpt-image-1.5";
      process.env.OPENAI_API_KEY = "fixture-key";
      global.fetch = async (_url, init) => {
        assert.ok(init?.body instanceof FormData);
        assert.ok((init.body as FormData).get("image") instanceof Blob);
        return Response.json({ data: [{ b64_json: png.toString("base64") }] });
      };
      await generateRadarImage({
        prompt:
          "Detailed full body portrait of one fictional football coach wearing a tracksuit, head to toe with shoes visible.",
        imageTag: "@Image1",
        reference: { mime: "image/png", base64: png.toString("base64") },
      });
    } finally {
      global.fetch = originalFetch;
      await (await db()).dropDatabase();
      await closeDb();
      process.env = env;
    }
  },
);
