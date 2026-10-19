import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";
import { db, closeDb } from "../src/lib/db";
import {
  ensureModuleIndexes,
  get,
  list,
  ownerFilter,
} from "../src/lib/modules/store";
import { normalizeIssue, persistBounty } from "../src/lib/modules/bounties";
import { deleteRecord, saveRecord } from "../src/lib/modules/records";
import {
  finishOAuth,
  scopes,
  beginOAuth,
  integrationToken,
  disconnectChannel,
  channelAnalytics,
  encryptToken,
} from "../src/lib/modules/oauth";
import {
  savedYoutube,
  saveYoutube,
  normalizeVideo,
  reserveYoutubeQuota,
} from "../src/lib/modules/youtube";
import { snapshot } from "../src/lib/modules/workspace";
import type {
  Bounty,
  ContentIdea,
  PromptVersion,
} from "../src/lib/modules/types";
const enabled = !!process.env.TEST_MONGODB_URI;
const originalFetch = globalThis.fetch;
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
process.env.MONGODB_DB = `job_hunt_modules_test_${process.pid}`;
after(async () => {
  globalThis.fetch = originalFetch;
  await closeDb();
  if (enabled) {
    const client = new MongoClient(process.env.TEST_MONGODB_URI!);
    await client.connect();
    await client.db(process.env.MONGODB_DB).dropDatabase();
    await client.close();
  }
});
const fixture = () =>
  normalizeIssue({
    html_url: "https://github.com/example/repo/issues/1",
    title: "React bug $500",
    body: "Implement a TypeScript bug fix.",
    state: "open",
    labels: [],
    assignees: [],
  });
