import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  readPublicBoard,
  readPublicBoards,
  clearPublicBoardCache,
} from "../src/lib/public-board-feeds";
import {
  boardFromUrl,
  configuredBoards,
  extractPublicBoards,
  seedBoards,
  type PublicBoard,
} from "../src/lib/public-board-registry";
import { activeBoardPosting, recentPosting } from "../src/lib/job-freshness";
import { eligibility, relevant } from "../src/lib/matching";
import { discover } from "../src/lib/discovery";
const originalFetch = globalThis.fetch;
const saved = process.env.GREENHOUSE_BOARDS;
beforeEach(() => clearPublicBoardCache());
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (saved === undefined) delete process.env.GREENHOUSE_BOARDS;
  else process.env.GREENHOUSE_BOARDS = saved;
});
const board = (
  platform: PublicBoard["platform"],
  region: "eu" | "global" = "global",
): PublicBoard => ({
  platform,
  token: "fixture-company",
  company: "Fixture Company",
  region,
  careersUrl: "https://example.org/careers",
  evidenceUrl: "https://example.org/evidence",
});
test("registry contains 100+ cited real board links, never generated company slugs", () => {
  assert.ok(seedBoards.length >= 100);
  assert.ok(
    new Set(seedBoards.map((b) => b.company.toLowerCase())).size >= 100,
  );
  for (const b of seedBoards) {
    assert.ok(boardFromUrl(b.careersUrl, b.company, b.evidenceUrl));
    assert.match(b.evidenceUrl, /^https:\/\/github.com\//);
  }
  assert.equal(
    boardFromUrl("https://jobs.lever.co.evil.test/foo", "", ""),
    undefined,
  );
  assert.equal(
    boardFromUrl("https://user:secret@jobs.lever.co/foo", "", ""),
    undefined,
  );
  const text =
    '<tr><td><strong>Example Tech</strong></td><td><a href="https://jobs.ashbyhq.com/ExampleToken/id">Apply</a></td></tr>';
  const result = extractPublicBoards(text, "https://example.org/list");
  assert.equal(result[0].company, "Example Tech");
  assert.equal(result[0].token, "ExampleToken");
  assert.deepEqual(
    extractPublicBoards(
      "Company without any actual ATS link",
      "https://example.org",
    ),
    [],
  );
});
test("board variables are optional additions, validate tokens and retain Lever EU routing", () => {
  assert.deepEqual(configuredBoards("Greenhouse", ""), []);
  assert.throws(
    () => configuredBoards("Greenhouse", "https://evil.test/private"),
    /Invalid GREENHOUSE_BOARDS/,
  );
  assert.throws(
    () => configuredBoards("Ashby", "eu:wrong"),
    /Invalid ASHBY_BOARDS/,
  );
  assert.equal(configuredBoards("Lever", "eu:company,company").length, 2);
});
test("Greenhouse preserves publication dates, company attribution and full content, never updated_at", async () => {
  globalThis.fetch = async (input, init) => {
    assert.match(
      String(input),
      /^https:\/\/boards-api.greenhouse.io\/v1\/boards\/fixture-company\/jobs\?content=true$/,
    );
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "force-cache");
    return Response.json({
      jobs: [
        {
          title: "Backend Node.js Engineer",
          company_name: "Actual Employer",
          location: { name: "Remote - Nigeria" },
          content: "<p>Build TypeScript APIs</p>",
          absolute_url:
            "https://job-boards.greenhouse.io/fixture-company/jobs/1",
          updated_at: new Date().toISOString(),
        },
      ],
    });
  };
  const result = await readPublicBoard(board("Greenhouse"));
  assert.equal(result.check.status, "verified");
  assert.equal(result.jobs[0].date, "");
  assert.equal(result.jobs[0].company, "Actual Employer");
  assert.equal(result.jobs[0].description, "Build TypeScript APIs");
  assert.equal(result.jobs[0].remote, true);
});
test("Lever follows skip/limit, deduplicates job URLs, retains lists and EU host; cached reads coalesce", async () => {
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.eu.lever.co");
    const count = url.searchParams.get("skip") === "0" ? 100 : 1;
    return Response.json(
      Array.from({ length: count }, (_, i) => ({
        text: "Full Stack Developer",
        hostedUrl: `https://jobs.eu.lever.co/fixture-company/${i}`,
        descriptionPlain: "Build Node.js",
        lists: [{ text: "Requirements", content: "<p>TypeScript</p>" }],
        categories: { location: "Remote", allLocations: ["Remote", "Africa"] },
        workplaceType: "remote",
      })),
    );
  };
  const [a, b] = await Promise.all([
    readPublicBoard(board("Lever", "eu")),
    readPublicBoard(board("Lever", "eu")),
  ]);
  assert.equal(calls, 2);
  assert.equal(a.jobs.length, 100);
  assert.equal(a, b);
  assert.equal(a.jobs[0].date, "");
  assert.match(a.jobs[0].description, /TypeScript/);
});
test("Ashby removes unlisted jobs, supports secondary locations and explicit remote metadata", async () => {
  globalThis.fetch = async () =>
    Response.json({
      jobs: [
        {
          title: "React Developer",
          isListed: true,
          isRemote: true,
          workplaceType: "Remote",
          location: "Worldwide",
          secondaryLocations: [{ location: "Nigeria" }],
          jobUrl: "https://jobs.ashbyhq.com/fixture-company/1",
          publishedAt: "2026-10-20T12:00:00Z",
          descriptionPlain: "React TypeScript",
        },
        { title: "Private", isListed: false },
      ],
    });
  const result = await readPublicBoard(board("Ashby"));
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].date, "2026-10-20T12:00:00Z");
  assert.match(result.jobs[0].location, /Nigeria/);
  assert.equal(result.jobs[0].remote, true);
});
test("SmartRecruiters paginates and enriches relevant remote postings with restrictions from official fixed-host details", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.href);
    assert.equal(url.hostname, "api.smartrecruiters.com");
    if (url.pathname.endsWith("/target"))
      return Response.json({
        id: "target",
        name: "React Developer",
        company: { name: "Fixture Employer" },
        location: { remote: true, country: "ng" },
        jobAd: {
          sections: {
            jobDescription: {
              text: "<p>React TypeScript. Nigerian applicants welcome.</p>",
            },
          },
        },
        releasedDate: "2026-10-25T00:00:00Z",
      });
    const page = url.searchParams.get("offset") === "0";
    return Response.json({
      totalFound: 101,
      content: page
        ? Array.from({ length: 100 }, (_, i) => ({
            id: String(i),
            name: "Accountant",
            location: { remote: false },
          }))
        : [
            {
              id: "target",
              name: "React Developer",
              location: { remote: true },
              ref: "https://evil.example/steal",
            },
          ],
    });
  };
  const result = await readPublicBoard(board("SmartRecruiters"));
  assert.equal(requests.length, 3);
  const job = result.jobs.find((j) => j.title === "React Developer")!;
  assert.match(job.description, /Nigerian applicants/);
  assert.equal(job.location, "Nigeria");
  assert.equal(job.company, "Fixture Employer");
  assert.equal(result.check.complete, true);
});
test("later-page failure preserves verified earlier results and reports partial coverage", async () => {
  let count = 0;
  globalThis.fetch = async () =>
    ++count === 1
      ? Response.json(
          Array.from({ length: 100 }, (_, i) => ({
            text: "React Developer",
            hostedUrl: `https://jobs.lever.co/fixture/${i}`,
          })),
        )
      : new Response("untrusted upstream secret body", {
          status: 429,
          headers: { "Retry-After": "3600" },
        });
  const result = await readPublicBoard(board("Lever"));
  assert.equal(result.jobs.length, 100);
  assert.equal(result.check.complete, false);
  assert.match(result.check.error!, /429/);
  assert.ok(result.check.retryUntil! > Date.now()+3590000);
  assert.doesNotMatch(JSON.stringify(result), /secret body/);
  assert.equal(count, 2);
});
test("automatic boards report an outage rather than setup-required or successful empty results", async () => {
  globalThis.fetch = async () => new Response("do not expose", { status: 403 });
  const result = await readPublicBoards("Ashby");
  assert.equal(result.boards?.verified, 0);
  assert.ok(result.sourceError);
  assert.doesNotMatch(JSON.stringify(result), /do not expose/);
});
test("undated active postings remain distinct from fresh jobs and expire after 24h", () => {
  const now = Date.now();
  const j = { source: "Lever", lastVerifiedAt: new Date(now).toISOString() };
  assert.equal(activeBoardPosting(j, now), true);
  assert.equal(recentPosting("", now), false);
  assert.equal(activeBoardPosting(j, now + 25 * 3600000), false);
  assert.equal(
    activeBoardPosting({ ...j, source: "Unverified feed" }, now),
    false,
  );
});
test("backend/full-stack/Node.js roles are included including senior roles while mobile and unrelated exclusions remain", () => {
  for (const title of [
    "Backend Engineer",
    "Full-stack Developer",
    "Node.js Developer",
    "React Engineer",
    "Angular Developer",
  ])
    assert.equal(relevant(title), true, title);
  assert.equal(relevant("Senior Backend Engineer"), true);
  assert.equal(relevant("Mobile Engineer"), false);
  assert.equal(
    eligibility("Remote", "We hire worldwide")?.eligibility,
    "eligible",
  );
  assert.equal(
    eligibility("Remote", "A global company")?.eligibility,
    "review",
  );
  assert.equal(
    eligibility(
      "Worldwide",
      "Must reside in the United States. We hire worldwide.",
    ),
    null,
  );
  assert.equal(eligibility("Remote (US)", "We hire worldwide"), null);
});
test("discovery accepts real active board listings without inventing dates and deduplicates across providers", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.ashbyhq.com")
      return Response.json({
        organizationName: "Fixture Employer",
        jobs: [
          {
            title: "Backend Node.js Developer",
            company_name: "Fixture",
            location: "Worldwide",
            isRemote: true,
            jobUrl: "https://jobs.ashbyhq.com/fixture/role",
            descriptionPlain: "Build TypeScript APIs",
          },
        ],
      });
    return new Response("unavailable", { status: 403 });
  };
  const result = await discover();
  const jobs = result.jobs.filter((j) => j.source === "Ashby");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].postedAt, "");
  assert.ok(jobs[0].lastVerifiedAt);
  assert.equal(jobs[0].eligibility, "eligible");
});

