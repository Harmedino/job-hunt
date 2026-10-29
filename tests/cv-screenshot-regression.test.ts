import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { isolateAiEnv } from "./helpers/ai-env";
isolateAiEnv();
import { emptyProfile } from "../src/lib/types";
import { careerPreferences } from "../src/lib/career-preferences";
import {
  buildResume,
  profileResume,
  resumeEvidence,
} from "../src/lib/resume-builder";
import { resumeEntries } from "../src/lib/resume-layout";
import { normalizeResumeBullets } from "../src/lib/resume-bullets";
import { resumePdf } from "../src/lib/resume-pdf";
import { resumeDocx } from "../src/lib/resume-docx";
import { extractCv } from "../src/lib/cv";
import { readabilityReview } from "../src/lib/resume-review";
import { writeResumePart } from "../src/lib/resume-writing";
import { validateResumeOptions } from "../src/lib/resume-options";
import type { ResumeDraft } from "../src/lib/resume-types";
const experience =
  "Fictional Web Studio — Frontend Developer\n2024 – Present\n● Maintain Angular and TypeScript interfaces. ● Integrate documented REST APIs. ● Investigate actual UI issues.";
const projects =
  "Fictional Savings Portal\nAngular · TypeScript · Node.js · MongoDB\n● Build savings workflows. ● Implement form validation.\n\nFictional Pharmacy App\nReact · Node.js · MongoDB\n● Build reusable interfaces. ● Test actual API endpoints.";
