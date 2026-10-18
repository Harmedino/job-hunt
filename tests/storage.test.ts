import {
  GET as listLeads,
  POST as addLead,
  PATCH as archiveLead,
} from "../src/app/api/leads/route";
import {
  GET as getSources,
  POST as checkSources,
} from "../src/app/api/sources/route";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { POST as uploadCV } from "../src/app/api/cv/route";
import { GET as getProfile } from "../src/app/api/profile/route";
import { POST as importSavedCV } from "../src/app/api/profile/import/route";
import { PDFDocument } from "pdf-lib";
import { emptyProfile } from "../src/lib/types";
import { db, closeDb } from "../src/lib/db";
import { PUT as saveProfile } from "../src/app/api/profile/route";
import { POST as discoverJobs } from "../src/app/api/discover/route";
import {
  POST as saveApplication,
  PATCH as updateApplication,
} from "../src/app/api/applications/route";
import { POST as prepare } from "../src/app/api/prepare/route";
import { GET as document } from "../src/app/api/documents/[id]/route";
import { GET as cron } from "../src/app/api/cron/route";
const enabled = !!process.env.TEST_MONGODB_URI;
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
process.env.MONGODB_DB = "job_hunt_test_" + process.pid;
delete process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;
const request = (body: unknown) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
after(async () => {
  globalThis.fetch = originalFetch;
  await closeDb();
  if (enabled) {
    const c = new MongoClient(process.env.MONGODB_URI!);
    await c.connect();
    await c.db(process.env.MONGODB_DB).dropDatabase();
    await c.close();
  }
});
test(
  "MongoDB profile, discovery, duplicate prevention, preparation and immutable submitted CV",
  { skip: !enabled, timeout: 30000 },
  async () => {
    // Synthetic source fixtures exercise integrations; never seed the actual application database.
    globalThis.fetch = async (input) =>
      Response.json(
        String(input).includes("remotive")
          ? {
              jobs: [
                {
                  title: "Junior React Developer",
                  company_name: "Integration Test Company",
                  candidate_required_location: "Worldwide",
                  description: "React and TypeScript. Remote.",
                  url: "https://remotive.com/remote-jobs/test-fixture",
                  publication_date: new Date().toISOString(),
                },
              ],
            }
          : { data: [] },
      );
    assert.equal(
      (
        await saveProfile(
          request({
            ...emptyProfile,
            name: "Test Applicant",
            email: "test@example.org",
            skills: "React, TypeScript",
            experience: "Built a React portfolio.",
          }),
        )
      ).status,
      200,
    );
    const result = await (await discoverJobs()).json();
    assert.equal(result.jobs.length, 1);
    assert.equal(result.persisted, true);
    const first = await (
      await saveApplication(request({ jobId: result.jobs[0].id }))
    ).json();
    const duplicate = await (
      await saveApplication(request({ jobId: result.jobs[0].id }))
    ).json();
    assert.equal(first.id, duplicate.id);
    assert.equal((await prepare(request({ id: first.id }))).status, 200);
    const pdf = await document(new Request("http://localhost"), {
      params: Promise.resolve({ id: first.id }),
    });
    assert.equal(pdf.status, 200);
    const bytes = await pdf.arrayBuffer();
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
    const upload = new FormData();
    upload.set(
      "file",
      new File([bytes], "cv.pdf", { type: "application/pdf" }),
    );
    const imported = await uploadCV(
      new Request("http://localhost/api/cv", { method: "POST", body: upload }),
    );
    assert.equal(imported.status, 200);
    const importedCv = await imported.json();
    assert.match(importedCv.text, /Test Applicant/);
    assert.equal(importedCv.persisted, true);
    assert.match(
      (await (await db()).collection("profile").findOne({ key: "owner" }))
        ?.profile.cvText,
      /Test Applicant/,
    );
    const saved = await (
      await db()
    )
      .collection("applications")
      .findOne({ id: first.id });
    assert.deepEqual(saved?.cvFacts, [
      "Skills: React, TypeScript",
      "Experience: Built a React portfolio.",
    ]);
    assert.equal(saved?.status, "Ready for review");
    assert.equal(
      (await updateApplication(request({ id: first.id, status: "Submitted" })))
        .status,
      200,
    );
    assert.equal((await prepare(request({ id: first.id }))).status, 409);
    assert.equal(
      (await saveApplication(request({ jobId: { $ne: null } }))).status,
      400,
    );
    // Source removes its posting: stale discovery record disappears, application history remains.
    globalThis.fetch = async (input) =>
      Response.json(
        String(input).includes("remotive") ? { jobs: [] } : { data: [] },
      );
    await discoverJobs();
    assert.equal(await (await db()).collection("jobs").countDocuments(), 0);
    assert.equal(
      await (await db()).collection("applications").countDocuments(),
      1,
    );
  },
);
test("scheduled discovery rejects missing/incorrect authorization", async () => {
  delete process.env.CRON_SECRET;
  assert.equal(
    (await cron(new Request("http://localhost/api/cron"))).status,
    401,
  );
});

