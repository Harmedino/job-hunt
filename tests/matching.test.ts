import { test } from "node:test";
import assert from "node:assert/strict";
import {
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