const profile = {
  ...emptyProfile,
  name: "Fictional Internship Candidate",
  email: "fixture@example.org",
  skills:
    "JavaScript, TypeScript, Node.js, React, Angular, Git, Security Testing Tools, Vulnerability Assessment, OWASP Top 10",
  experience,
  projects,
  education: "BSc Computer Science",
  cvText:
    "SUMMARY\nSoftware developer with 5 years of web development experience.\nSKILLS\nJavaScript, Angular, React\nEXPERIENCE\n" +
    experience,
  career: {
    ...careerPreferences(emptyProfile),
    securitySkills: "Linux, Networking",
    securityExperience:
      "Practised beginner network-security labs under supervision.",
  },
};
const target = {
  title: "Security Engineer Internship",
  company: "Fictional Security Employer",
  url: "",
  description:
    "Supervised security internship for beginners. Study Linux and Networking and test web application security. No professional SOC experience required.",
};
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test("inline PDF bullet glyphs become distinct lists without splitting technologies, date ranges or prose", () => {
  const entries = resumeEntries(experience);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Fictional Web Studio — Frontend Developer");
  assert.deepEqual(
    entries[0].parts.filter((p) => p.kind === "bullet").map((p) => p.text),
    [
      "Maintain Angular and TypeScript interfaces.",
      "Integrate documented REST APIs.",
      "Investigate actual UI issues.",
    ],
  );
  const rows = resumeEntries(projects);
  assert.equal(rows.length, 2);
  assert.equal(
    rows[0].parts[0].text,
    "Angular · TypeScript · Node.js · MongoDB",
  );
  assert.equal(rows[0].parts.filter((p) => p.kind === "bullet").length, 2);
  assert.doesNotMatch(JSON.stringify(rows[1]), /savings|Angular/);
  for (const glyph of ["●", "•", "▪", "◦", "‣", "⁃"])
    assert.deepEqual(
      resumeEntries(
        `Example Project\n${glyph} Built genuine forms. ${glyph} Tested validation.`,
      )[0].parts.map((p) => p.text),
      ["Built genuine forms.", "Tested validation."],
    );
  assert.equal(
    normalizeResumeBullets(
      "2024 – Present\nAngular · TypeScript\nBuilt a client-side app - with tests. There is no list here.",
    ),
    "2024 – Present\nAngular · TypeScript\nBuilt a client-side app - with tests. There is no list here.",
  );
  assert.equal(profile.experience, experience);
});
test("real PDF and editable Word place every copied bullet in its own list item", async () => {
  const content = profileResume(profile, {
    ...target,
    title: "Frontend Developer",
  });
  const pdf = await resumePdf(content, target),
    word = await resumeDocx(content, target);
  assert.ok((await PDFDocument.load(pdf)).getPageCount() <= 2);
  const text = await extractCv(new File([new Uint8Array(pdf)], "fixture.pdf")),
    wordText = await extractCv(
      new File([new Uint8Array(word)], "fixture.docx"),
    );
  for (const firstWords of [
    "Maintain Angular",
    "Integrate documented",
    "Investigate actual",
    "Build savings",
    "Implement form",
    "Build reusable",
    "Test actual",
  ])
    assert.ok(
      text.includes("\n• " + firstWords),
      firstWords + " should start on a new PDF line",
    );
  const zip = await JSZip.loadAsync(word),
    xml = await zip.file("word/document.xml")!.async("string");
  assert.equal((xml.match(/<w:numPr>/g) || []).length, 7);
  assert.equal(
    readabilityReview(content, text, { wordText }).wordSectionsPresent,
    true,
  );
  assert.equal(readabilityReview(content, text, { wordText }).bullets, 7);
});
test("internship tailoring separates security foundations from development work and honors exactly one supplied track summary", async () => {
  const before = structuredClone(profile),
    built = await buildResume(profile, target, false);
  assert.match(built.content.summary, /Seeking a cybersecurity internship/);
  assert.match(built.content.summary, /Linux|Networking/);
  assert.doesNotMatch(
    built.content.summary,
    /5 years|professional SOC|Certified/,
  );
  assert.match(built.content.skills, /Security foundations:.*Linux/);
  assert.match(
    built.content.skills,
    /Development and transferable skills:.*JavaScript/,
  );
  assert.match(
    built.content.experience,
    /Fictional Web Studio.*Frontend Developer/,
  );
  assert.match(built.content.training!, /beginner network-security labs/);
  assert.deepEqual(profile, before);
  const custom = {
    ...profile,
    cvTracks: {
      cybersecurity: {
        summary: "My supplied internship summary about genuine Linux learning.",
        selectedRecordIds: [],
      },
    },
  };
  const selected = await buildResume(custom, target, false);
  assert.equal(selected.content.summary, custom.cvTracks.cybersecurity.summary);
  assert.equal(
    resumeEvidence(
      custom,
      validateResumeOptions({ track: "cybersecurity" }),
    ).filter((e) => e.section === "summary").length,
    1,
  );
  const dev = await buildResume(
    profile,
    { ...target, title: "Frontend Developer" },
    false,
  );
  assert.match(dev.content.summary, /5 years of web development/);
});
test("section refresh uses the selected internship evidence and preserves earlier statement references", async () => {
  const previousEvidence = resumeEvidence(
    profile,
    validateResumeOptions({ track: "development" }),
  );
  const draft: ResumeDraft = {
    id: "fixture",
    familyId: "fixture",
    createdAt: new Date().toISOString(),
    target,
    content: profileResume(
      profile,
      target,
      previousEvidence,
      validateResumeOptions({ track: "development" }),
    ),
    coverLetter: "",
    method: "Fictional prior CV",
    warnings: [],
    requirementsToReview: [],
    manualEdits: false,
    profileSnapshot: profile,
    evidence: previousEvidence,
    options: validateResumeOptions({ track: "cybersecurity" }),
  };
  const result = await writeResumePart(draft, "summary", false);
  assert.match(result.text, /Seeking a cybersecurity internship/);
  assert.doesNotMatch(result.text, /5 years/);
  assert.deepEqual(
    result.evidence.slice(0, previousEvidence.length),
    previousEvidence,
  );
  process.env.OPENAI_API_KEY = "fixture-only";
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const payload = JSON.parse(
      JSON.parse(String(init?.body)).messages[1].content,
    );
    if (calls === 1) {
      assert.equal(payload.track, "cybersecurity");
      assert.equal(
        payload.evidence.some((e: { text: string }) =>
          e.text.includes("5 years"),
        ),
        false,
      );
      const source = payload.evidence.find(
        (e: { section: string; text: string }) =>
          e.section === "skills" && e.text.includes("Security foundations"),
      );
      assert.ok(source);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    section: "summary",
                    text: "Security foundations include Linux and Networking for a supervised internship.",
                    sources: [source.id],
                  },
                ],
              }),
            },
          },
        ],
      });
    }
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ supported: [0] }) } }],
    });
  };
  const written = await writeResumePart(draft, "summary", true);
  assert.match(written.text, /Linux and Networking/);
  assert.equal(
    written.evidence[written.statements[0].sources[0]].section,
    "skills",
  );
  assert.deepEqual(
    written.evidence.slice(0, previousEvidence.length),
    previousEvidence,
  );
});
