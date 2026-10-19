import { isolateAiEnv } from "./helpers/ai-env";
isolateAiEnv();
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
  assert.equal(result.method, "Basic layout only · no AI writing");
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
    let value;
    if (++calls === 1) {
      assert.match(data.target.description, /Kubernetes/);
      value = {
        priorities: [
          {
            requirement: "Build accessible React interfaces.",
            evidence: [0, 1, 2],
          },
          {
            requirement: "TypeScript and Kubernetes experience required.",
            evidence: [],
          },
        ],
        selectedEvidence: [0, 1, 2, 3],
      };
    } else if (calls === 2) {
      assert.equal(data.evidence[0].id, 0);
      value = {
        items: [
          {
            section: "summary",
            text: "Frontend skills include React and TypeScript, with experience building accessible interfaces.",
            sources: [0, 1],
          },
          { section: "skills", text: "React, TypeScript", sources: [0] },
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
          {
            section: "projects",
            text: "Built a TypeScript portfolio.",
            sources: [2],
          },
          {
            section: "education",
            text: "BSc Computer Science, Example University",
            sources: [3],
          },
          {
            section: "coverLetter",
            text: "I built accessible React interfaces at Example Co (2023–2024).",
            sources: [1],
          },
          {
            section: "coverLetter",
            text: "My frontend skills include React and TypeScript for interface development.",
            sources: [0],
          },
          {
            section: "coverLetter",
            text: "I have Kubernetes expertise from production work.",
            sources: [0],
          },
        ],
      };
    } else {
      assert.equal(data.target, undefined);
      assert.equal(data.claims.length, 9);
      value = { supported: [0, 1, 3, 4, 5, 6, 7] };
    }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(value) } }],
    });
  };
  const draft = await buildResume(profile, target, true);
  assert.equal(calls, 3);
  assert.match(draft.content.summary, /Frontend skills/);
  assert.match(draft.content.experience, /Example Co \(2023–2024\)/);
  assert.doesNotMatch(draft.content.experience, /Kubernetes/);
  assert.deepEqual(draft.requirementsToReview, [
    "TypeScript and Kubernetes experience required.",
  ]);
  assert.equal(draft.warnings.length, 1);
  assert.match(
    draft.coverLetter,
    /I built accessible React interfaces at Example Co/,
  );
  assert.doesNotMatch(draft.coverLetter, /Kubernetes/);
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

test("CV and cover letter export as editable Word documents and styled PDFs without losing text", async () => {
  const { resumeDocx } = await import("../src/lib/resume-docx");
  const { profileCoverLetter, validateCoverLetter, validateTemplate } =
    await import("../src/lib/resume-types");
  const content = profileResume(profile, target);
  const letter = profileCoverLetter(content, target);
  assert.doesNotMatch(letter, /Kubernetes/);
  assert.match(letter, /Frontend Developer position at Fixture Company/);
  for (const template of ["classic", "modern", "compact"] as const) {
    for (const body of [undefined, letter]) {
      const word = await resumeDocx(content, target, template, body);
      const text = await extractCv(
        new File([new Uint8Array(word)], "application.docx"),
      );
      assert.match(text, /Ṣọlá Adébáyọ̀/);
      assert.match(text, body ? /Dear Hiring Team/ : /PROFESSIONAL SUMMARY/);
      const pdf = await resumePdf(content, target, template, body);
      assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 1);
    }
  }
  assert.throws(
    () => validateCoverLetter({ text: "injected" }),
    /cover letter/,
  );
  assert.throws(() => validateTemplate("invalid"), /style/);
});
