import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLead } from "../src/lib/lead-extraction";
import { parseSocialLead } from "../src/lib/social";
import { leadJob } from "../src/lib/lead-verification";
import { searchLink } from "../src/lib/job-search-links";
test("manual lead extraction redacts third-party contacts, preserves evidence and never auto-verifies an anonymous post", () => {
  const text =
    "Position: React Developer\nCompany: Example Fixture\nLocation: Remote\nDate: 2026-10-01\nApply: https://example.org/jobs/123\nContact stranger@example.org or +234 800 123 4567";
  const lead = parseSocialLead({ platform: "WhatsApp", url: "", text });
  assert.doesNotMatch(lead.text, /stranger@|234 800/);
  assert.equal(lead.details?.title, "React Developer");
  assert.equal(lead.details?.applicationUrl, "https://example.org/jobs/123");
  assert.equal(lead.details?.postedAt, "2026-10-01T00:00:00.000Z");
  assert.throws(
    () => leadJob({ ...lead, status: "Needs verification", createdAt: "" }, {}),
    /Confirm employer/,
  );
  const job = leadJob(
    { ...lead, status: "Needs verification", createdAt: "" },
    {
      title: "React Developer",
      company: "Example Fixture",
      location: "Remote",
      applicationUrl: "https://example.org/jobs/123",
      evidenceUrl: "https://example.org/jobs/123",
      postedAt: "",
      employerConfirmed: true,
      vacancyConfirmed: true,
      locationReviewed: true,
    },
  );
  assert.equal(job.eligibility, "review");
  assert.equal(job.postedAt, "");
  assert.match(job.source, /user reviewed/);
  assert.ok(
    extractLead(
      "Hiring React developers, pay a registration fee",
    ).warnings.some((w) => /scam/.test(w)),
  );
});
test("Indeed search links are manual public browsing and reject unrelated/private destinations", () => {
  assert.equal(
    searchLink({
      name: "Nigeria remote",
      url: "https://ng.indeed.com/jobs?q=react",
    }).name,
    "Nigeria remote",
  );
  for (const url of [
    "https://indeed.com.evil.test/jobs",
    "https://127.0.0.1/jobs",
    "https://user:secret@indeed.com/jobs",
  ])
    assert.throws(() => searchLink({ name: "Search", url }));
});

test('alert-message timestamps do not become job publication dates and forwarding headers are removed',()=>{
 const lead=parseSocialLead({platform:'Indeed alert',url:'',text:'From: Personal Name <person@example.org>\nDate: 2026-10-20\nTitle: React Developer\nCompany: Alert Fixture\nApply: https://ng.indeed.com/viewjob?jk=job-id'});
 assert.equal(lead.details?.postedAt,'');assert.doesNotMatch(lead.text,/Personal Name|person@/);assert.equal(lead.details?.applicationUrl,'https://ng.indeed.com/viewjob?jk=job-id');
});