test(
  "additive migration, owner boundaries, reward verification, payment ledger and prompt immutability",
  { skip: !enabled, timeout: 30000 },
  async () => {
    const database = await db();
    await database
      .collection("jobs")
      .insertOne({ id: "existing", title: "Original job" });
    await ensureModuleIndexes();
    await ensureModuleIndexes();
    assert.equal(
      await database.collection("jobs").countDocuments({ id: "existing" }),
      1,
    );
    await database.collection("workspace_ideas").insertOne({
      owner: "another-user",
      id: "foreign",
      title: "Private idea",
    });
    await assert.rejects(() => get("ideas", "foreign"), /not found/);
    assert.equal(
      (await list<ContentIdea>("ideas")).some((i) => i.id === "foreign"),
      false,
    );
    const bounty = fixture();
    await persistBounty(bounty, "React, TypeScript");
    await persistBounty(bounty, "React");
    assert.equal((await list("bounties")).length, 1);
    await assert.rejects(() =>
      saveRecord(
        "reward",
        {
          bountyId: bounty.id,
          amount: "500",
          currency: "USD",
          confirmed: false,
        },
        "React",
      ),
    );
    await saveRecord(
      "reward",
      {
        bountyId: bounty.id,
        amount: "500",
        currency: "USD",
        evidenceUrl: bounty.url,
        confirmed: true,
        fundingType: "escrow",
        payoutEvidenceUrl: "https://example.com/payout/123",
        conditions: "Payment on approved PR",
        eligibility: "Unverified for Nigeria",
      },
      "React",
    );
    await persistBounty(bounty, "React");
    assert.equal(
      (await get<Bounty>("bounties", bounty.id)).reward?.amount,
      "500",
    );
    await assert.rejects(
      () => saveRecord("tracked", { bountyId: bounty.id, status: "Paid" }, ""),
      /actual received/,
    );
    const payment = await saveRecord(
      "payments",
      {
        bountyId: bounty.id,
        amount: "100.00",
        currency: "USD",
        receivedAt: "2026-01-01",
        evidenceUrl: "https://example.org/receipt",
        confirmation: "owner-confirmed",
      },
      "",
    );
    await saveRecord("tracked", { bountyId: bounty.id, status: "Paid" }, "");
    await deleteRecord("payments", payment.id);
    assert.equal(
      (await get<{ status: string }>("tracked", bounty.id)).status,
      "Accepted",
    );
    await saveRecord(
      "ideas",
      {
        id: "idea",
        owner: "another-user",
        profileId: "bruno",
        title: "Original move",
        description: "Fictional sports concept",
        action: "Score a goal",
        hook: "Unexpected technique",
        audience: "Sports fans",
        format: "9:16",
        duration: "15 seconds",
        angle: "Original fictional setup",
        requirements: "Character reference",
        approved: true,
        rejected: false,
        referenceIds: [],
      },
      "",
    );
    const prompt = {
      ideaId: "idea",
      subject: "Bruno",
      action: "Scores",
      environment: "",
      lighting: "",
      camera: "",
      text: "Bruno scores",
    };
    const p1 = await saveRecord("prompts", prompt, "");
    const p2 = await saveRecord(
      "prompts",
      { ...prompt, id: p1.id, text: "Edited" },
      "",
    );
    assert.notEqual(p1.id, p2.id);
    assert.equal(
      (await get<PromptVersion>("prompts", p1.id)).text,
      "Bruno scores",
    );
    await assert.rejects(
      () =>
        saveRecord(
          "entries",
          { ideaId: "foreign", title: "Stolen", status: "Ideas" },
          "",
        ),
      /not found/,
    );
    await assert.rejects(
      () =>
        saveRecord(
          "entries",
          { ideaId: "idea", title: "Test", status: "Published" },
          "",
        ),
      /published URL/,
    );
  },
);
test(
  "YouTube public snapshots expire and quota reservations cannot exceed budget",
  { skip: !enabled, timeout: 30000 },
  async () => {
    await ensureModuleIndexes();
    const database = await db();
    const v = normalizeVideo({
      id: "abcdefghijk",
      snippet: { title: "Reference", channelId: "UC" + "x".repeat(22) },
      statistics: {},
      contentDetails: { duration: "PT20S" },
    });
    await saveYoutube("video", v);
    assert.equal((await savedYoutube("video")).length, 1);
    await database
      .collection("workspace_youtube_cache")
      .updateOne(ownerFilter({ id: v.id }), {
        $set: { expiresAt: new Date(0) },
      });
    assert.equal((await savedYoutube("video")).length, 0);
    process.env.YOUTUBE_DAILY_QUOTA_BUDGET = "100";
    await database
      .collection("workspace_ephemeral")
      .deleteMany(ownerFilter({ key: /^youtube-quota:/ }));
    const requests = await Promise.allSettled([
      reserveYoutubeQuota(100),
      reserveYoutubeQuota(100),
    ]);
    assert.equal(requests.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(requests.filter((r) => r.status === "rejected").length, 1);
    delete process.env.YOUTUBE_DAILY_QUOTA_BUDGET;
  },
);
test(
  "real OAuth path uses state and PKCE; tokens stay encrypted; analytics enforce channel ownership",
  { skip: !enabled, timeout: 30000 },
  async () => {
    const database = await db();
    await ensureModuleIndexes();
    process.env.OAUTH_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.YOUTUBE_CLIENT_ID = "test-client";
    process.env.YOUTUBE_CLIENT_SECRET = "test-secret";
    process.env.YOUTUBE_REDIRECT_URI =
      "https://example.test/api/workspace/oauth/callback";
    const channelId = "UC" + "x".repeat(22);
    const begin = await beginOAuth();
    const auth = new URL(begin.url);
    assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    assert.equal(auth.searchParams.get("scope"), scopes.join(" "));
    await assert.rejects(
      () => finishOAuth("code", begin.state, "wrong"),
      /state mismatch/,
    );
    globalThis.fetch = async (input, init) => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) {
        const body = new URLSearchParams(String(init?.body));
        assert.ok(body.get("code_verifier"));
        return Response.json({
          access_token: "test-access",
          refresh_token: "test-refresh",
          expires_in: 3600,
          scope: scopes.join(" "),
        });
      }
      if (u.includes("/channels?"))
        return Response.json({
          items: [
            {
              id: channelId,
              snippet: { title: "My channel" },
              statistics: {
                viewCount: "100",
                subscriberCount: "2",
                videoCount: "1",
              },
            },
          ],
        });
      throw new Error("Unexpected request");
    };
    await finishOAuth("code", begin.state, begin.state);
    await assert.rejects(
      () => finishOAuth("code", begin.state, begin.state),
      /already used/,
    );
    const record = await database
      .collection("workspace_oauth")
      .findOne(ownerFilter({ id: channelId }));
    assert.ok(record);
    assert.equal(record.accessToken.includes("test-access"), false);
    assert.equal(await integrationToken(channelId), "test-access");
    await assert.rejects(
      () => integrationToken("UC" + "y".repeat(22)),
      /Connect/,
    );
    const state = await snapshot();
    assert.equal(JSON.stringify(state).includes("test-access"), false);
    assert.equal(JSON.stringify(state.integrations).includes("Token"), false);
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/videos?"))
        return Response.json({
          items: [{ snippet: { channelId: "UC" + "z".repeat(22) } }],
        });
      if (url.includes("/revoke")) return new Response("", { status: 200 });
      if (url.includes("/channels?"))
        return Response.json({ items: [{ statistics: {} }] });
      return Response.json({ columnHeaders: [{ name: "views" }], rows: [] });
    };
    await assert.rejects(
      () =>
        channelAnalytics(channelId, "2026-01-01", "2026-01-02", "abcdefghijk"),
      /does not belong/,
    );
    const reports = await channelAnalytics(
      channelId,
      "2026-01-01",
      "2026-01-02",
    );
    assert.deepEqual(reports.reports.totals.data?.rows, []);
    assert.match(
      reports.reports.retention.unavailable!,
      /Choose an owned video/,
    );
    await database.collection("workspace_youtube_cache").insertOne({
      owner: "owner",
      kind: "analytics",
      id: channelId,
      expiresAt: new Date(Date.now() + 10000),
      reports,
    });
    await disconnectChannel(channelId);
    assert.equal(
      await database
        .collection("workspace_oauth")
        .countDocuments(ownerFilter()),
      0,
    );
    assert.equal(
      await database
        .collection("workspace_youtube_cache")
        .countDocuments(ownerFilter({ kind: "analytics" })),
      0,
    );
    // A partial grant is not promoted to an authorized channel integration.
    await database.collection("workspace_oauth").insertOne({
      owner: "owner",
      id: "partial",
      scope: [scopes[0]],
      accessToken: encryptToken("partial"),
      expiresAt: Date.now() + 3600000,
    });
    await assert.rejects(() => integrationToken("partial"), /Reconnect/);
    await database
      .collection("workspace_oauth")
      .insertOne({
        owner: "owner",
        id: "expired-grant",
        scope: scopes,
        purgeAt: new Date(0),
        accessToken: encryptToken("expired"),
        expiresAt: Date.now() + 3600000,
      });
    await assert.rejects(
      () => integrationToken("expired-grant"),
      /inactive YouTube connection expired/,
    );
    assert.equal(
      await database
        .collection("workspace_oauth")
        .countDocuments(ownerFilter({ id: "expired-grant" })),
      0,
    );
    globalThis.fetch = originalFetch;
  },
);
