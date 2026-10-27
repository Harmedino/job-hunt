import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessStackFit,
  classifyLocation,
  inferExperience,
  inferJobType,
  extractRequirements,
  explainMatch,
  jobAvailable,
} from "../src/lib/job-intelligence";
import { recentPosting } from "../src/lib/job-freshness";
import { relevant } from "../src/lib/matching";
import { jobIdentity } from "../src/lib/job-identity";
import { emptyProfile, type Job } from "../src/lib/types";
test("technology roles, senior roles and independent work are recognized without sales/mobile leakage", () => {
  for (const role of [
    "Senior Backend Engineer",
    "Full Stack Developer",
    "Software Engineer",
    "Laravel PHP Developer",
    "Express Developer",
    "Freelance React Developer",
    "Security Operations Analyst",
    "SOC Analyst Intern",
  ])
    assert.equal(relevant(role), true, role);
  for (const role of [
    "Sales Account Executive - Cybersecurity",
    "Mobile Developer",
    "React Native Developer",
  ])
    assert.equal(relevant(role), false, role);
  assert.equal(inferJobType("React Engineer - Part-time"), "Part-time");
  assert.equal(inferJobType("Freelance PHP engineer"), "Freelance");
  assert.equal(inferExperience("Senior Backend Engineer"), "Senior");
});
test("location confidence distinguishes Nigeria, worldwide, unknown, structured restrictions and explicit authorization", () => {
  assert.equal(classifyLocation("Remote", "").eligibilityClass, "review");
  assert.equal(
    classifyLocation("EMEA", "A global company").eligibilityClass,
    "review",
  );
  assert.equal(classifyLocation("Nigeria", "").eligibilityClass, "nigeria");
  assert.equal(classifyLocation("Africa", "").eligibilityClass, "worldwide");
  assert.equal(
    classifyLocation("Worldwide", "US work authorization required")
      .eligibilityClass,
    "restricted",
  );
  assert.equal(
    classifyLocation("Worldwide", "", ["US"]).eligibilityClass,
    "restricted",
  );
  assert.equal(
    classifyLocation("Remote", "", ["NG"]).eligibilityClass,
    "nigeria",
  );
  assert.equal(
    classifyLocation("Worldwide", "", undefined, [-5]).eligibilityClass,
    "restricted",
  );
});
test("posting views use publication dates while closure and expiration remain independent", () => {
  const now = Date.now(),
    date = new Date(now - 10 * 86400000).toISOString();
  assert.equal(recentPosting(date, now, 7), false);
  assert.equal(recentPosting(date, now, 14), true);
  assert.equal(recentPosting("", now, 30), false);
  assert.equal(
    jobAvailable({ closedAt: new Date().toISOString() }, now),
    false,
  );
  assert.equal(
    jobAvailable({ expiresAt: new Date(now - 1).toISOString() }, now),
    false,
  );
  assert.equal(jobAvailable({}, now), true);
});
test("vacancy identity retains requisitions and locations while removing tracking", () => {
  const j = {
    company: "Company Fixture",
    title: "Software Engineer",
    location: "Remote",
    url: "https://example.org/job/123?utm_source=feed",
  };
  assert.equal(
    jobIdentity(j),
    jobIdentity({ ...j, url: "https://example.org/job/123" }),
  );
  assert.notEqual(
    jobIdentity(j),
    jobIdentity({ ...j, url: "https://example.org/job/456" }),
  );
  assert.notEqual(
    jobIdentity({ ...j, requisitionId: "A" }),
    jobIdentity({ ...j, requisitionId: "B" }),
  );
  assert.notEqual(jobIdentity(j), jobIdentity({ ...j, location: "Nigeria" }));
});
test("matching explains component scores and separates preferred requirements without inventing evidence", () => {
  const profile = {
    ...emptyProfile,
    skills: "React, TypeScript",
    experience: "Junior developer",
    projects: "React dashboard",
  };
  const description =
    "Required: React and Node.js.\nPreferred: Docker and TypeScript.";
  const req = extractRequirements(description, profile);
  assert.deepEqual(req[0].needsReview, ["Node.js"]);
  assert.equal(req[1].kind, "preferred");
  assert.deepEqual(req[1].supported, ["TypeScript"]);
  const j = explainMatch(
    {
      title: "Junior React Developer",
      description,
      postedAt: new Date().toISOString(),
      eligibility: "review",
      eligibilityReason: "Remote alone is unknown",
      matchedSkills: [],
    } as unknown as Job,
    profile,
  );
  assert.equal(j.scoreBreakdown?.location, 5);
  assert.equal(j.matchReasons?.length, 5);
  assert.doesNotMatch(j.matchReasons!.join(" "), /probability|guaranteed/i);
});


