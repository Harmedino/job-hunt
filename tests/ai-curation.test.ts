import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isolateAiEnv } from "./helpers/ai-env";
import { emptyProfile } from "../src/lib/types";
import {
  buildResume,
  parseResumeAnalysis,
  resumeEvidence,
} from "../src/lib/resume-builder";
isolateAiEnv();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const profile = {
  ...emptyProfile,
  name: "Curation Test",
  email: "curation@example.org",
  skills: "React, TypeScript",
  experience:
    "Example Co, Frontend Developer, 2023–2024\nBuilt accessible React interfaces.",
  education: "BSc Computer Science",
  projects: ["Alpha Dashboard", "Beta Portal", "Gamma Shop", "Delta Library"]
    .map(
      (name) =>
        `${name}\nReact · TypeScript\n• Built accessible interfaces for ${name}.`,
    )
    .join("\n\n"),
};
const target = {
  title: "Frontend Developer",
  company: "Fixture",
  url: "",
  description:
    "Build accessible React interfaces. Kubernetes experience required.",
};
const response = (value: unknown) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
const items = [
  {
    section: "summary",
    text: "Frontend skills include React and TypeScript, with experience building accessible interfaces.",
    sources: [0, 1],
  },
  { section: "skills", text: "React, TypeScript", sources: [0] },
  {
    section: "experience",
    text: "Built accessible React interfaces at Example Co (2023–2024).",
    sources: [1],
  },
  {
    section: "projects",
    text: "Beta Portal\nReact · TypeScript\n• Built accessible interfaces for Beta Portal.",
    sources: [3],
  },
  { section: "education", text: "BSc Computer Science", sources: [6] },
  {
    section: "coverLetter",
    text: "I built accessible React interfaces at Example Co (2023–2024).",
    sources: [1],
  },
  {
    section: "coverLetter",
    text: "My skills include React and TypeScript, which support frontend interface work.",
    sources: [0],
  },
];
test("AI selects relevant project evidence, writes a curated CV and never prints omitted profile blocks", async () => {
  process.env.OPENAI_API_KEY = "fixture-key";
  const evidence = resumeEvidence(profile);
  assert.deepEqual(
    evidence
      .filter((item) => item.section === "projects")
      .map((item) => item.label),
    ["Alpha Dashboard", "Beta Portal", "Gamma Shop", "Delta Library"],
  );
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    const data = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    if (++calls === 1)
      return response({
        priorities: [
          {
            requirement: "Build accessible React interfaces.",
            evidence: [1, 3],
          },
          { requirement: "Kubernetes experience required.", evidence: [] },
        ],
        selectedEvidence: [0, 1, 3, 6],
      });
    if (calls === 2) {
      assert.deepEqual(
        data.evidence.map((item: { id: number }) => item.id),
        [0, 1, 3, 6],
      );
      return response({
        items: [
          ...items,
          items[3], // A duplicate project must not be printed twice.
          {
            section: "projects",
            text: "Alpha Dashboard\nReact\n• Built interfaces.",
            sources: [2],
          },
          {
            section: "projects",
            text: "Gamma Shop\nReact\n• Built interfaces.",
            sources: [3],
          },
        ],
      });
    }
    assert.equal(data.target, undefined);
    assert.equal(data.claims.length, 5);
    assert.ok(
      data.claims.every(
        (claim: { evidence: string[] }) =>
          !claim.evidence.some((text) => /Gamma Shop|Delta Library/.test(text)),
      ),
    );
    return response({ supported: [0, 1, 2, 3, 4] });
  };
  const draft = await buildResume(profile, target, true);
  assert.equal(calls, 3);
  assert.match(draft.content.projects, /Beta Portal/);
  assert.doesNotMatch(
    JSON.stringify(draft.content),
    /Alpha Dashboard|Gamma Shop|Delta Library|Kubernetes/,
  );
  assert.equal(draft.aiGeneration?.provider, "OpenAI");
  assert.deepEqual(draft.requirementsToReview, [
    "Kubernetes experience required.",
  ]);
});
test("AI failure or rejected essential content never becomes a profile copy labelled as AI", async () => {
  process.env.OPENAI_API_KEY = "fixture-key";
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls === 1)
      return response({
        priorities: [
          {
            requirement: "Build accessible React interfaces.",
            evidence: [0, 1],
          },
        ],
        selectedEvidence: [0, 1, 3, 6],
      });
    if (calls === 2) return response({ items });
    return response({ supported: [0, 1, 4] }); // Work and project writing failed verification.
  };
  await assert.rejects(
    () => buildResume(profile, target, true),
    /No basic copy was substituted/,
  );
});
test("analysis rejects made-up requirements and invalid evidence, and caps selected projects at three", () => {
  const evidence = resumeEvidence(profile);
  assert.throws(
    () =>
      parseResumeAnalysis(
        {
          priorities: [{ requirement: "Invented requirement", evidence: [0] }],
          selectedEvidence: [0],
        },
        target,
        evidence,
      ),
    /verifiable job requirements/,
  );
  assert.throws(
    () =>
      parseResumeAnalysis(
        {
          priorities: [
            {
              requirement: "Build accessible React interfaces.",
              evidence: [0],
            },
          ],
          selectedEvidence: [99],
        },
        target,
        evidence,
      ),
    /could not analyse/,
  );
  const analysis = parseResumeAnalysis(
    {
      priorities: [
        { requirement: "Build accessible React interfaces.", evidence: [0] },
      ],
      selectedEvidence: [0, 1, 2, 3, 4, 5, 6],
    },
    target,
    evidence,
  );
  assert.equal(
    analysis.selectedEvidence.filter(
      (index) => evidence[index].section === "projects",
    ).length,
    3,
  );
});
