import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { startProduction } from "./server.mjs";
if (!process.env.TEST_MONGODB_URI)
  throw new Error("Set TEST_MONGODB_URI for the production Trend Radar test.");
const name = "radar_production_" + randomUUID().replaceAll("-", "");
const client = await new MongoClient(process.env.TEST_MONGODB_URI).connect();
const database = client.db(name);
const password = randomBytes(32).toString("base64url");
await database
  .collection("applications")
  .insertOne({ id: "existing-fixture", status: "Saved" });
await database
  .collection("trend_radar_refresh")
  .insertOne({
    owner: "owner",
    key: "news",
    checkedAt: new Date().toISOString(),
    failures: [],
  });
const server = await startProduction({
  APP_PASSWORD: password,
  MONGODB_URI: process.env.TEST_MONGODB_URI,
  MONGODB_DB: name,
  API_FOOTBALL_KEY: "",
  APISPORTS_KEY: "",
  X_BEARER_TOKEN: "",
  YOUTUBE_API_KEY: "",
  TREND_RADAR_IMAGE_PROVIDER: "gemini",
  TREND_RADAR_IMAGE_MODEL: "gemini-3.1-flash-image",
});
try {
  for (const path of [
    "/api/trend-radar",
    "/api/trend-radar?scope=templates",
    "/api/trend-radar/image",
  ]) {
    assert.equal((await fetch(server.url + path)).status, 401);
    assert.equal(
      (await fetch(server.url + path, { method: "POST", body: "{}" })).status,
      401,
    );
  }
  const login = await fetch(server.url + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: server.url },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .find((v) => v.startsWith("launchpad_session="))
    .split(";")[0];
  const headers = {
    Cookie: cookie,
    Origin: server.url,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(server.url + "/api/trend-radar", {
        method: "POST",
        headers: { ...headers, Origin: "https://attacker.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  const config = await (
    await fetch(server.url + "/api/trend-radar/image", { headers })
  ).json();
  assert.equal(config.configured, false);
  const unavailable = await fetch(server.url + "/api/trend-radar/image", {
    method: "POST",
    headers,
    body: JSON.stringify({
      imageTag: "@Image1",
      prompt:
        "One fictional coach, full body, head to toe with footwear visible, photo portrait in a plain training room.",
    }),
  });
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /key.*missing/i);
  const post = (body) =>
    fetch(server.url + "/api/trend-radar", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const story = {
    id: "manual:production-fixture",
    title: "Production fixture only",
    summary: "Not a discovered story",
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
    people: [],
    score: 0,
    why: "",
  };
  const response = await post({
    action: "save",
    story,
    assignments: [
      {
        characterId: "stable-A",
        role: "main performer",
        identity: "Original fictional person",
        imageTag: "@Image1",
        imageFilename: "",
      },
    ],
    environmentTag: "@Image2",
    notes: "Preserve me",
    roleTimeline: [
      {
        characterId: "stable-A",
        start: 0,
        end: 1,
        position: "left then right",
        action: "crosses while retaining identity",
      },
    ],
  });
  assert.equal(response.status, 200);
  const saved = await response.json();
  const updated = await post({ action: "save", id: saved.id, notes: "" });
  assert.equal(updated.status, 200);
  const current = await updated.json();
  assert.equal(current.notes, "");
  assert.equal(current.environmentTag, "@Image2");
  assert.equal(current.roleTimeline[0].characterId, "stable-A");
  const dashboard = await (
    await fetch(server.url + "/api/trend-radar", { headers })
  ).json();
  assert.ok(dashboard.projects.some((p) => p.id === saved.id));
  assert.equal(
    (
      await post({
        action: "save",
        story: {
          ...story,
          sources: [
            {
              publisher: "Fixture",
              url: "javascript:alert(1)",
              publishedAt: "",
            },
          ],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post({
        action: "save",
        id: saved.id,
        clip: {
          source: "YouTube",
          id: "ABCDEFGHIJK",
          url: "https://www.youtube.com/watch?v=ABCDEFGHIJK",
          duration: "PT60S",
          seconds: 10,
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await post({ action: "save", notes: "a".repeat(150000) })).status,
    413,
  );
  assert.equal(
    await database
      .collection("applications")
      .countDocuments({ id: "existing-fixture" }),
    1,
  );
  console.log(
    "Production Trend Radar: authentication, origin protection, honest missing image provider, bounded bodies, validated video metadata and isolated project persistence passed.",
  );
} finally {
  await server.stop();
  await database.dropDatabase();
  await client.close();
}