test(
  "MongoDB retains verified active undated listings and GET restores them without labeling them fresh",
  { skip: !process.env.TEST_MONGODB_URI },
  async () => {
    const { MongoClient } = await import("mongodb");
    const { runDiscovery } = await import("../src/lib/run-discovery");
    const { closeDb } = await import("../src/lib/db");
    const { GET } = await import("../src/app/api/discover/route");
    const uri = process.env.MONGODB_URI,
      database = process.env.MONGODB_DB;
    const name = `job_hunt_public_boards_test_${process.pid}`;
    const client = new MongoClient(process.env.TEST_MONGODB_URI!);
    try {
      process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
      process.env.MONGODB_DB = name;
      globalThis.fetch = async (input) =>
        new URL(String(input)).hostname === "api.ashbyhq.com"
          ? Response.json({
              organizationName: "Stored Fixture",
              jobs: [
                {
                  title: "Full-stack Node.js Developer",
                  location: "Worldwide",
                  isRemote: true,
                  jobUrl: "https://jobs.ashbyhq.com/fixture/stored",
                  descriptionPlain: "TypeScript APIs",
                },
              ],
            })
          : new Response("Unavailable", { status: 403 });
      const result = await runDiscovery();
      assert.equal(result.persisted, true);
      assert.equal(result.jobs.length, 1);
      assert.equal(result.jobs[0].postedAt, "");
      const restored = await (await GET()).json();
      assert.equal(restored.jobs.length, 1);
      assert.equal(restored.jobs[0].postedAt, "");
      assert.ok(restored.jobs[0].lastVerifiedAt);
      assert.ok(
        await client
          .db(name)
          .collection("public_board_registry")
          .countDocuments({ status: "verified" }),
      );
    } finally {
      await client.db(name).dropDatabase();
      await client.close();
      await closeDb();
      if (uri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = uri;
      if (database === undefined) delete process.env.MONGODB_DB;
      else process.env.MONGODB_DB = database;
    }
  },
);
