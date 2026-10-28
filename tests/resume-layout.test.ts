import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { emptyProfile } from "../src/lib/types";
import {
  basicResumeProfile,
  quotedResumeProfile,
} from "../src/lib/resume-profile";
import {
  buildResume,
  parseResumeClaims,
  resumeEvidence,
} from "../src/lib/resume-builder";
import { cleanResumeLayout, resumeEntries } from "../src/lib/resume-layout";
import { resumePdf } from "../src/lib/resume-pdf";
import { resumeDocx } from "../src/lib/resume-docx";
import { extractCv } from "../src/lib/cv";
import { projects, extras, sectionCv } from "./helpers/section-cv";
const profile = {
  ...emptyProfile,
  ...basicResumeProfile(sectionCv),
  name: "Section Test Applicant",
  email: "sections@example.org",
  cvText: sectionCv,
};
const target = {
  title: "Frontend Developer",
  company: "Fixture",
  url: "",
  description: "Build React and TypeScript interfaces with Kubernetes.",
};

test("CV import stops Projects at contributions/training and AI excerpts retain source line breaks", () => {
  const imported = basicResumeProfile(sectionCv);
  assert.equal(imported.projects, projects);
  assert.doesNotMatch(
    imported.projects!,
    /COMMUNITY|OPEN.SOURCE|certifications/i,
  );
  assert.match(imported.skills!, /Languages: JavaScript/);
  const quote = projects.replace(/\s+/g, " ");
  assert.equal(
    quotedResumeProfile(sectionCv, { fields: { projects: [quote] } }).projects,
    projects,
  );
});
test("profile-based CV never dumps residual source text, while genuine sections remain available without AI", async () => {
  const built = await buildResume(profile, target, false);
  const content = built.content;
  assert.equal(content.additional, undefined);
  assert.deepEqual(resumeEntries(content.projects), resumeEntries(projects));
  assert.match(content.summary, /^Software developer building/);
  assert.match(content.contributions!, /Community Code Event/);
  assert.match(content.training!, /Security Labs/);
  assert.equal(content.certifications, "");
  assert.doesNotMatch(
    JSON.stringify(content),
    /LinkedIn · GitHub · Portfolio|Kubernetes/,
  );
  assert.deepEqual(
    parseResumeClaims(
      {
        items: [
          { section: "additional", text: "A repeated header", sources: [0] },
        ],
      },
      resumeEvidence(profile),
    ),
    [],
  );
});
test("legacy cleanup creates a separate copy and keeps named qualifications out of projects", async () => {
  const content = (await buildResume(profile, target, false)).content;
  const legacy = {
    ...content,
    projects: projects + "\n" + extras,
    contributions: "",
    training: "",
    certifications: "",
    additional: sectionCv,
  };
  const original = structuredClone(legacy);
  const cleaned = cleanResumeLayout(legacy);
  assert.deepEqual(legacy, original);
  assert.equal(cleaned.additional, undefined);
  assert.deepEqual(resumeEntries(cleaned.projects), resumeEntries(projects));
  assert.match(cleaned.contributions!, /2 editions/);
  assert.match(cleaned.training!, /practice exercises/);
});
test("project records retain their own title, technologies and wrapped bullet text", () => {
  const entries = resumeEntries(projects);
  assert.deepEqual(
    entries.map((entry) => entry.title),
    ["Savings Portal — Full-Stack Savings Platform", "Pharmacy Application"],
  );
  assert.equal(entries[0].parts[0].kind, "meta");
  assert.deepEqual(
    entries[0].parts
      .filter((part) => part.kind === "bullet")
      .map((part) => part.text),
    [
      "Built savings workflows for individuals and groups.",
      "Integrated a payment API.",
    ],
  );
  assert.match(entries[1].parts[0].text, /React/);
  assert.doesNotMatch(JSON.stringify(entries[1]), /Paystack|savings/);
  assert.equal(resumeEntries("Built a TypeScript portfolio.")[0].title, "");
  const contribution = resumeEntries(
    "Community Code Event — Open-Source Contributor\n2 editions\n• Submitted changes.",
  );
  assert.equal(
    contribution[0].title,
    "Community Code Event — Open-Source Contributor",
  );
  assert.equal(contribution[0].parts[0].text, "2 editions");
});
test("PDF and Word contain clean sections, project heading styles and real editable bullet lists", async () => {
  const content = (await buildResume(profile, target, false)).content;
  const pdf = await resumePdf(content, target);
  assert.equal(
    (await PDFDocument.load(pdf)).getPageCount(),
    1,
    "A short CV should not put a small final section on an otherwise empty second page",
  );
  const pdfText = await extractCv(new File([new Uint8Array(pdf)], "clean.pdf"));
  assert.equal((pdfText.match(/Section Test Applicant/g) || []).length, 1);
  assert.doesNotMatch(
    pdfText,
    /ADDITIONAL QUALIFICATIONS|LinkedIn · GitHub · Portfolio/,
  );
  assert.match(pdfText, /OPEN-SOURCE CONTRIBUTIONS/);
  assert.match(pdfText, /TRAINING & COMMUNITY/);
  assert.match(pdfText, /Pharmacy Application/);
  const word = await resumeDocx(content, target);
  const text = await extractCv(new File([new Uint8Array(word)], "clean.docx"));
  assert.doesNotMatch(text, /ADDITIONAL QUALIFICATIONS/);
  const zip = await JSZip.loadAsync(word);
  const xml = await zip.file("word/document.xml")!.async("string");
  const title = xml
    .split("</w:p>")
    .find((paragraph) => paragraph.includes("Savings Portal"));
  assert.match(title!, /<w:b\/>/);
  assert.match(xml, /<w:numPr>/);
  assert.match(xml, /52626A/);
});

test("structured employer headings remain intact with employment types, locations and unknown dates", async () => {
  const { emptyCareerRecord, formatCareerRecord } = await import(
    "../src/lib/career-records"
  );
  for (const dates of [
    { start: "2023-04", end: "2025-08" },
    { start: "", end: "" },
  ]) {
    const record = {
      ...emptyCareerRecord("fixture-employment"),
      confirmed: true,
      organization: "Fictional Studio",
      title: "Frontend Developer",
      employmentType: "Full-time",
      location: "Remote",
      responsibilities: "Built genuine React forms.",
      ...dates,
    };
    const entries = resumeEntries(formatCareerRecord(record, "employment"));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, "Fictional Studio — Frontend Developer");
    assert.equal(entries[0].parts[0].kind, "meta");
    assert.match(entries[0].parts[0].text, /Full-time.*Remote/);
    assert.equal(entries[0].parts[1].kind, "bullet");
  }
});
