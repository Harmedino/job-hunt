import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { emptyProfile } from "../src/lib/types";
import {
  emptyCareerRecord,
  validateCareerRecords,
  materializeCareerProfile,
  formatCareerRecord,
  validateNysc,
  nyscCvText,
} from "../src/lib/career-records";
import { validateCustomFields } from "../src/lib/custom-fields";
import {
  suggestJobKeywords,
  keywordEvidence,
  validateKeywords,
} from "../src/lib/job-keywords";
import { validateManualJob, suggestManualJob } from "../src/lib/manual-jobs";
import {
  matchesSearchPreset,
  validateJobFilters,
} from "../src/lib/job-filter-state";
import { closeDb } from "../src/lib/db";
import {
  POST as saveManual,
  PATCH as editManual,
  GET as manualJobs,
} from "../src/app/api/manual-jobs/route";
import { POST as saveApplication } from "../src/app/api/applications/route";
import {
  PUT as saveProfile,
  GET as loadProfile,
} from "../src/app/api/profile/route";
import { GET as profileHistory } from "../src/app/api/profile/history/route";
const req = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("structured records retain exact contexts, unknown dates and separate confirmed NYSC inclusion", () => {
  const employment = {
      ...emptyCareerRecord("work-1"),
      confirmed: true,
      organization: "Fictional Interface Studio",
      title: "Frontend Developer",
      start: "2023-04",
      end: "2025-08",
      responsibilities: "Built React forms.\nIntegrated documented APIs.",
      technologies: "React, TypeScript",
    },
    project = {
      ...emptyCareerRecord("project-1"),
      confirmed: true,
      name: "Fictional Node API",
      description: "Implemented Express validation.",
      technologies: "Node.js, Express, MongoDB",
    };
  const careerRecords = validateCareerRecords({
    employment: [employment],
    projects: [project],
  });
  assert.match(
    formatCareerRecord(employment, "employment"),
    /Fictional Interface Studio — Frontend Developer\n2023-04 – 2025-08/,
  );
  assert.equal(
    materializeCareerProfile({
      ...emptyProfile,
      experience: "Original text kept privately",
      careerRecords,
    }).experience.includes("Built React forms."),
    true,
  );
  assert.equal(
    materializeCareerProfile({
      ...emptyProfile,
      experience: "Original text",
      careerRecords: { employment: [{ ...employment, confirmed: false }] },
    }).experience,
    "Original text",
  );
  assert.throws(
    () =>
      validateCareerRecords({
        employment: [{ ...employment, end: "2023-02" }],
      }),
    /end date/,
  );
  assert.equal(
    validateCareerRecords({ projects: [{ ...project, start: "", end: "" }] })
      .projects![0].start,
    "",
  );
  assert.equal(
    nyscCvText(
      {
        ...emptyProfile,
        nysc: {
          status: "Completed",
          confirmed: true,
          completionDate: "2025-01-01",
          details: "",
        },
      },
      false,
    ),
    "",
  );
  assert.throws(
    () =>
      nyscCvText(
        {
          ...emptyProfile,
          nysc: {
            status: "Completed",
            confirmed: false,
            completionDate: "",
            details: "",
          },
        },
        true,
      ),
    /Confirm/,
  );
  assert.equal(
    nyscCvText(
      {
        ...emptyProfile,
        nysc: validateNysc({
          status: "Completed",
          confirmed: true,
          completionDate: "2025-01-01",
          details: "",
        }),
      },
      true,
    ),
    "NYSC Status: Completed\nCompletion date: 2025-01-01",
  );
  assert.throws(() =>
    validateNysc({
      status: "Completed",
      confirmed: true,
      completionDate: "2099-01-01",
      details: "",
    }),
  );
});
test("keywords, custom fields and manual jobs do not invent qualification or vacancy evidence", () => {
  const keywords = suggestJobKeywords(
    "Required: React and TypeScript.\nPreferred: Angular and MongoDB.",
  );
  assert.equal(keywords.find((k) => k.text === "Angular")?.kind, "preferred");
  const checks = keywordEvidence(keywords, {
    ...emptyProfile,
    skills: "React, TypeScript",
  });
  assert.equal(checks.find((k) => k.text === "Angular")?.supported, false);
  assert.throws(() =>
    validateKeywords([
      { id: "x", text: { $gt: "" }, kind: "required", priority: 3 },
    ]),
  );
  assert.throws(() =>
    validateCustomFields([
      { id: "x", name: "Tool", value: { $set: "bad" }, confirmed: true },
    ]),
  );
  const manual = validateManualJob({ title: "Developer" });
  assert.equal(manual.url, "");
  assert.equal(manual.postedAt, "");
  assert.equal(manual.eligibility, "review");
  assert.equal(manual.salary, "");
  assert.equal(manual.company, "");
  const suggestion = suggestManualJob(
    "Position: React Developer\nCompany: Fictional Studio\nRequired: React.",
  );
  assert.equal(suggestion.title, "React Developer");
  assert.equal(suggestion.url, "");
  assert.equal(
    matchesSearchPreset(
      { title: "Backend Developer", description: "Node.js and Express APIs" },
      validateJobFilters({
        technologies: "Node.js, React",
        excludedKeywords: "Java",
      }),
    ),
    true,
  );
  assert.equal(
    matchesSearchPreset(
      { title: "Java Developer", description: "Java Spring" },
      validateJobFilters({ excludedKeywords: "Java" }),
    ),
    false,
  );
});
test(
  "manual jobs persist and track without a feed; profile history and stale-save protection preserve career data",
  { skip: !process.env.TEST_MONGODB_URI, timeout: 30000 },
  async () => {
    const oldUri = process.env.MONGODB_URI,
      oldDb = process.env.MONGODB_DB;
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = "career_records_" + process.pid;
    const client = new MongoClient(process.env.TEST_MONGODB_URI!);
    const database = client.db(process.env.MONGODB_DB);
    try {
      const profile = {
        ...emptyProfile,
        name: "Fictional Career Candidate",
        email: "candidate@example.org",
        experience: "Legacy employment dates and wording remain available.",
      };
      assert.equal((await saveProfile(req(profile))).status, 200);
      const loaded = await (await loadProfile()).json();
      const record = {
        ...emptyCareerRecord("work1"),
        organization: "Fictional Studio",
        title: "Developer",
        confirmed: true,
      };
      const next = await (
        await saveProfile(
          req({
            ...loaded,
            careerRecords: { employment: [record] },
            customFields: [
              {
                id: "c",
                name: "Confirmed detail",
                value: "Actual work",
                confirmed: true,
              },
            ],
          }),
        )
      ).json();
      assert.equal(next.experience, profile.experience);
      assert.equal(
        (await saveProfile(req({ ...loaded, name: "Stale overwrite" }))).status,
        409,
      );
      assert.equal((await (await loadProfile()).json()).name, profile.name);
      const history = await (
        await profileHistory(new Request("http://localhost"))
      ).json();
      assert.equal(history[0].profile.experience, profile.experience);
      assert.equal(history[0].profile.careerRecords, undefined);
      const saved = await (
        await saveManual(
          req({
            title: "React Developer",
            company: "Fictional Studio",
            description:
              "Build React forms using TypeScript and documented API integrations.",
          }),
        )
      ).json();
      assert.equal(saved.manual, true);
      assert.equal(saved.url, "");
      assert.equal((await (await manualJobs()).json()).length, 1);
      assert.equal(await database.collection("jobs").countDocuments({}), 0);
      const edit = await editManual(
        req({
          id: saved.id,
          updatedAt: saved.updatedAt,
          title: "Angular Developer",
          description:
            "Build Angular forms using TypeScript and actual API integrations.",
        }),
      );
      assert.equal(edit.status, 200);
      const app = await (
        await saveApplication(req({ jobId: saved.id }))
      ).json();
      assert.equal(app.job.title, "Angular Developer");
      assert.equal(app.job.postedAt, "");
      assert.equal(app.status, "Saved");
      const other = await (
        await saveManual(
          req({ title: "Node.js Developer", company: "Fictional Studio" }),
        )
      ).json();
      const second = await (
        await saveApplication(req({ jobId: other.id }))
      ).json();
      assert.notEqual(second.id, app.id);
      assert.equal(
        await database.collection("applications").countDocuments({}),
        2,
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