test("CV-to-profile patch persists blank fields, preserves existing entries and prepares an AI-ranked PDF", { skip: !enabled, timeout: 30000 }, async () => {
  delete process.env.OPENAI_API_KEY;
  await saveProfile(request({ ...emptyProfile, name: "Existing chosen name", email: "", skills: "", experience: "", education: "", projects: "" }));
  const cv = "CV Applicant\napplicant@example.org\nTechnical Skills\nReact, TypeScript\nExperience\nBuilt accessible React interfaces at Example Co, 2024\nEducation\nBSc Computer Science\nProjects\nReact dashboard";
  const form = new FormData();
  form.set("file", new File([cv], "resume.txt"));
  const response = await uploadCV(new Request("http://localhost/api/cv", { method: "POST", body: form }));
  const uploaded = await response.json();
  assert.equal(uploaded.persisted, true);
  assert.ok(uploaded.patchedFields.includes("skills"));
  const profile = await (await getProfile()).json();
  assert.equal(profile.name, "Existing chosen name");
  assert.equal(profile.email, "applicant@example.org");
  assert.equal(profile.skills, "React, TypeScript");
  assert.equal(profile.experience, "Built accessible React interfaces at Example Co, 2024");
  assert.equal(profile.education, "BSc Computer Science");
  assert.equal(profile.projects, "React dashboard");
  assert.equal(profile.cvText, cv);
  assert.equal((await (await importSavedCV(request({}))).json()).persisted, true);
  // Local source/API fixtures only. Verify the job description reaches the ranker and exact facts reach the PDF.
  let aiCalled = false;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.openai.com")) {
      aiCalled = true;
      const data = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      assert.match(data.job, /React and TypeScript/);
      assert.equal(data.evidence[0], "Skills: React, TypeScript");
      return Response.json({ choices: [{ message: { content: '{"indices":[1,0,2,3]}' } }] });
    }
    return Response.json(String(input).includes("remotive") ? { jobs: [{ title: "Junior React Developer", company_name: "CV Integration Fixture", candidate_required_location: "Worldwide", description: "React and TypeScript. Fully remote.", url: "https://remotive.com/remote-jobs/cv-test-fixture", publication_date: new Date().toISOString() }] } : { data: [] });
  };
  const result = await (await discoverJobs()).json();
  const application = await (await saveApplication(request({ jobId: result.jobs[0].id }))).json();
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  try {
    assert.equal((await prepare(request({ id: application.id }))).status, 200);
    assert.equal(aiCalled, true);
    const saved = await (await db()).collection("applications").findOne({ id: application.id });
    assert.equal(saved?.preparationMethod, "AI-ranked profile evidence");
    assert.equal(saved?.cvFacts[0], "Experience: Built accessible React interfaces at Example Co, 2024");
    assert.match(saved?.coverLetter, /Junior React Developer/);
    const pdf = await document(new Request("http://localhost"), { params: Promise.resolve({ id: application.id }) });
    assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
    assert.ok((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount() > 0);
  } finally {
    delete process.env.OPENAI_API_KEY;
    await (await db()).collection("jobs").deleteOne({ id: result.jobs[0].id });
  }
});

test(
  "social inbox persists unverified posts, deduplicates them, and archives without creating jobs",
  { skip: !enabled, timeout: 10000 },
  async () => {
    const body = {
      url: "https://x.com/test/status/123",
      text: "Shared job for a frontend developer. Employer and Nigeria eligibility need confirmation.",
    };
    assert.equal((await addLead(request(body))).status, 200);
    assert.equal((await addLead(request(body))).status, 200);
    const leads = await (await listLeads()).json();
    assert.equal(leads.length, 1);
    assert.equal(leads[0].status, "Needs verification");
    assert.equal(await (await db()).collection("jobs").countDocuments(), 0);
    assert.equal(
      (await addLead(request({ ...body, url: "https://example.com/fake" })))
        .status,
      400,
    );
    assert.equal((await archiveLead(request({ id: leads[0].id }))).status, 200);
    assert.equal((await (await listLeads()).json()).length, 0);
  },
);

test(
  "source directory retains provenance and removes links withdrawn by a successful publisher check",
  { skip: !enabled, timeout: 10000 },
  async () => {
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input) =>
        String(input).includes("reddit.com")
          ? Response.json({
              kind: "t5",
              data: {
                display_name: new URL(String(input)).pathname.split("/")[2],
                subreddit_type: "public",
              },
            })
          : new Response('<a href="https://x.com/publisher_test">Account</a>', {
              headers: { "content-type": "text/html" },
            });
      assert.equal((await checkSources()).status, 200);
      const first = await (await getSources()).json();
      assert.equal(
        first.sources.filter((s: { platform: string }) => s.platform === "X")
          .length,
        5,
      );
      globalThis.fetch = async (input) =>
        String(input).includes("reddit.com")
          ? Response.json({
              kind: "t5",
              data: {
                display_name: new URL(String(input)).pathname.split("/")[2],
                subreddit_type: "public",
              },
            })
          : new Response("<p>No social links</p>", {
              headers: { "content-type": "text/html" },
            });
      await checkSources();
      assert.equal(
        (await (await getSources()).json()).sources.filter(
          (s: { platform: string }) => s.platform === "X",
        ).length,
        0,
      );
      assert.equal(await (await db()).collection("jobs").countDocuments(), 0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  },
);
