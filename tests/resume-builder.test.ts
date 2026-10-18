import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { emptyProfile } from "../src/lib/types";
import {
  buildResume,
  parseResumeClaims,
  profileResume,
  resumeEvidence,
} from "../src/lib/resume-builder";
import { validateResumeContent } from "../src/lib/resume-types";
import { resumePdf } from "../src/lib/resume-pdf";
import { extractCv } from "../src/lib/cv";
const originalFetch = globalThis.fetch,
  originalKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});
const profile = {
  ...emptyProfile,
  name: "Ṣọlá Adébáyọ̀",
  email: "test@example.org",
  skills: "React, TypeScript",
  experience:
    "Example Co, Frontend Developer, 2023–2024\nBuilt accessible React interfaces.",
  education: "BSc Computer Science, Example University",
  projects: "Built a TypeScript portfolio.",
};
const target = {
  title: "Frontend Developer",
  company: "Fixture Company",
  description:
    "Build accessible React interfaces. TypeScript and Kubernetes experience required.",
  url: "",
};
test("a complete profile-based CV is editable without an AI key and never imports job requirements as qualifications", async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await buildResume(profile, target, false);
  assert.equal(result.content.name, profile.name);
  assert.match(result.content.summary, /React, TypeScript/);
  assert.match(result.content.experience, /Example Co/);
  assert.match(result.content.education, /BSc Computer Science/);
  assert.doesNotMatch(JSON.stringify(result.content), /Kubernetes/);
  assert.equal(result.method, "Profile-based CV builder");
  assert.throws(
    () => validateResumeContent({ ...result.content, name: { $ne: null } }),
    /Invalid CV field/,
  );
  assert.throws(
    () =>
      validateResumeContent({
        ...result.content,
        portfolio: "javascript:alert(1)",
      }),
    /valid portfolio URL/,
  );
});
test("rewrites require real source references and cannot introduce dates, metrics or unsupported fields", () => {
  const evidence = resumeEvidence(profile);
  assert.deepEqual(
    parseResumeClaims(
      {
        items: [
          {
            section: "experience",
            text: "Increased revenue by 50% at Example Co.",
            sources: [1],
          },
          { section: "skills", text: "React", sources: [99] },
          { section: "invented", text: "CEO", sources: [0] },
        { section: { toString: "invalid" }, text: "CEO", sources: [0] },
          {
            section: "summary",
            text: "Skills include React and TypeScript.",
            sources: [0],
          },
        ],
      },
      evidence,
    ),
    [
      {
        section: "summary",
        text: "Skills include React and TypeScript.",
        sources: [0],
      },
    ],
  );
});
test("AI writes a job-specific draft and a separate check rejects unsupported qualifications", async () => {
  process.env.OPENAI_API_KEY = "test-only-key";
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    const data = JSON.parse(request.messages[1].content);
    if (++calls === 1) {
      assert.match(data.target.description, /Kubernetes/);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    section: "summary",
                    text: "Frontend skills include React and TypeScript.",
                    sources: [0],
                  },
                  {
                    section: "experience",
                    text: "Managed Kubernetes production deployments.",
                    sources: [1],
                  },
                  {
                    section: "experience",
                    text: "Built accessible React interfaces at Example Co (2023–2024).",
                    sources: [1],
                  },
                ],
                requirementsToReview: [
                  "TypeScript and Kubernetes experience required.",
                  "Invented requirement",
                ],
              }),
            },
          },
        ],
      });
    }
    assert.equal(data.target, undefined);
    assert.equal(data.claims.length, 3);
    return Response.json({
      choices: [{ message: { content: '{"supported":[0,2]}' } }],
    });
  };
  const draft = await buildResume(profile, target, true);
  assert.equal(calls, 2);
  assert.match(draft.content.summary, /Frontend skills/);
  assert.match(draft.content.experience, /Example Co \(2023–2024\)/);
  assert.doesNotMatch(draft.content.experience, /Kubernetes/);
  assert.deepEqual(draft.requirementsToReview, [
    "TypeScript and Kubernetes experience required.",
  ]);
  assert.equal(draft.warnings.length, 1);
});
test("formatted PDF embeds fonts, preserves accented names and paginates long CVs", async () => {
  const content = profileResume(profile, target);
  content.experience = Array.from(
    { length: 80 },
    (_, i) =>
      `Project ${i + 1}: Built and maintained accessible frontend interfaces with React and TypeScript.`,
  ).join("\n");
  const pdf = await resumePdf(content, target);
  assert.ok((await PDFDocument.load(pdf)).getPageCount() > 1);
  const extracted = await extractCv(
    new File([new Uint8Array(pdf)], "tailored.pdf"),
  );
  assert.match(extracted, /Ṣọlá Adébáyọ̀/);
  assert.match(extracted, /PROFESSIONAL SUMMARY/);
  assert.match(extracted, /Project 80/);
  assert.match(extracted, /Example University/);
});
