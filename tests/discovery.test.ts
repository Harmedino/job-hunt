import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../src/lib/discovery";
import { runDiscovery } from "../src/lib/run-discovery";
import { closeDb } from "../src/lib/db";
const originalFetch = globalThis.fetch;
const originalUri = process.env.MONGODB_URI;
afterEach(async () => {
  globalThis.fetch = originalFetch;
  await closeDb();
  if (originalUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = originalUri;
});
const now = new Date().toISOString();
const unix = Math.floor(Date.now() / 1000);
function fixtureFetch(): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("weworkremotely")) return new Response(`<rss><channel><item><title>RSS Fixture: Frontend Developer</title><region>Anywhere in the World</region><pubDate>${now}</pubDate><link>https://weworkremotely.com/remote-jobs/test-rss-fixture</link><description><![CDATA[React interfaces. Fully remote.]]></description></item></channel></rss>`);
    if (url.includes("remotive.com")) return Response.json({ jobs: [
      { title: "React Developer", company_name: "Eligible Fixture", candidate_required_location: "Worldwide", publication_date: now, url: "https://remotive.com/remote-jobs/test-fixture", description: "React interfaces." },
      { title: "Senior React Developer", company_name: "Senior Fixture", candidate_required_location: "Worldwide", publication_date: now, url: "https://remotive.com/remote-jobs/senior-fixture" },
      { title: "React Developer", company_name: "Office Fixture", candidate_required_location: "Worldwide", publication_date: now, url: "https://remotive.com/remote-jobs/office-fixture", description: "Work From Home (WFH) option available one day per week." },
      { title: "React Developer", company_name: "Restricted Fixture", candidate_required_location: "Worldwide", publication_date: now, url: "https://remotive.com/remote-jobs/restricted-fixture", description: "US only" },
    ] });
    if (url.includes("arbeitnow")) return Response.json({ data: [
      { title: "Frontend Engineer", company_name: "Review Fixture", location: "Remote", remote: true, created_at: unix, url: "https://www.arbeitnow.com/jobs/test-fixture", description: "React" },
      { title: "Frontend Engineer", company_name: "Not Remote Fixture", location: "Remote", remote: false, created_at: unix, url: "https://www.arbeitnow.com/jobs/not-remote-fixture" },
    ] });
    if (url.includes("remoteok.com")) return Response.json([{ legal: "API metadata" }, { position: "Software Engineer", company: "Generic Title Fixture", location: "Worldwide", date: now, url: "https://remoteok.com/remote-jobs/generic-title-fixture", description: "Build frontend features with React and TypeScript." }]);
    assert.match(url, /himalayas.app\/jobs\/api\/search\?/);
    const params = new URL(url).searchParams;
    assert.equal(params.get("country"), "NG");
    assert.equal(params.get("timezone"), "1");
    assert.equal(params.get("sort"), "recent");
    if (params.get("q") !== "frontend") return Response.json({ jobs: [] });
    const base = { title: "Frontend Developer", description: "React", locationRestrictions: [], timezoneRestrictions: [0, 1, 2], pubDate: unix, expiryDate: unix + 86400, applicationLink: "https://himalayas.app/companies/test/jobs/fixture" };
    return Response.json({ jobs: [
      { ...base, companyName: "Worldwide Himalayas Fixture" },
      { ...base, companyName: "Timezone Restricted Fixture", timezoneRestrictions: [-5, -8] },
      { ...base, companyName: "Country Restricted Fixture", locationRestrictions: ["United States"] },
      { ...base, companyName: "Expired Fixture", expiryDate: unix - 100 },
      { ...base, companyName: "Timezone Unknown Fixture", timezoneRestrictions: undefined },
      { ...base, companyName: "Senior Only Fixture", seniority: ["Senior"] },
      { ...base, companyName: "Volunteer Fixture", employmentType: "Volunteer" },
      { ...base, companyName: "EU Title Fixture", title: "Frontend Developer - Remote from EU" },
    ] });
  };
}
test("real adapter shapes preserve sources, applicant restrictions, publication dates and review candidates", async () => {
  globalThis.fetch = fixtureFetch();
  const result = await discover();
  assert.equal(result.successfulSources.length, 5);
  assert.equal(result.jobs.length, 6);
  assert.equal(result.jobs.filter((j) => j.eligibility === "eligible").length, 4);
  assert.equal(result.jobs.find((j) => j.company === "Timezone Unknown Fixture")?.eligibility, "review");
  assert.equal(result.jobs.find((j) => j.source === "We Work Remotely")?.title, "Frontend Developer");
  const remotive = result.sources.find((s) => s.source === "Remotive")!;
  assert.deepEqual(remotive.excluded, { role: 1, remote: 1, invalid: 0, age: 0, location: 1, duplicate: 0 });
  const himalayas = result.sources.find((s) => s.source === "Himalayas")!;
  assert.equal(himalayas.excluded.location, 3);
  assert.equal(himalayas.excluded.role, 2);
  assert.equal(himalayas.excluded.age, 1);
  assert.equal(himalayas.status, "partial");
});
test("an unavailable source is distinct from a successful search with no matches and leaks no raw response", async () => {
  globalThis.fetch = async () => new Response("private upstream response", { status: 429 });
  const result = await discover();
  assert.equal(result.jobs.length, 0);
  assert.equal(result.successfulSources.length, 0);
  assert.ok(result.sources.every((s) => s.status === "error"));
  assert.doesNotMatch(JSON.stringify(result), /private upstream/);
});
test("MongoDB failure does not discard real live search results", async () => {
  process.env.MONGODB_URI = "not-a-valid-mongodb-uri";
  globalThis.fetch = fixtureFetch();
  const result = await runDiscovery();
  assert.equal(result.persisted, false);
  assert.equal(result.jobs.length, 6);
  assert.match(result.storageWarning!, /could not be saved/);
});
