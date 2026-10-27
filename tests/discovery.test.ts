import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { jobPlatforms } from "../src/lib/job-platforms";
import { discover } from "../src/lib/discovery";
import { runDiscovery } from "../src/lib/run-discovery";
import { closeDb } from "../src/lib/db";
const originalFetch = globalThis.fetch;
const originalUri = process.env.MONGODB_URI;
afterEach(async () => {
  globalThis.fetch = originalFetch;
  await closeDb();
  if (originalUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = originalUri;
});
const now = new Date().toISOString();
const unix = Math.floor(Date.now() / 1000);
function fixtureFetch(): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("weworkremotely"))
      return new Response(
        `<rss><channel><item><title>RSS Fixture: Frontend Developer</title><region>Anywhere in the World</region><pubDate>${now}</pubDate><link>https://weworkremotely.com/remote-jobs/test-rss-fixture</link><description><![CDATA[React interfaces. Fully remote.]]></description></item></channel></rss>`,
      );
    if (url.includes("remotive.com"))
      return Response.json({
        jobs: [
          {
            title: "React Developer",
            company_name: "Eligible Fixture",
            candidate_required_location: "Worldwide",
            publication_date: now,
            url: "https://remotive.com/remote-jobs/test-fixture",
            description: "React interfaces.",
          },
          {
            title: "Senior React Developer",
            company_name: "Senior Fixture",
            candidate_required_location: "Worldwide",
            publication_date: now,
            url: "https://remotive.com/remote-jobs/senior-fixture",
          },
          {
            title: "React Developer",
            company_name: "Office Fixture",
            candidate_required_location: "Worldwide",
            publication_date: now,
            url: "https://remotive.com/remote-jobs/office-fixture",
            description:
              "Work From Home (WFH) option available one day per week.",
          },
          {
            title: "React Developer",
            company_name: "Restricted Fixture",
            candidate_required_location: "Worldwide",
            publication_date: now,
            url: "https://remotive.com/remote-jobs/restricted-fixture",
            description: "US only",
          },
        ],
      });
    if (url.includes("arbeitnow"))
      return Response.json({
        data: [
          {
            title: "Frontend Engineer",
            company_name: "Review Fixture",
            location: "Remote",
            remote: true,
            created_at: unix,
            url: "https://www.arbeitnow.com/jobs/test-fixture",
            description: "React",
          },
          {
            title: "Frontend Engineer",
            company_name: "Not Remote Fixture",
            location: "Remote",
            remote: false,
            created_at: unix,
            url: "https://www.arbeitnow.com/jobs/not-remote-fixture",
          },
        ],
      });
    if (url.includes("remoteok.com"))
      return Response.json([
        { legal: "API metadata" },
        {
          position: "Software Engineer",
          company: "Generic Title Fixture",
          location: "Worldwide",
          date: now,
          url: "https://remoteok.com/remote-jobs/generic-title-fixture",
          description: "Build frontend features with React and TypeScript.",
        },
      ]);
    assert.match(url, /himalayas.app\/jobs\/api\/search\?/);
    const params = new URL(url).searchParams;
    assert.equal(params.get("country"), "NG");
    assert.equal(params.get("timezone"), "1");
    assert.equal(params.get("sort"), "recent");
    assert.equal(params.has("seniority"), false);
    if (params.get("q") !== "frontend" || params.get("page") !== "1")
      return Response.json({ jobs: [] });
    const base = {
      title: "Frontend Developer",
      description: "React",
      locationRestrictions: [],
      timezoneRestrictions: [0, 1, 2],
      pubDate: unix,
      expiryDate: unix + 86400,
      applicationLink: "https://himalayas.app/companies/test/jobs/fixture",
    };
    return Response.json({
      jobs: [
        { ...base, companyName: "Worldwide Himalayas Fixture" },
        {
          ...base,
          companyName: "Timezone Restricted Fixture",
          timezoneRestrictions: [-5, -8],
        },
        {
          ...base,
          companyName: "Country Restricted Fixture",
          locationRestrictions: ["United States"],
        },
        { ...base, companyName: "Expired Fixture", expiryDate: unix - 100 },
        {
          ...base,
          companyName: "Timezone Unknown Fixture",
          timezoneRestrictions: undefined,
        },
        { ...base, companyName: "Senior Only Fixture", seniority: ["Senior"] },
        {
          ...base,
          companyName: "Volunteer Fixture",
          employmentType: "Volunteer",
        },
        {
          ...base,
          companyName: "EU Title Fixture",
          title: "Frontend Developer - Remote from EU",
        },
      ],
    });
  };
}
test("real adapter shapes preserve sources, applicant restrictions, publication dates and review candidates", async () => {
  globalThis.fetch = fixtureFetch();
  const result = await discover();
  assert.equal(result.successfulSources.length, 5);
  assert.equal(result.jobs.length, 8);
  assert.equal(
    result.jobs.filter((j) => j.eligibility === "eligible").length,
    6,
  );
  assert.equal(
    result.jobs.find((j) => j.company === "Timezone Unknown Fixture")
      ?.eligibility,
    "review",
  );
  assert.equal(
    result.jobs.find((j) => j.source === "We Work Remotely")?.title,
    "Frontend Developer",
  );
  const remotive = result.sources.find((s) => s.source === "Remotive")!;
  assert.deepEqual(remotive.excluded, {
    role: 0,
    remote: 1,
    invalid: 0,
    age: 0,
    location: 1,
    duplicate: 0,
  });
  const himalayas = result.sources.find((s) => s.source === "Himalayas")!;
  assert.equal(himalayas.excluded.location, 3);
  assert.equal(himalayas.excluded.role, 1);
  assert.equal(himalayas.excluded.age, 1);
  assert.equal(himalayas.status, "partial");
});
test("an unavailable source is distinct from a successful search with no matches and leaks no raw response", async () => {
  globalThis.fetch = async () =>
    new Response("private upstream response", { status: 429 });
  const result = await discover();
  assert.equal(result.jobs.length, 0);
  assert.equal(result.successfulSources.length, 0);
  assert.ok(
    result.sources.every(
      (s) => s.status === "error" || s.status === "not_configured",
    ),
  );
  assert.equal(
    result.sources.filter((s) => s.status === "error").length,
    jobPlatforms.filter((p) => p.access === "public" || p.access === "employer-boards").length,
  );
  assert.doesNotMatch(JSON.stringify(result), /private upstream/);
});
test("MongoDB failure does not discard real live search results", async () => {
  process.env.MONGODB_URI = "not-a-valid-mongodb-uri";
  globalThis.fetch = fixtureFetch();
  const result = await runDiscovery();
  assert.equal(result.persisted, false);
  assert.equal(result.jobs.length, 8);
  assert.match(result.storageWarning!, /could not be saved/);
});

