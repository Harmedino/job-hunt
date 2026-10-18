import { test, after } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { POST as uploadCV } from "../src/app/api/cv/route";
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
    assert.match((await imported.json()).text, /Test Applicant/);
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
