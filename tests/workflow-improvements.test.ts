import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { emptyProfile } from "../src/lib/types";
import { profileResume } from "../src/lib/resume-builder";
import { closeDb } from "../src/lib/db";
import {
  GET as workingGet,
  POST as workingSave,
} from "../src/app/api/resumes/working/route";
import { GET as readability } from "../src/app/api/resumes/[id]/readability/route";
import {
  POST as leadImport,
  PATCH as leadReview,
} from "../src/app/api/leads/route";
import {
  POST as saveApplication,
  PATCH as updateApplication,
} from "../src/app/api/applications/route";
import { POST as attach } from "../src/app/api/resumes/[id]/attach/route";
import { POST as saveResume } from "../src/app/api/resumes/route";
import { GET as document } from "../src/app/api/documents/[id]/route";
import {
  POST as saveSearch,
  GET as searches,
} from "../src/app/api/job-searches/route";
import { extractCv } from "../src/lib/cv";
const req = (url: string, body: unknown) =>
  new Request("http://localhost" + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test(
  "recovery, manual lead verification, saved searches, readable exports and immutable submission snapshots",
  { skip: !process.env.TEST_MONGODB_URI, timeout: 45000 },
  async () => {
    const uri = process.env.MONGODB_URI,
      dbName = process.env.MONGODB_DB;
    const client = new MongoClient(process.env.TEST_MONGODB_URI!);
    const name = `job_hunt_workflow_test_${process.pid}`;
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = name;
    const database = client.db(name);
    try {
      const text =
        "Position: React Developer\nCompany: Workflow Test Employer\nLocation: Remote\nBuild React and TypeScript interfaces.\nApply: https://example.org/jobs/workflow\nContact person@example.org";
      assert.equal(
        (
          await leadImport(
            req("/api/leads", {
              url: "https://reddit.com/r/forhire/comments/workflow",
              text,
            }),
          )
        ).status,
        200,
      );
      const lead = (await database.collection("social_leads").findOne({}))!;
      assert.equal(lead.status, "Needs verification");
      assert.doesNotMatch(lead.text, /person@/);
      const review = {
        id: lead.id,
        action: "verify",
        title: "React Developer",
        company: "Workflow Test Employer",
        location: "Remote",
        applicationUrl: "https://example.org/jobs/workflow",
        evidenceUrl: "https://example.org/jobs/workflow",
        postedAt: "",
        employerConfirmed: true,
        vacancyConfirmed: true,
        locationReviewed: true,
      };
      assert.equal(
        (
          await leadReview(
            req("/api/leads", { ...review, employerConfirmed: false }),
          )
        ).status,
        400,
      );
      const promoted = await (
        await leadReview(req("/api/leads", review))
      ).json();
      assert.equal(promoted.job.eligibility, "review");
      assert.equal(promoted.job.postedAt, "");
      const application = await (
        await saveApplication(
          req("/api/applications", { jobId: promoted.jobId }),
        )
      ).json();
      assert.ok(application.id);
      const profile = {
        ...emptyProfile,
        name: "Workflow Test Candidate",
        email: "candidate@example.org",
        skills: "React, TypeScript",
        experience:
          "Junior developer\nBuilt user interfaces for a test fixture.",
        projects: "Test Dashboard\nBuilt React interfaces using TypeScript.",
        education: "Test qualification supplied by the user",
      };
      const target = {
        title: "React Developer",
        company: "Workflow Test Employer",
        description: "Required: React and TypeScript. Preferred: Docker.",
        url: review.applicationUrl,
        jobId: promoted.jobId,
        applicationId: application.id,
      };
      const content = profileResume(profile, target);
      const draft = {
        id: "working-source",
        familyId: "working-source",
        createdAt: new Date().toISOString(),
        target,
        content,
        profileSnapshot: profile,
        evidence: [],
        method: "Basic layout only",
        warnings: [],
        requirementsToReview: [],
        manualEdits: false,
        layoutVersion: 2,
        coverLetter: "Original cover letter",
        template: "classic",
      };
      await database.collection("resumes").insertOne(draft);
      const revised = {
        ...content,
        summary: "Edited text awaiting a new saved version",
      };
      const revision = Date.now();
      assert.equal(
        (
          await workingSave(
            req("/api/resumes/working", {
              draftId: draft.id,
              content: revised,
              coverLetter: "Working letter",
              template: "classic",
              revision,
            }),
          )
        ).status,
        200,
      );
      assert.equal(
        (await database.collection("resumes").findOne({ id: draft.id }))!
          .content.summary,
        content.summary,
      );
      await workingSave(
        req("/api/resumes/working", {
          draftId: draft.id,
          content,
          coverLetter: "Older request",
          template: "classic",
          revision: revision - 1,
        }),
      );
      const restored = await (
        await workingGet(
          new Request(
            "http://localhost/api/resumes/working?draftId=working-source",
          ),
        )
      ).json();
      assert.equal(restored.copy.content.summary, revised.summary);
      const report = await readability(new Request("http://localhost"), {
        params: Promise.resolve({ id: draft.id }),
      });
      assert.equal(report.status, 200);
      const checked = await report.json();
      assert.equal(checked.selectableText, true);
      assert.match(checked.extractedText, /Workflow Test Candidate/);
      assert.match(checked.notice, /not an ATS score/);
      assert.equal(
        (
          await attach(req("/", {}), {
            params: Promise.resolve({ id: draft.id }),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await updateApplication(
            req("/api/applications", {
              id: application.id,
              status: "Submitted", submissionConfirmed:true,
            }),
          )
        ).status,
        200,
      );
      const submitted = (await database
        .collection("applications")
        .findOne({ id: application.id }))!;
      assert.equal(submitted.documentSnapshot.cv.id, draft.id);
      const newer = await (
        await saveResume(
          req("/api/resumes", {
            action: "save",
            draftId: draft.id,
            content: revised,
            coverLetter: "New unrelated edit",
            template: "classic",
          }),
        )
      ).json();
      assert.ok(newer.id);
      await updateApplication(
        req("/api/applications", { id: application.id, status: "Saved" }),
      );
      assert.equal(
        (
          await attach(req("/", {}), {
            params: Promise.resolve({ id: newer.id }),
          })
        ).status,
        409,
      );
      const unchanged = (await database
        .collection("applications")
        .findOne({ id: application.id }))!;
      assert.equal(unchanged.documentSnapshot.cv.id, draft.id);
      assert.equal(unchanged.coverLetter, "Original cover letter");
      const pdf = await document(new Request("http://localhost"), {
        params: Promise.resolve({ id: application.id }),
      });
      assert.equal(pdf.status, 200);
      const extracted = await extractCv(
        new File([await pdf.arrayBuffer()], "snapshot.pdf", {
          type: "application/pdf",
        }),
      );
      assert.doesNotMatch(extracted, /Edited text awaiting/);
      assert.equal(
        (
          await saveSearch(
            req("/api/job-searches", {
              name: "Remote Nigeria",
              url: "https://ng.indeed.com/jobs?q=react+remote",
            }),
          )
        ).status,
        200,
      );
      assert.equal((await (await searches()).json()).length, 1);
    } finally {
      await database.dropDatabase();
      await client.close();
      await closeDb();
      if (uri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = uri;
      if (dbName === undefined) delete process.env.MONGODB_DB;
      else process.env.MONGODB_DB = dbName;
    }
  },
);
