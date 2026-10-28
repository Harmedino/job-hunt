import { careerPreferences } from "../src/lib/career-preferences";
import { isolateAiEnv } from "./helpers/ai-env";
isolateAiEnv();
import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { PDFDocument, PDFName } from "pdf-lib";
import { emptyProfile, type Profile } from "../src/lib/types";
import { emptyCareerRecord } from "../src/lib/career-records";
import { careerImportProposals } from "../src/lib/career-import";
import {
  validateResumeOptions,
  validateNyscInContent,
} from "../src/lib/resume-options";
import {
  resumeEvidence,
  parseResumeClaims,
  buildResume,
} from "../src/lib/resume-builder";
import { resumeDocx } from "../src/lib/resume-docx";
import { resumePdf } from "../src/lib/resume-pdf";
import { readabilityReview } from "../src/lib/resume-review";
import { extractCv } from "../src/lib/cv";
import { closeDb } from "../src/lib/db";
import { POST as create } from "../src/app/api/resumes/route";
import { POST as writing } from "../src/app/api/resumes/[id]/writing/route";
import { POST as packageCv } from "../src/app/api/resumes/[id]/package/route";
import { GET as preview } from "../src/app/api/resumes/[id]/preview/route";
import { GET as review } from "../src/app/api/resumes/[id]/readability/route";
import { POST as importCv } from "../src/app/api/profile/import/route";
import { POST as upload } from "../src/app/api/applications/[id]/files/route";
import { GET as downloads } from "../src/app/api/applications/[id]/documents/route";
import { PATCH as updateApplication } from "../src/app/api/applications/route";
import { fileResponse } from "../src/lib/application-files";
const work = {
  ...emptyCareerRecord("work1"),
  confirmed: true,
  organization: "Fictional Web Studio",
  title: "Software Developer",
  start: "2023-04",
  end: "2025-08",
  responsibilities: "Built React forms and integrated REST APIs.",
  achievements: "Implemented Node.js authentication.",
  technologies: "React, TypeScript, Node.js, Express",
};
const project = {
  ...emptyCareerRecord("project1"),
  confirmed: true,
  name: "Fictional Angular Portal",
  start: "2024",
  end: "2025",
  description: "Built Angular forms with TypeScript.",
};
const profile: Profile = {
  ...emptyProfile,
  name: "Fictional CV Candidate",
  email: "cv-fixture@example.org",
  skills: "React, TypeScript, Angular, Node.js, Express",
  experience: "Legacy text preserved.",
  education: "BSc Computer Science",
  careerRecords: { employment: [work], projects: [project] },
  nysc: {
    status: "Completed",
    confirmed: true,
    completionDate: "2025-06-01",
    details: "",
  },
  customFields: [
    {
      id: "detail1",
      name: "Actual tools",
      value: "Git and documented REST APIs",
      confirmed: true,
    },
    {
      id: "detail2",
      name: "Unconfirmed claim",
      value: "Kubernetes",
      confirmed: false,
    },
  ],
  career: {
    ...careerPreferences(emptyProfile),
    securitySkills: "Linux, Networking",
    securityExperience:
      "Beginner security labs; no professional SOC employment.",
  },
};
const target = {
  title: "React Developer",
  company: "Fictional Employer",
  url: "",
  description:
    "Required: React and TypeScript. Preferred: Kubernetes. NYSC completion is requested.",
};
const req = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
test("structured CV tracks retain employer, dates and project context; keywords and NYSC are explicit", async () => {
  const options = validateResumeOptions(
    {
      includedCustomFields: ["detail1", "detail2"],
      keywords: [
        { id: "kw1", text: "Kubernetes", kind: "required", priority: 3 },
      ],
    },
    profile,
  );
  const evidence = resumeEvidence(profile, options),
    i = evidence.findIndex((e) => e.recordId === "work1"),
    p = evidence.findIndex((e) => e.recordId === "project1");
  assert.match(evidence[i].text, /2023-04 – 2025-08/);
  assert.doesNotMatch(JSON.stringify(evidence), /Kubernetes|NYSC Status/);
  assert.match(JSON.stringify(evidence), /Actual tools/);
  assert.deepEqual(
    parseResumeClaims(
      {
        items: [
          {
            section: "experience",
            text: project.name + "\n" + work.responsibilities,
            sources: [p, i],
          },
          {
            section: "experience",
            text: "Changed Employer\n" + work.responsibilities,
            sources: [i],
          },
          { section: "skills", text: "Kubernetes", sources: [i] },
        ],
      },
      evidence,
    ),
    [],
  );
  const original = evidence[i].text;
  assert.equal(
    parseResumeClaims(
      { items: [{ section: "experience", text: original, sources: [i] }] },
      evidence,
    ).length,
    1,
  );
  const dev = await buildResume(profile, target, false, { cvOptions: options });
  assert.match(dev.content.experience, /Fictional Web Studio/);
  assert.doesNotMatch(JSON.stringify(dev.content), /Kubernetes|NYSC Status/);
  assert.equal(dev.coverLetter, "");
  const security = resumeEvidence(
    profile,
    validateResumeOptions({ track: "cybersecurity" }, profile),
  );
  assert.match(
    security.find((e) => e.section === "training")!.text,
    /Beginner security labs/,
  );
  assert.match(
    security.find((e) => e.recordId === "work1")!.text,
    /Software Developer/,
  );
  assert.equal(
    security.some(
      (e) => e.section === "experience" && /SOC Analyst/.test(e.text),
    ),
    false,
  );
  assert.throws(
    () => validateNyscInContent("NYSC Status: Completed", profile, options),
    /explicit inclusion/,
  );
  const enabled = validateResumeOptions({ includeNysc: true }, profile);
  assert.doesNotThrow(() =>
    validateNyscInContent("NYSC Status: Completed", profile, enabled),
  );
  assert.throws(
    () => validateNyscInContent("NYSC Status: Exempted", profile, enabled),
    /differs/,
  );
  assert.doesNotThrow(() =>
    validateNyscInContent(
      "NYSC Portal — Software Developer\nCompleted React interface work.",
      profile,
      options,
    ),
  );
});
test("conservative import proposals retain literal identities and unknown dates pending approval", () => {
  const text =
    "EXPERIENCE\nFictional Web Studio — Software Developer\n2023-04 – 2025-08\n• Built React forms.\nPROJECTS\nFictional Angular Portal\n• Built Angular forms.\nEDUCATION\nBSc Computer Science — Fictional University\n2020 – 2024";
  const proposals = careerImportProposals(text);
  assert.equal(proposals.length, 3);
  assert.equal(proposals[0].record.organization, work.organization);
  assert.equal(proposals[0].record.start, "2023-04");
  assert.equal(proposals[0].record.confirmed, false);
  assert.equal(proposals[1].record.start, "");
  assert.equal(proposals[2].record.degree, "BSc Computer Science");
});
test("PDF and Word preserve selectable text and clickable actual contact/project links", async () => {
  const built = await buildResume(
    {
      ...profile,
      github: "https://github.com/fictional-fixture",
      careerRecords: {
        ...profile.careerRecords,
        projects: [{ ...project, url: "https://example.org/fixture-demo" }],
      },
    },
    target,
    false,
  );
  const pdf = await resumePdf(built.content, target);
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(doc.getPages().some((page) => page.node.get(PDFName.of("Annots"))));
  const word = await resumeDocx(built.content, target);
  const zip = await JSZip.loadAsync(word);
  assert.match(
    await zip.file("word/_rels/document.xml.rels")!.async("string"),
    /https:\/\/example.org\/fixture-demo/,
  );
  const text = await extractCv(new File([new Uint8Array(pdf)], "cv.pdf")),
    wordText = await extractCv(new File([new Uint8Array(word)], "cv.docx"));
  const result = readabilityReview(built.content, text, {
    wordText,
    pageCount: doc.getPageCount(),
  });
  assert.equal(result.readingOrder, true);
  assert.equal(result.wordSectionsPresent, true);
  assert.equal(result.contactPresent, true);
  assert.equal(result.experienceDates.missing.length, 0);
  assert.match(result.notice, /not an ATS score/);
});
test(
  "independent writing, private imports, actual preview, immutable application files and manual packages persist",
  { skip: !process.env.TEST_MONGODB_URI, timeout: 60000 },
  async () => {
    const old = {
        MONGODB_URI: process.env.MONGODB_URI,
        MONGODB_DB: process.env.MONGODB_DB,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
      fetch = globalThis.fetch;
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = "cv_upgrade_" + process.pid;
    const client = new MongoClient(process.env.TEST_MONGODB_URI!),
      database = client.db(process.env.MONGODB_DB);
    try {
      await database.collection("profile").insertOne({ key: "owner", profile });
      const imported = await importCv(
        req({
          text: "Changed Applicant\nchanged@example.org\nEXPERIENCE\nFictional Web Studio — Software Developer\n2023-04 – 2025-08\n• Built React forms.",
        }),
      );
      assert.equal(imported.status, 200);
      assert.equal((await imported.json()).previewOnly, true);
      assert.equal(
        (await database.collection("profile").findOne({ key: "owner" }))!
          .profile.name,
        profile.name,
      );
      const response = await create(
        req({ action: "generate", useAi: false, target }),
      );
      assert.equal(response.status, 200);
      const first = await response.json();
      assert.equal(first.coverLetter, "");
      const meta = await (
        await preview(new Request("http://localhost?meta=1"), params(first.id))
      ).json();
      assert.equal(meta.pageCount, 1);
      const png = await preview(
        new Request("http://localhost?page=1"),
        params(first.id),
      );
      assert.equal(png.headers.get("Content-Type"), "image/png");
      assert.equal(
        Buffer.from(await png.arrayBuffer())
          .subarray(1, 4)
          .toString(),
        "PNG",
      );
      const checked = await (
        await review(new Request("http://localhost"), params(first.id))
      ).json();
      assert.equal(checked.wordSelectableText, true);
      assert.equal(checked.pageCount, 1);
      process.env.OPENAI_API_KEY = "test-only";
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response("", { status: 503 });
      };
      assert.equal(
        (
          await writing(
            req({ section: "coverLetter", useAi: true }),
            params(first.id),
          )
        ).status,
        503,
      );
      assert.equal(await database.collection("resumes").countDocuments({}), 1);
      assert.equal(
        (await database.collection("resumes").findOne({ id: first.id }))!
          .coverLetter,
        "",
      );
      assert.equal(calls, 2);
      let stages = 0;
      globalThis.fetch = async () => {
        stages++;
        const data =
          stages === 1
            ? {
                items: [
                  {
                    section: "coverLetter",
                    text: "My genuine development skills include React and TypeScript for building accessible web interfaces.",
                    sources: [0],
                  },
                  {
                    section: "coverLetter",
                    text: "At Fictional Web Studio, I worked as a Software Developer and built React forms and REST APIs.",
                    sources: [1],
                  },
                ],
              }
            : { supported: [0, 1] };
        return Response.json({
          choices: [{ message: { content: JSON.stringify(data) } }],
        });
      };
      const letter = await writing(
        req({ section: "coverLetter", useAi: true, retry: true }),
        params(first.id),
      );
      assert.equal(
        letter.status,
        200,
        JSON.stringify(await letter.clone().json()),
      );
      const second = await letter.json();
      assert.deepEqual(second.content, first.content);
      assert.match(second.coverLetter, /Dear Hiring Team/);
      assert.equal(second.previousId, first.id);
      assert.equal(stages, 2);
      const sectionResponse = await writing(
        req({ section: "experience", useAi: false }),
        params(second.id),
      );
      assert.equal(sectionResponse.status, 200);
      const sectionVersion = await sectionResponse.json();
      assert.equal(sectionVersion.coverLetter, second.coverLetter);
      assert.equal(sectionVersion.content.skills, second.content.skills);
      assert.equal(sectionVersion.content.experience, first.content.experience);
      assert.equal(
        (
          await create(
            req({
              action: "save",
              draftId: second.id,
              content: second.content,
              statementReviews: { bad: "unrecognized" },
            }),
          )
        ).status,
        400,
      );
      const packaged = await packageCv(req({}), params(second.id));
      assert.equal(packaged.status, 200);
      const appId = (await packaged.json()).applicationId;
      assert.equal(
        (
          await updateApplication(
            req({
              id: appId,
              status: "Submitted",
              submissionConfirmed: true,
              applicationDate: "2026-10-20",
              coverLetterUsed: "yes",
            }),
          )
        ).status,
        200,
      );
      const app = (await database
        .collection("applications")
        .findOne({ id: appId }))!;
      assert.equal(app.job.url, "");
      assert.ok(app.documentSnapshot.files.length >= 2);
      const frozen = await downloads(
        new Request("http://localhost?format=pdf"),
        params(appId),
      );
      const frozenBytes = Buffer.from(await frozen.arrayBuffer());
      await database.collection("resumes").updateOne(
        { id: second.id },
        {
          $set: {
            "content.summary": "Later content must not replace submitted files",
          },
        },
      );
      assert.deepEqual(
        Buffer.from(
          await (
            await downloads(
              new Request("http://localhost?format=pdf"),
              params(appId),
            )
          ).arrayBuffer(),
        ),
        frozenBytes,
      );
      const form = (text: string, confirm = false) => {
        const value = new FormData();
        value.set("file", new File([text], "submitted.txt"));
        value.set("kind", "cv");
        value.set("originalConfirmed", "true");
        if (confirm) {
          value.set("correctionConfirmed", "true");
          value.set(
            "correctionReason",
            "Selected the actual submitted revision after checking.",
          );
        }
        return new Request("http://localhost", { method: "POST", body: value });
      };
      const original = Buffer.from(
        "Actual original submitted CV\nReact and TypeScript.",
      );
      const stored = await upload(form(original.toString()), params(appId));
      assert.equal(stored.status, 200);
      const file = (await stored.json()).file;
      assert.equal(
        file.sha256,
        createHash("sha256").update(original).digest("hex"),
      );
      assert.deepEqual(
        Buffer.from(await (await fileResponse(appId, file.id)).arrayBuffer()),
        original,
      );
      assert.equal(
        (await upload(form("Different submitted CV text"), params(appId)))
          .status,
        409,
      );
      assert.equal(
        (
          await upload(
            form("Corrected original submitted CV text", true),
            params(appId),
          )
        ).status,
        200,
      );
      assert.deepEqual(
        Buffer.from(await (await fileResponse(appId, file.id)).arrayBuffer()),
        original,
      );
      assert.equal(
        (await database.collection("applications").findOne({ id: appId }))!
          .originalFiles.length,
        2,
      );
      assert.equal(
        (
          await downloads(
            new Request("http://localhost?format=pdf"),
            params(appId),
          )
        ).status,
        409,
      );
      const bad = new FormData();
      bad.set("file", new File(["not a real PDF"], "bad.pdf"));
      bad.set("kind", "cv");
      bad.set("originalConfirmed", "true");
      assert.equal(
        (
          await upload(
            new Request("http://localhost", { method: "POST", body: bad }),
            params(appId),
          )
        ).status,
        422,
      );
      const master = await (
        await create(
          req({ action: "generate", masterTrack: "development", useAi: false }),
        )
      ).json();
      assert.equal((await packageCv(req({}), params(master.id))).status, 400);
      assert.equal(await database.collection("jobs").countDocuments({}), 0);
    } finally {
      globalThis.fetch = fetch;
      await closeDb();
      await database.dropDatabase();
      await client.close();
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  },
);
