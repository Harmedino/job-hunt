import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import {
  normalizeIssue,
  analyzeBounty,
  deduplicateBounties,
} from "../src/lib/modules/bounties";
import {
  bountyEarnings,
  currencyTotals,
  filterBounties,
} from "../src/lib/modules/bounties-client";
import {
  money,
  githubIssue,
  httpsUrl,
  videoId,
} from "../src/lib/modules/validation";
import { normalizeVideo } from "../src/lib/modules/youtube";
import {
  decryptToken,
  encryptToken,
  validOAuthState,
} from "../src/lib/modules/oauth";
import { validateTransition } from "../src/lib/modules/records";
import { ownerFilter } from "../src/lib/modules/store";
import { validateIdea, validateTaskPlan } from "../src/lib/modules/creative";
import { providerJson } from "../src/lib/modules/http";
import { proxy } from "../src/proxy";
import { createSession, SESSION_COOKIE } from "../src/lib/auth";
import type { Bounty, Payment, TrackedBounty } from "../src/lib/modules/types";
import { taskAnalysis } from "../src/lib/modules/task-analysis";
import { AiError } from "../src/lib/ai";
const initialFetch = globalThis.fetch;
const encryption = process.env.OAUTH_ENCRYPTION_KEY;
const password = process.env.APP_PASSWORD;
const nodeEnv = process.env.NODE_ENV;
afterEach(() => {
  globalThis.fetch = initialFetch;
  for (const [key, value] of [
    ["OAUTH_ENCRYPTION_KEY", encryption],
    ["APP_PASSWORD", password],
    ["NODE_ENV", nodeEnv],
  ]) {
    if (value === undefined) Reflect.deleteProperty(process.env, key!);
    else Reflect.set(process.env, key!, value);
  }
});
export function issue(overrides = {}) {
  return {
    html_url: "https://github.com/example/project/issues/12",
    title: "React layout bug — $100 offered",
    body: "TypeScript frontend styling bug. Reward mentioned but no evidence of deposited funds.",
    state: "open",
    labels: [{ name: "bounty" }, { name: "good first issue" }],
    assignees: [],
    comments: 3,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-19T00:00:00Z",
    ...overrides,
  };
}
test("task analysis remains available when Gemini cannot be reached without inventing an AI plan", async () => {
  const bounty = normalizeIssue(issue());
  const analysis = await taskAnalysis(bounty, "React", true, async () => {
    throw new AiError("Google Gemini could not be reached.", 504);
  });
  assert.equal(analysis.score, analyzeBounty(bounty, "React").score);
  assert.equal(analysis.ai, undefined);
  assert.match(analysis.aiWarning!, /could not be reached.*Basic task analysis/);
  await assert.rejects(taskAnalysis(bounty, "React", true, async () => {
    throw new Error("Unexpected storage failure");
  }), /Unexpected storage failure/);
});
test("bounty normalization keeps money mentions unverified and source evidence distinct", () => {
  const b = normalizeIssue(issue(), {
    language: "TypeScript",
    pushed_at: new Date().toISOString(),
  });
  assert.equal(b.reward, undefined);
  assert.equal(b.rewardMention, "$100");
  assert.equal(b.status, "open");
  assert.equal(b.language, "TypeScript");
  assert.equal(b.difficulty, "easy");
  assert.match(analyzeBounty(b, "React, TypeScript").paymentRisk, /HIGH/);
  assert.equal(
    analyzeBounty(b, "React, TypeScript").criteria.find(
      (c) => c.label === "Payment evidence",
    )?.points,
    0,
  );
  assert.equal(
    normalizeIssue(issue({ assignees: [{ login: "contributor" }] })).status,
    "claimed",
  );
  assert.equal(normalizeIssue(issue({ state: "closed" })).status, "completed");
  assert.throws(
    () => normalizeIssue(issue({ pull_request: {} })),
    /Pull requests/,
  );
});
test("canonical IDs deduplicate GitHub imports and reward filtering never mixes currencies", () => {
  const a = normalizeIssue(issue());
  const b: Bounty = {
    ...a,
    reward: {
      ...money("100.00", "USD"),
      verification: "user-verified",
      evidenceUrl: a.url,
      fundingType: "escrow",
      payoutEvidenceUrl: "https://example.com/payout/123",
      conditions: "On approved submission",
      eligibility: "Unknown",
      verifiedAt: new Date().toISOString(),
    },
  };
  const c: Bounty = {
    ...b,
    id: "github:example:13",
    language: "PHP",
    reward: { ...b.reward!, amount: "9000", currency: "NGN" },
  };
  assert.equal(deduplicateBounties([a, b]).length, 1);
  assert.deepEqual(filterBounties([a, b], {}).map((v) => v.reward?.amount), ["100.00"]);
  assert.equal(filterBounties([a], { includeUnverified: true }).length, 1);
  for (const reward of [
    { ...b.reward!, evidenceUrl: "" },
    { ...b.reward!, amount: "0" },
    { ...b.reward!, conditions: "" },
    { ...b.reward!, fundingType: undefined },
    { ...b.reward!, payoutEvidenceUrl: "" },
  ]) {
    assert.equal(filterBounties([{ ...b, reward }], {}).length, 0);
  }
  assert.equal(filterBounties([a, b, c], { min: 50 }).length, 0);
  assert.deepEqual(
    filterBounties([a, b, c], {
      currency: "USD",
      min: 50,
      max: 150,
      language: "Unknown",
    }).map((v) => v.id),
    [b.id],
  );
  assert.deepEqual(
    filterBounties([b, c], {
      language: "PHP",
      source: "GitHub",
      repository: "example",
      skill: "React",
      sort: "match",
    }).map((v) => v.id),
    [c.id],
  );
});
test("money uses currency precision and exact totals; actual earnings need actual receipts", () => {
  assert.deepEqual(
    currencyTotals([
      money("0.10", "USD"),
      money("0.20", "USD"),
      money("100", "JPY"),
      money("1.123", "KWD"),
    ]),
    { USD: "0.30", JPY: "100", KWD: "1.123" },
  );
  for (const [a, c] of [
    ["-1", "USD"],
    ["1.1", "JPY"],
    ["1", "ABC"],
    ["1e6", "USD"],
    ["NaN", "NGN"],
  ])
    assert.throws(() => money(a, c));
  const result = bountyEarnings(
    [normalizeIssue(issue())],
    [{ status: "Accepted" } as TrackedBounty],
    [],
  );
  assert.deepEqual(result.received, {});
  assert.equal(result.accepted, 1);
  const received = bountyEarnings(
    [],
    [],
    [{ amount: "2.10", currency: "USD" } as Payment],
  );
  assert.deepEqual(received.received, { USD: "2.10" });
});
test("work status changes cannot pretend unpaid work is Paid; closed tasks must reopen", () => {
  assert.throws(
    () => validateTransition("Accepted", "Paid", false),
    /actual received payment/,
  );
  assert.doesNotThrow(() => validateTransition("Accepted", "Paid", true));
  assert.throws(() => validateTransition("Closed", "Working", false), /Reopen/);
  assert.doesNotThrow(() => validateTransition("Closed", "Saved", false));
  assert.throws(() => validateTransition("Saved", "Invented", false));
});
test("manual URLs cannot target arbitrary servers and YouTube IDs are validated", () => {
  assert.equal(
    githubIssue("https://github.com/example/project/issues/12?x=y").url,
    "https://github.com/example/project/issues/12",
  );
  for (const url of [
    "http://github.com/example/project/issues/12",
    "https://github.com.evil.test/example/project/issues/12",
    "https://user:pass@github.com/example/project/issues/12",
    "https://github.com/example/project/pull/12",
  ])
    assert.throws(() => githubIssue(url));
  assert.throws(() =>
    httpsUrl("https://127.0.0.1/private", true, ["github.com"]),
  );
  assert.equal(videoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(
    videoId("https://www.youtube.com/shorts/abcdefghijk"),
    "abcdefghijk",
  );
  assert.throws(() =>
    videoId("https://youtube.com.evil.test/watch?v=abcdefghijk"),
  );
});
test("YouTube normalization preserves unavailable statistics and does not invent Shorts classification", () => {
  const v = normalizeVideo({
    id: "abcdefghijk",
    snippet: {
      title: "Test",
      channelId: "UC" + "x".repeat(22),
      publishedAt: "2026-10-19",
      thumbnails: {
        medium: { url: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg" },
      },
    },
    statistics: { viewCount: "0" },
    contentDetails: { duration: "PT30S" },
  });
  assert.equal(v.views, "0");
  assert.equal(v.likes, undefined);
  assert.equal(v.comments, undefined);
  assert.equal("isShort" in v, false);
  assert.ok(
    Date.parse(v.expiresAt) - Date.parse(v.fetchedAt) <= 29 * 86400000 + 50,
  );
});
test("OAuth encryption is authenticated, randomized and rejects tampering or another key", () => {
  process.env.OAUTH_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const a = encryptToken("secret-token");
  const b = encryptToken("secret-token");
  assert.notEqual(a, b);
  assert.equal(decryptToken(a), "secret-token");
  assert.equal(a.includes("secret-token"), false);
  assert.throws(() => decryptToken(a + "x"));
  process.env.OAUTH_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptToken(a));
  const state = randomBytes(32).toString("base64url");
  assert.equal(validOAuthState(state, state), true);
  assert.equal(validOAuthState(state, "bad"), false);
});
test("module APIs share existing session authorization, deny cross-origin writes, and force server owner", () => {
  assert.deepEqual(ownerFilter({ owner: "attacker", id: "x" }), {
    owner: "owner",
    id: "x",
  });
  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.APP_PASSWORD = "test-password";
  for (const path of [
    "/api/workspace/state",
    "/api/workspace/oauth/start",
    "/api/workspace/oauth/callback",
    "/api/workspace/youtube/analytics",
  ])
    assert.equal(
      proxy(new NextRequest(`https://example.test${path}`)).status,
      401,
    );
  const cookie = `${SESSION_COOKIE}=${createSession("test-password")}`;
  assert.equal(
    proxy(
      new NextRequest("https://example.test/api/workspace/records/ideas", {
        method: "POST",
        headers: { cookie, Origin: "https://evil.test" },
      }),
    ).status,
    403,
  );
  assert.equal(
    proxy(
      new NextRequest("https://example.test/api/workspace/state", {
        headers: { cookie },
      }),
    ).headers.get("x-middleware-next"),
    "1",
  );
});
test("provider failures retry only bounded transient failures and preserve rate-limit reset", async () => {
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return new Response("", {
      status: count < 2 ? 503 : 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  await assert.rejects(
    () => providerJson("https://api.github.com/test"),
    /unreadable/,
  );
  assert.equal(count, 2);
  globalThis.fetch = async () =>
    new Response("", { status: 429, headers: { "Retry-After": "120" } });
  await assert.rejects(
    () => providerJson("https://api.github.com/test"),
    (e) =>
      !!e &&
      typeof e === "object" &&
      "status" in e &&
      e.status === 429 &&
      "retryAt" in e &&
      Date.parse(String(e.retryAt)) > Date.now(),
  );
});
test("AI schemas reject malformed plans and ideas rather than saving incomplete output", () => {
  assert.throws(() => validateTaskPlan({ explanation: "test" }));
  assert.throws(() => validateIdea({ title: "test" }));
  const plan = {
    explanation: "Metadata only",
    requirements: ["React"],
    codeAreas: ["Possible UI component, not inspected"],
    challenges: [],
    plan: ["Review issue", "Implement"],
    tests: ["Regression test"],
    effort: "Uncertain 2–8 hours",
    effortHoursLow: 2,
    effortHoursHigh: 8,
    rewardValue: "Unavailable: funding unverified",
    submission: "Review CONTRIBUTING; user submits",
    uncertainty: "No code or payout verification",
  };
  assert.equal(validateTaskPlan(plan).effortHoursHigh, 8);
  assert.throws(() => validateTaskPlan({ ...plan, effortHoursHigh: 1 }));
});
