import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fullyRemote,
  eligibility,
  relevant,
  match,
  plainText,
  facts,
} from "../src/lib/matching";
import { emptyProfile, type Job } from "../src/lib/types";
test("worldwide location supports Nigeria, generic remote needs review", () => {
  assert.equal(
    eligibility("Worldwide", "Remote work")?.eligibility,
    "eligible",
  );
  assert.equal(
    eligibility("Remote", "A global company")?.eligibility,
    "review",
  );
});
test("explicit restrictions override worldwide labels", () => {
  for (const description of [
    "US only",
    "Must reside in the United States",
    "EU residents",
    "Not available in Nigeria",
    "Full Stack Developer - Remote from EU",
  ])
    assert.equal(eligibility("Worldwide", description), null);
  assert.equal(eligibility("United States", "Remote"), null);
});
test("South Africa is not equivalent to Africa-wide", () => {
  assert.notEqual(
    eligibility("South Africa", "Remote")?.eligibility,
    "eligible",
  );
  assert.equal(eligibility("Africa", "Remote")?.eligibility, "eligible");
});
test("roles exclude senior and unrelated work", () => {
  assert.equal(relevant("Junior React Developer"), true);
  assert.equal(relevant("SOC Analyst Intern"), true);
  assert.equal(relevant("Senior Frontend Developer"), false);
  assert.equal(relevant("Sales Executive"), false);
  assert.equal(relevant("Sales Account Executive - Cybersecurity"), false);
  assert.equal(relevant("React Native Engineer"), false);
  assert.equal(relevant("Junior Frontend Developer - Future Position"), false);
  assert.equal(relevant("Salesforce Frontend Developer"), true);
  assert.equal(relevant("Security Operations Analyst"), true);

  assert.equal(relevant("Software Engineer", "Build React frontend features."), true);
  assert.equal(relevant("Senior Software Engineer", "Build React frontend features."), false);
  assert.equal(relevant("Software Engineer", "Build Rust database internals."), false);
  assert.equal(relevant("Wordpress Developer - Frontend Design - Freelancer"), false);
  assert.equal(relevant("Cybersecurity Co-Founder / CPTO (100% remote)"), false);
  assert.equal(relevant("Security Analyst 3rd Level"), false);
});
test("matching uses saved skills and never creates evidence", () => {
  const job = {
    title: "React Developer",
    description: "TypeScript and React",
    matchedSkills: [],
    score: 0,
  } as unknown as Job;
  assert.equal(match(job, emptyProfile).score, 0);
  assert.deepEqual(
    match(job, { ...emptyProfile, skills: "React, Angular" }).matchedSkills,
    ["React"],
  );
  assert.deepEqual(facts(emptyProfile), []);
});
test("job descriptions are rendered as text", () =>
  assert.equal(
    plainText("<p>Hello &amp; welcome</p><script>bad()</script>"),
    "Hello & welcome",
  ));

test("remote-only discovery rejects office arrangements while allowing hybrid-cloud skills", () => {
  assert.equal(fullyRemote("React Developer (Hybrid)", "Worldwide", ""), false);
  assert.equal(
    fullyRemote("React Developer", "Remote", "This is a hybrid position."),
    false,
  );
  assert.equal(fullyRemote("Web Developer", "Anywhere in the World", "Work From Home (WFH) option available one day per week."), false);
  assert.equal(
    fullyRemote("React Developer", "Remote", "You must work in the office."),
    false,
  );
  assert.equal(
    fullyRemote(
      "SOC Analyst Intern",
      "Worldwide",
      "Fully remote role working with hybrid cloud security.",
    ),
    true,
  );
});
