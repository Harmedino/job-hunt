import { isolateAiEnv } from "./helpers/ai-env";
isolateAiEnv();
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import {
  POST as createResume,
  GET as listResumes,
} from "../src/app/api/resumes/route";
import { GET as readResume } from "../src/app/api/resumes/[id]/route";
import { GET as exportResume } from "../src/app/api/resumes/[id]/pdf/route";
import { GET as exportDocuments } from "../src/app/api/resumes/[id]/export/route";
import { POST as attachResume } from "../src/app/api/resumes/[id]/attach/route";
import { POST as discoverJobs } from "../src/app/api/discover/route";
import {
  POST as saveApplication,
  PATCH as updateApplication,
} from "../src/app/api/applications/route";
import { GET as applicationPdf } from "../src/app/api/documents/[id]/route";
import { PUT as saveProfile } from "../src/app/api/profile/route";
import { db, closeDb } from "../src/lib/db";
import { emptyProfile } from "../src/lib/types";
import { extractCv } from "../src/lib/cv";
const enabled = !!process.env.TEST_MONGODB_URI;
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
process.env.MONGODB_DB = "job_hunt_resumes_test_" + process.pid;
delete process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;
const request = (body: unknown) =>
  new Request("http://localhost/api/resumes", {
    method: "POST",
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
after(async () => {
  globalThis.fetch = originalFetch;
  await closeDb();
  if (enabled) {
    const client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    await client.db(process.env.MONGODB_DB).dropDatabase();
    await client.close();
  }
});
test(
  "CV builder generates from a pasted description, saves immutable edits and exports the chosen version",
  { skip: !enabled, timeout: 30000 },
  async () => {
    const profile = {
      ...emptyProfile,
      name: "Resume Test Applicant",
      email: "resume@example.org",
      skills: "React, TypeScript",
      experience: "Built a React dashboard at Example Co.",
      education: "BSc Computer Science",
    };
    await saveProfile(request(profile));
    globalThis.fetch = async () => {
      throw new Error(
        "A pasted-description CV must not depend on live sources or AI.",
      );
    };
    const result = await createResume(
      request({
        action: "generate",
        useAi: false,
        target: {
          title: "Frontend Developer",
          company: "Fixture Company",
          description:
            "Build accessible React interfaces. TypeScript and Kubernetes experience required.",
          url: "",
        },
      }),
    );
    assert.equal(result.status, 200);
    const first = await result.json();
    assert.match(first.content.summary, /React, TypeScript/);
    assert.doesNotMatch(JSON.stringify(first.content), /Kubernetes/);
    const edited = await createResume(
      request({
        action: "save",
        draftId: first.id,
        coverLetter: "My edited cover letter with React experience.",
        template: "compact",
        content: {
          ...first.content,
          summary: "React and TypeScript frontend skills.",
        },
      }),
    );
    assert.equal(edited.status, 200);
    const second = await edited.json();
    assert.notEqual(first.id, second.id);
    assert.equal(first.familyId, second.familyId);
    assert.equal(second.previousId, first.id);
    assert.equal(second.template, "compact");
    const word = await exportDocuments(
      new Request(
        "http://localhost/api/resumes/export?document=letter&format=docx",
      ),
      params(second.id),
    );
    assert.equal(word.status, 200);
    assert.match(
      await extractCv(
        new File([new Uint8Array(await word.arrayBuffer())], "letter.docx"),
      ),
      /My edited cover letter with React experience/,
    );
    assert.equal(
      (
        await exportDocuments(
          new Request(
            "http://localhost/api/resumes/export?document=bad&format=html",
          ),
          params(second.id),
        )
      ).status,
      400,
    );

    assert.equal(
      (
        await (
          await readResume(new Request("http://localhost"), params(first.id))
        ).json()
      ).content.summary,
      first.content.summary,
    );
    const pdf = await exportResume(
      new Request("http://localhost"),
      params(second.id),
    );
    assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
    const text = await extractCv(
      new File([new Uint8Array(await pdf.arrayBuffer())], "tailored.pdf"),
    );
    assert.match(text, /React and TypeScript frontend skills/);
    const list = await (await listResumes()).json();
    assert.equal(list.drafts.length, 2);
    assert.equal(list.drafts[0].profileSnapshot, undefined);
    assert.equal(list.drafts[0].content, undefined);
    assert.equal(
      (await (await db()).collection("profile").findOne({ key: "owner" }))
        ?.profile.experience,
      profile.experience,
    );
    assert.equal(
      (
        await createResume(
          request({
            action: "save",
            draftId: { $ne: null },
            content: first.content,
          }),
        )
      ).status,
      400,
    );
  },
);
test(
  "a job-specific saved CV attaches to its application and submitted versions stay unchanged",
  { skip: !enabled, timeout: 30000 },
  async () => {
    globalThis.fetch = async (input) =>
      String(input).includes("remotive.com")
        ? Response.json({
            jobs: [
              {
                title: "Junior React Developer",
                company_name: "Builder Application Fixture",
                candidate_required_location: "Worldwide",
                description:
                  "Build accessible React and TypeScript web interfaces for a fully remote team.",
                url: "https://remotive.com/remote-jobs/builder-fixture",
                publication_date: new Date().toISOString(),
              },
            ],
          })
        : new Response("", { status: 503 });
    const discovered = await (await discoverJobs()).json();
    const application = await (
      await saveApplication(request({ jobId: discovered.jobs[0].id }))
    ).json();
    const draft = await (
      await createResume(
        request({
          action: "generate",
          useAi: false,
          jobId: application.job.id,
          applicationId: application.id,
        }),
      )
    ).json();
    assert.equal(draft.target.applicationId, application.id);
    assert.equal(
      (await attachResume(request({}), params(draft.id))).status,
      200,
    );
    const linked = await (
      await db()
    )
      .collection("applications")
      .findOne({ id: application.id });
    assert.equal(linked?.cvDraftId, draft.id);
    assert.equal(linked?.status, "Ready for review");
    assert.equal(linked?.coverLetter, draft.coverLetter);
    const pdf = await applicationPdf(
      new Request("http://localhost"),
      params(application.id),
    );
    assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
    await updateApplication(
      request({ id: application.id, status: "Submitted", submissionConfirmed:true }),
    );
    const next = await (
      await createResume(
        request({
          action: "save",
          draftId: draft.id,
          coverLetter: "A new letter after submission.",
          content: {
            ...draft.content,
            summary: "An edited version after submission.",
          },
        }),
      )
    ).json();
    assert.equal(
      (await attachResume(request({}), params(next.id))).status,
      409,
    );
    assert.equal(
      (
        await (
          await db()
        )
          .collection("applications")
          .findOne({ id: application.id })
      )?.cvDraftId,
      draft.id,
    );
    const original = await (
      await readResume(new Request("http://localhost"), params(draft.id))
    ).json();
    assert.equal(original.content.summary, draft.content.summary);
    assert.equal(original.coverLetter, draft.coverLetter);
    assert.equal(
      (
        await (
          await db()
        )
          .collection("applications")
          .findOne({ id: application.id })
      )?.coverLetter,
      draft.coverLetter,
    );
  },
);
test(
  "missing AI credentials and invalid input do not save a misleading AI CV",
  { skip: !enabled },
  async () => {
    const collection = (await db()).collection("resumes");
    const before = await collection.countDocuments();
    const response = await createResume(
      request({
        action: "generate",
        useAi: true,
        target: {
          title: "React Developer",
          company: "Fixture",
          description:
            "Create accessible React applications for a global remote company.",
          url: "",
        },
      }),
    );
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /OPENAI_API_KEY/);
    assert.equal(await collection.countDocuments(), before);
  },
);

test(
  "cleaned legacy CV saves a new layout while historical exports keep the original version",
  { skip: !enabled, timeout: 30000 },
  async () => {
    const { profileResume } = await import("../src/lib/resume-builder");
    const { cleanResumeLayout } = await import("../src/lib/resume-layout");
    const { projects, extras } = await import("./helpers/section-cv");
    const target = {
      title: "Frontend Developer",
      company: "Fixture",
      description: "Build accessible React interfaces for a remote team.",
      url: "",
    };
    const profile = {
      ...emptyProfile,
      name: "Legacy Layout Test",
      email: "layout@example.org",
      skills: "React",
    };
    const content = {
      ...profileResume(profile, target),
      projects: projects + "\n" + extras,
      additional: "LEGACY SOURCE HEADER\nRepeated source text.",
    };
    const database = await db();
    await database
      .collection("resumes")
      .insertOne({
        id: "legacy-layout-fixture",
        familyId: "legacy-layout-fixture",
        createdAt: new Date().toISOString(),
        content,
        target,
        profileSnapshot: profile,
        evidence: [],
        method: "Legacy fixture",
        warnings: [],
        requirementsToReview: [],
        manualEdits: false,
      });
    const cleaned = await createResume(
      request({
        action: "save",
        draftId: "legacy-layout-fixture",
        content: cleanResumeLayout(content),
      }),
    );
    assert.equal(cleaned.status, 200);
    const version = await cleaned.json();
    assert.equal(version.layoutVersion, 2);
    assert.equal(version.previousId, "legacy-layout-fixture");
    assert.equal(version.content.additional, undefined);
    assert.doesNotMatch(version.content.projects, /OPEN.SOURCE|TRAINING/);
    assert.match(version.content.contributions, /Community Code Event/);
    const original = await (
      await readResume(
        new Request("http://localhost"),
        params("legacy-layout-fixture"),
      )
    ).json();
    assert.equal(original.content.additional, content.additional);
    for (const [id, legacy] of [
      ["legacy-layout-fixture", true],
      [version.id, false],
    ] as const) {
      const pdf = await exportResume(
        new Request("http://localhost"),
        params(id),
      );
      const text = await extractCv(
        new File([new Uint8Array(await pdf.arrayBuffer())], "cv.pdf"),
      );
      if (legacy) assert.match(text, /LEGACY SOURCE HEADER/);
      else
        assert.doesNotMatch(
          text,
          /LEGACY SOURCE HEADER|ADDITIONAL QUALIFICATIONS/,
        );
    }
  },
);
