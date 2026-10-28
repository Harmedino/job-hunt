import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { POST, PATCH, GET } from "../src/app/api/applications/route";
import { GET as exportHistory } from "../src/app/api/applications/export/route";
import { GET as document } from "../src/app/api/applications/[id]/documents/route";
import { syncApplicationReminders } from "../src/lib/application-store";
import {
  applicationCounts,
  filterApplications,
  applicationActions,
  validateAvailability,
} from "../src/lib/application-history";
import {
  applicationWasApplied,
  matchingApplication,
} from "../src/lib/vacancy-groups";
import {
  applicationExport,
  applicationsCsv,
} from "../src/lib/application-export";
import { closeDb } from "../src/lib/db";
import { emptyProfile, type Application, type Job } from "../src/lib/types";
import { profileResume } from "../src/lib/resume-builder";
const req = (data: unknown) =>
  new Request("http://localhost/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const job = {
  id: "readiness-job",
  title: "Frontend Developer",
  company: "Fictional Readiness Labs",
  url: "https://job-boards.greenhouse.io/readiness/jobs/100",
  location: "Worldwide",
  salary: "NGN 400000 monthly",
  source: "Greenhouse",
  description: "Build React interfaces with TypeScript.",
  postedAt: "2025-01-01",
  closedAt: "2025-02-01",
  eligibility: "eligible",
  eligibilityReason: "Worldwide",
  score: 70,
  matchedSkills: ["React"],
} as Job;
test("application stage counts, actual-date filters, reminders and safe exports preserve history", () => {
  const app = {
    id: "a",
    job,
    status: "Submitted",
    createdAt: "2026-10-28",
    updatedAt: "2026-10-28",
    applicationDate: "2026-01-15",
    followUpDate: "2026-10-27",
    followUp: '=IMPORTDATA("unsafe")',
    notes: "first\nsecond",
    saved: true,
  } as Application;
  const unsaved = {
    ...app,
    id: "b",
    status: "Saved",
    applicationDate: "",
    saved: false,
  } as Application;
  assert.equal(applicationCounts([app, unsaved]).Archived, 1);
  assert.equal(applicationCounts([app, unsaved]).Submitted, 1);
  assert.equal(filterApplications([app, unsaved], { year: "2026" }).length, 1);
  assert.equal(filterApplications([app], { year: "2027" }).length, 0);
  assert.equal(
    applicationActions([app], new Date("2026-10-28T12:00:00Z"))[0].overdue,
    true,
  );
  assert.match(applicationsCsv([app]), /'=IMPORTDATA/);
  assert.equal(
    JSON.stringify(
      applicationExport({
        ...app,
        password: "secret",
        job: { ...job, API_KEY: "secret" },
      } as Application),
    ).includes("secret"),
    false,
  );
  assert.throws(() =>
    validateAvailability({ mode: "Completed", readyFrom: "" }),
  );
  assert.deepEqual(
    validateAvailability({ mode: "Preparing", readyFrom: "2027-01-01" }),
    { mode: "Preparing", readyFrom: "2027-01-01" },
  );
  assert.throws(() =>
    validateAvailability({ mode: "Preparing", readyFrom: "2027-02-29" }),
  );
});
test(
  "manual and expired discovered applications retain exact submissions, aliases, dates and deduplicated reminders",
  { skip: !process.env.TEST_MONGODB_URI, timeout: 30000 },
  async () => {
    const oldUri = process.env.MONGODB_URI,
      oldDb = process.env.MONGODB_DB;
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = "application_readiness_" + process.pid;
    const client = new MongoClient(process.env.TEST_MONGODB_URI!);
    const database = client.db(process.env.MONGODB_DB);
    try {
      const target = {
          title: job.title,
          company: job.company,
          url: job.url,
          description: job.description,
        },
        profile = {
          ...emptyProfile,
          name: "Fictional Candidate",
          email: "candidate@example.org",
          skills: "React, TypeScript",
          experience:
            "Fictional Interface Studio — Frontend Developer\n2024–2026\nBuilt accessible React forms.",
        },
        cv = {
          id: "original-cv",
          familyId: "original-cv",
          createdAt: "2026-01-01",
          target,
          content: profileResume(profile, target),
          profileSnapshot: profile,
          evidence: [],
          method: "Basic layout only",
          warnings: [],
          requirementsToReview: [],
          manualEdits: false,
          coverLetter: "Original submitted cover letter",
          layoutVersion: 2,
        };
      await database.collection("resumes").insertOne(cv);
      assert.equal(
        (
          await POST(
            req({
              manual: true,
              company: "Outside Employer",
              title: "Developer",
              status: "Submitted",
              applicationDate: "2026-03-01",
            }),
          )
        ).status,
        400,
      );
      assert.equal(
        await database.collection("applications").countDocuments({}),
        0,
      );
      const manual = await (
        await POST(
          req({
            manual: true,
            company: "Outside Employer",
            title: "Developer",
            location: "Remote",
            status: "Submitted",
            submissionConfirmed: true,
            applicationDate: "2026-03-01",
            cvDraftId: cv.id,
            coverLetterUsed: "yes",
            coverLetter: cv.coverLetter,
            notes: "Recorded later from my actual history.",
          }),
        )
      ).json();
      assert.equal(manual.status, "Submitted");
      assert.equal(manual.applicationDate, "2026-03-01");
      assert.notEqual(manual.createdAt.slice(0, 10), manual.applicationDate);
      assert.equal(manual.job.url, "");
      assert.equal(manual.job.postedAt, "");
      assert.equal(manual.origin, "manual");
      assert.equal(manual.documentSnapshot.cv.id, cv.id);
      await database
        .collection("jobs")
        .insertMany([
          job,
          {
            ...job,
            id: "publisher-copy",
            url: job.url + "?utm_source=publisher",
            source: "Himalayas",
          },
        ]);
      const saved = await (await POST(req({ jobId: job.id }))).json();
      assert.equal(
        (await PATCH(req({ id: saved.id, saved: false }))).status,
        200,
      );
      assert.equal(
        (await (await GET()).json()).find((a: Application) => a.id === saved.id)
          .saved,
        false,
      );
      const again = await (await POST(req({ jobId: "publisher-copy" }))).json();
      assert.equal(again.id, saved.id);
      const applied = await (
        await POST(
          req({
            jobId: job.id,
            markApplied: true,
            submissionConfirmed: true,
            applicationDate: "2026-04-05",
            cvDraftId: "",
            coverLetterUsed: "no",
          }),
        )
      ).json();
      assert.equal(applied.status, "Submitted");
      assert.equal(applied.documentSnapshot.cv, null);
      assert.equal(
        (await PATCH(req({ id: applied.id, saved: false }))).status,
        409,
      );
      assert.equal(
        (
          await document(
            new Request("http://localhost?document=cv&format=pdf"),
            { params: Promise.resolve({ id: applied.id }) },
          )
        ).status,
        404,
      );
      await PATCH(req({ id: applied.id, status: "Archived" }));
      const archived = (await database
        .collection("applications")
        .findOne({ id: applied.id }))!;
      assert.equal(
        applicationWasApplied(archived as unknown as Application),
        true,
      );
      assert.equal(
        matchingApplication({ ...job, id: "rediscovered" }, [
          archived as unknown as Application,
        ])?.id,
        applied.id,
      );
      assert.deepEqual(
        archived.statusHistory.map((s: { status: string }) => s.status),
        ["Saved", "Submitted", "Archived"],
      );
      await PATCH(
        req({
          id: manual.id,
          followUpDate: "2026-10-27",
          interviewDate: "2026-10-30",
          employerResponse: "User recorded invitation",
          nextAction: "Prepare questions",
        }),
      );
      await syncApplicationReminders(new Date("2026-10-28T12:00:00Z"));
      await syncApplicationReminders(new Date("2026-10-28T12:00:00Z"));
      assert.equal(
        await database
          .collection("notifications")
          .countDocuments({ kind: "application-reminder", read: false }),
        2,
      );
      await PATCH(req({ id: manual.id, followUpDate: "" }));
      await syncApplicationReminders(new Date("2026-10-28T12:00:00Z"));
      assert.equal(
        await database
          .collection("notifications")
          .countDocuments({ kind: "application-reminder", read: false }),
        1,
      );
      await database
        .collection("resumes")
        .updateOne(
          { id: cv.id },
          {
            $set: {
              "content.summary": "Changed much later",
              coverLetter: "New letter",
            },
          },
        );
      const kept = (await database
        .collection("applications")
        .findOne({ id: manual.id }))!;
      assert.notEqual(
        kept.documentSnapshot.cv.content.summary,
        "Changed much later",
      );
      assert.equal(kept.documentSnapshot.coverLetter, cv.coverLetter);
      const file = await document(
        new Request("http://localhost?document=cv&format=pdf"),
        { params: Promise.resolve({ id: manual.id }) },
      );
      assert.equal(file.status, 200);
      assert.equal(file.headers.get("Content-Type"), "application/pdf");
      const json = await exportHistory(
        new Request("http://localhost?format=json"),
      );
      assert.equal((await json.json()).applications.length, 2);
      const csv = await exportHistory(
        new Request("http://localhost?format=csv"),
      );
      assert.match(await csv.text(), /2026-03-01/);
      assert.equal(
        (await database.collection("applications").indexes()).some(
          (i) => i.name === "applicationDate_-1_updatedAt_-1",
        ),
        true,
      );
    } finally {
      await closeDb();
      await database.dropDatabase();
      await client.close();
      if (oldUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = oldUri;
      if (oldDb === undefined) delete process.env.MONGODB_DB;
      else process.env.MONGODB_DB = oldDb;
    }
  },
);
