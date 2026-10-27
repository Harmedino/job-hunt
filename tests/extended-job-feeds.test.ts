import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  additionalJobAdapters,
  normalizeExtra,
} from "../src/lib/extended-job-feeds";
import { jobPlatforms, platformEnabled } from "../src/lib/job-platforms";
import { discover } from "../src/lib/discovery";
import { GET as platformState } from "../src/app/api/platforms/route";
import { eligibility } from "../src/lib/matching";
import { clearPublicBoardCache } from "../src/lib/public-board-feeds";
const originalFetch = globalThis.fetch;
const keys = [...new Set(jobPlatforms.flatMap((p) => p.settings || []))];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeEach(() => {
  clearPublicBoardCache();
  for (const key of keys) delete process.env[key];
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
const now = new Date().toISOString();
const source = (name: string) =>
  additionalJobAdapters.find((s) => s.name === name)!;
const jobicy = (patch = {}) => ({
  jobTitle: "Frontend React Developer",
  companyName: "Public API Fixture",
  jobDescription: "React TypeScript interfaces. Fully remote.",
  jobGeo: "Worldwide",
  pubDate: now,
  url: "https://jobicy.com/jobs/test-fixture",
  jobLevel: "Mid-level",
  ...patch,
});
test("catalog provides 20+ unique search connectors, distinguishes manual sites and never exposes configured secrets", async () => {
  const names = jobPlatforms.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(jobPlatforms.filter((p) => p.access !== "manual").length > 20);
  assert.equal(
    additionalJobAdapters.length + 5,
    jobPlatforms.filter((p) => p.access !== "manual").length,
  );
  assert.equal(
    platformEnabled(
      jobPlatforms.find((p) => p.name === "LinkedIn")!,
      {},
    ),
    false,
  );
  const state = await (await platformState()).json();
  assert.equal(state.enabled, 15);
  assert.equal(state.automated, 22);
  assert.ok(state.manual >= 10);
  process.env.FINDWORK_API_KEY = "do-not-expose-this-secret";
  const configured = await (await platformState()).json();
  assert.equal(configured.enabled, 16);
  assert.doesNotMatch(JSON.stringify(configured), /do-not-expose/);
});
test("additional API normalization keeps true publication dates and explicit remote/location evidence", () => {
  const normalized = normalizeExtra("Jobicy", jobicy());
  assert.equal(normalized.date, now);
  assert.equal(normalized.location, "Worldwide");
  assert.equal(normalized.remote, true);
  const muse = normalizeExtra("The Muse", {
    name: "Frontend Engineer",
    company: { name: "Office Fixture" },
    contents: "Work on React in our office.",
    locations: [{ name: "New York" }],
    publication_date: now,
    refs: { landing_page: "https://example.org/job" },
  });
  assert.equal(muse.remote, false);
  const jooble = normalizeExtra("Jooble", {
    title: "React Engineer",
    company: "Fixture",
    updated: now,
    link: "https://example.org/job",
    snippet: "Remote React",
  });
  assert.equal(
    jooble.date,
    "",
    "An update time must not masquerade as publication",
  );
  assert.equal(
    eligibility("Anywhere in the U.S. (remote job)", "Frontend role"),
    null,
  );
});
test("Jobicy follows bounded cursors and keeps earlier pages during a later outage", async () => {
  let count = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "jobicy.com");
    count++;
    if (count === 1)
      return Response.json({ jobs: [jobicy()], nextCursor: "cursor-value" });
    assert.equal(url.searchParams.get("cursor"), "cursor-value");
    return new Response("untrusted-body", { status: 503 });
  };
  const result = await source("Jobicy").read();
  assert.equal(count, 2);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.partial, true);
});
test("one new public provider can return jobs when other providers fail; missing keys are setup states", async () => {
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.startsWith("https://jobicy.com/"))
      return Response.json({ jobs: [jobicy()] });
    return new Response("secret proxy credential marker", { status: 503 });
  };
  const result = await discover();
  assert.equal(result.sources.length, 22);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].source, "Jobicy");
  assert.equal(result.jobs[0].eligibility, "eligible");
  assert.equal(
    result.sources.filter((s) => s.status === "not_configured").length,
    7,
  );
  assert.equal(result.successfulSources.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /secret proxy/);
  assert.ok(
    requested.every(
      (url) =>
        !/findwork|adzuna|jooble|reed\.co|usajobs|web3\.career|itjobs/.test(
          url,
        ),
    ),
  );
});
test("public employer boards reject URL injection and never use an update date as publication", async () => {
  process.env.GREENHOUSE_BOARDS = "https://evil.example/private";
  globalThis.fetch = async () => {
    throw new Error("No network request allowed for invalid board");
  };
  await assert.rejects(() => source("Greenhouse").read(), /Invalid GREENHOUSE_BOARDS/);
  process.env.GREENHOUSE_BOARDS = "public-board";
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).hostname, "boards-api.greenhouse.io");
    return Response.json({
      jobs: [
        {
          title: "Frontend Engineer",
          company_name: "Fixture",
          content: "Remote React",
          location: { name: "Worldwide" },
          absolute_url: "https://example.org/job",
          updated_at: now,
          first_published: "2020-01-01T00:00:00Z",
        },
      ],
    });
  };
  const result = await source("Greenhouse").read();
  assert.equal(result.jobs[0].date, "2020-01-01T00:00:00Z");
  process.env.LEVER_BOARDS = "public-board";
  globalThis.fetch = async () =>
    Response.json([
      {
        text: "Frontend Engineer",
        descriptionPlain: "Remote React",
        categories: { location: "Worldwide" },
        hostedUrl: "https://example.org/job",
        workplaceType: "remote",
      },
    ]);
  assert.equal((await source("Lever").read()).jobs[0].date, "");
});
test("Hacker News bounds detail requests and reports all-detail failure honestly", async () => {
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests++;
    return String(input).endsWith("jobstories.json")
      ? Response.json(Array.from({ length: 100 }, (_, i) => i + 1))
      : new Response("not available", { status: 503 });
  };
  await assert.rejects(() => source("Hacker News Jobs").read(), /failed/);
  assert.equal(requests, 26);
});
test("official RSS retains source attribution and does not assume worldwide eligibility", async () => {
  globalThis.fetch = async (input) => {
    assert.match(
      String(input),
      /^https:\/\/remotefirstjobs.com\/rss\/jobs\/(react|cybersecurity)\.rss$/,
    );
    return new Response(
      `<rss><channel><item><title>Frontend Engineer at RSS Fixture</title><link>https://remotefirstjobs.com/jobs/test-fixture</link><pubDate>${now}</pubDate><description><![CDATA[React interfaces and frontend features.]]></description></item></channel></rss>`,
    );
  };
  const result = await source("Remote First Jobs").read();
  assert.equal(result.jobs.length, 2);
  assert.equal(result.jobs[0].company, "RSS Fixture");
  assert.equal(result.jobs[0].remote, true);
  assert.equal(
    eligibility(result.jobs[0].location, result.jobs[0].description)
      ?.eligibility,
    "review",
  );
  assert.match(result.jobs[0].url, /remotefirstjobs.com/);
});
test("authorized API tokens stay server-side and credential-bearing requests are never cached", async () => {
  process.env.FINDWORK_API_KEY = "private-test-token";
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /^https:\/\/findwork.dev\/api\/jobs\//);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Token private-test-token",
    );
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    return Response.json({
      results: [
        {
          role: "React Developer",
          company_name: "Fixture",
          remote: true,
          location: "Worldwide",
          date_posted: now,
          text: "React",
          url: "https://findwork.dev/jobs/test-fixture",
        },
      ],
    });
  };
  const result = await source("Findwork").read();
  assert.equal(result.jobs.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-test-token/);
});
