import { test } from "node:test";
import assert from "node:assert/strict";
import mammoth from "mammoth";
import { emptyProfile } from "../src/lib/types";
import { profileResume } from "../src/lib/resume-builder";
import {
  validateSectionOrder,
  orderedResumeSections,
} from "../src/lib/resume-types";
import { resumePdf } from "../src/lib/resume-pdf";
import { resumeDocx } from "../src/lib/resume-docx";
import { extractCv } from "../src/lib/cv";
import { resumeRecoveryKey } from "../src/lib/resume-recovery";
test("section order is validated and applied identically to PDF and Word without dropping content", async () => {
  assert.throws(() => validateSectionOrder(["skills", "skills"]));
  assert.throws(() => validateSectionOrder(["__proto__"]));
  const order = validateSectionOrder(["projects", "experience"]);
  assert.equal(order.length, 9);
  assert.deepEqual(orderedResumeSections().slice(0, 2), ["summary", "skills"]);
  const profile = {
    ...emptyProfile,
    name: "Section Order Candidate",
    email: "order@example.org",
    skills: "React",
    projects: "Accessible dashboard",
    experience: "Frontend Developer at Fixture",
    education: "User supplied qualification",
  };
  const target = {
    title: "Frontend Developer",
    company: "Fixture",
    url: "https://example.org/job",
    description:
      "Required: React interfaces and accessible product development.",
  };
  const content = profileResume(profile, target);
  const pdf = await resumePdf(
      content,
      target,
      "classic",
      undefined,
      false,
      order,
    ),
    word = await resumeDocx(
      content,
      target,
      "classic",
      undefined,
      false,
      order,
    );
  const text = await extractCv(new File([new Uint8Array(pdf)], "order.pdf"));
  const doc = (await mammoth.extractRawText({ buffer: Buffer.from(word) }))
    .value;
  for (const textValue of [text, doc]) {
    const upper = textValue.toUpperCase();
    assert.ok(upper.indexOf("PROJECTS") < upper.indexOf("EXPERIENCE"));
    assert.ok(
      upper.indexOf("EXPERIENCE") < upper.indexOf("PROFESSIONAL SUMMARY"),
    );
    assert.match(textValue, /User supplied qualification/);
  }
  assert.notEqual(
    resumeRecoveryKey(profile, target),
    resumeRecoveryKey({ ...profile, skills: "React, Angular" }, target),
  );
  assert.notEqual(
    resumeRecoveryKey(profile, target),
    resumeRecoveryKey(profile, {
      ...target,
      description: target.description + " Node.js",
    }),
  );
});