test("search follows short pages, adds role variants, bounds concurrency and keeps earlier pages after failure", async () => {
  const fixture = fixtureFetch();
  const queries = new Set<string>();
  let active = 0,
    peak = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (!url.hostname.includes("himalayas")) return fixture(input, init);
    const q = url.searchParams.get("q")!;
    queries.add(q);
    const page = Number(url.searchParams.get("page"));
    assert.ok(page >= 1 && page <= 3);
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    if (q !== "frontend" && q !== "security operations")
      return Response.json({ jobs: [] });
    if (page === 3) return new Response("rate limited", { status: 429 });
    return Response.json({
      totalCount: 1,
      jobs: [
        {
          title:
            q === "frontend"
              ? "Frontend Developer"
              : "Security Operations Analyst",
          companyName: `Page ${page} ${q} Fixture`,
          description: "Fully remote React or security operations work.",
          locationRestrictions: [],
          timezoneRestrictions: [1],
          pubDate: unix,
          expiryDate: unix + 86400,
          applicationLink: `https://himalayas.app/companies/fixture/jobs/${page}`,
        },
      ],
    });
  };
  const result = await discover();
  assert.equal(queries.size, 17);
  for(const role of ["backend","full stack","Node.js","Laravel","PHP"])assert.ok(queries.has(role));
  assert.ok(peak <= 3);
  assert.equal(result.jobs.filter((j) => j.source === "Himalayas").length, 4);
  assert.equal(
    result.sources.find((s) => s.source === "Himalayas")?.status,
    "partial",
  );
});

test("only real publication dates within 30 days qualify; re-seeing a job does not make it new", async () => {
  globalThis.fetch = async (input) =>
    String(input).includes("remotive.com")
      ? Response.json({
          jobs: [2, 71, 73, 120, 721, -2].map((hours) => ({
            title: "React Developer",
            company_name: `Age ${hours} Fixture`,
            candidate_required_location: "Worldwide",
            publication_date: new Date(
              Date.now() - hours * 3600000,
            ).toISOString(),
            url: `https://remotive.com/remote-jobs/age-${hours}`,
            description: "React interfaces",
          })),
        })
      : new Response("", { status: 503 });
  const result = await discover();
  assert.deepEqual(
    result.jobs.map((job) => job.company),
    ["Age 2 Fixture", "Age 71 Fixture", "Age 73 Fixture", "Age 120 Fixture"],
  );
  assert.equal(
    result.sources.find((source) => source.source === "Remotive")?.excluded.age,
    2,
  );
});