test('Java and .NET backend roles are incompatible with a JavaScript profile even when incidental web skills appear',()=>{
 const profile={...emptyProfile,skills:'React, TypeScript, Node.js',roles:'Frontend, Backend, Full-stack JavaScript'};
 for(const title of ['Backend Developer (.NET - C#)','Backend Engineer, Java - Web 3 Wallet']) {
  assert.equal(assessStackFit(title,'Worldwide remote React frontend, Java backend services.',profile).stackFit,'incompatible');
  const job=explainMatch({id:'stack-fixture',title,company:'Stack Fixture',location:'Worldwide',description:'Build services and React interfaces.',url:'https://example.org/job',salary:'',source:'Fixture',postedAt:new Date().toISOString(),discoveredAt:new Date().toISOString(),eligibility:'eligible',eligibilityReason:'Worldwide',score:90,matchedSkills:[]},profile);
  assert.ok(job.score<=20);assert.equal(job.stackFit,'incompatible');
 }
 assert.equal(assessStackFit('JavaScript Backend Developer','Node.js',profile).stackFit,'match');
 assert.equal(assessStackFit('Software Engineer','Details not supplied',profile).stackFit,'unknown');
 assert.equal(assessStackFit('Java Backend Developer','', {...profile,skills:'Java, Spring'}).stackFit,'match');
});

test('matching uses supplied project/experience evidence and visibly caps seniority mismatches',()=>{const profile={...emptyProfile,skills:'TypeScript',roles:'Junior developer',experience:'Junior developer who built accessible interfaces.',projects:'Angular Dashboard\nBuilt Angular components with TypeScript.'};const job:Job={id:'actual-project-evidence',title:'Senior Angular Developer',company:'Evidence Fixture',location:'Worldwide',salary:'',description:'Required: Angular and TypeScript. Preferred: Kubernetes.',url:'https://example.org/evidence',postedAt:new Date().toISOString(),discoveredAt:new Date().toISOString(),source:'Test fixture',eligibility:'eligible',eligibilityReason:'Worldwide',score:0,matchedSkills:[]};const match=explainMatch(job,profile);assert.ok(match.matchedSkills.includes('Angular'));assert.ok(!match.matchedSkills.includes('Kubernetes'));assert.equal(match.stackFit,'match');assert.equal(match.seniorityMismatch,true);assert.ok(match.score<65);assert.match(match.matchReasons?.join(' ')||'',/seniority exceeds/);assert.equal(profile.skills,'TypeScript');});

test('explicit applicant timezone requirements and remote-country labels override worldwide tags',()=>{assert.equal(classifyLocation('Worldwide','Location Remote (Candidates must be located at GMT+8 timezone)').eligibility,'restricted');assert.equal(classifyLocation('Worldwide','Applicants must be based in UTC+1 timezone.').eligibility,'eligible');assert.equal(classifyLocation('Worldwide','Applicants must be located between UTC-4 and UTC+3.').eligibility,'review');assert.equal(classifyLocation('Worldwide','Our office works in GMT+8; applicants may work worldwide.').eligibility,'eligible');assert.equal(classifyLocation('Worldwide','Remote - United States').eligibility,'restricted');assert.equal(classifyLocation('Worldwide','We build remote control software. Worldwide applicants welcome.').eligibility,'eligible');});
