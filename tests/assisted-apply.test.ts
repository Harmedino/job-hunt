import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { closeDb } from "../src/lib/db";
import {
  greenhouseTarget,
  mapField,
  verifyForm,
  type AssistedPackage,
  type FormField,
} from "../src/lib/assisted-apply";
import {
  approveAttempt,
  attemptCommand,
  bankAnswers,
  digest,
  loadAttempt,
  saveAnswer,
} from "../src/lib/assisted-store";
import { emptyProfile, type Application } from "../src/lib/types";
import type { ResumeDraft } from "../src/lib/resume-types";
import {
  createHandoff,
  consumeHandoff,
  authenticateCompanion,
} from "../src/lib/assisted-handoff";
import { POST as companionCommand } from "../src/app/api/assisted-companion/[id]/route";
import { proposeMappings } from "../src/lib/assisted-mapping";
const target = greenhouseTarget(
  "https://boards.greenhouse.io/testfixture/jobs/123?gh_src=tracking",
);
const file = {
  kind: "cv" as const,
  name: "test.pdf",
  mime: "application/pdf",
  size: 3,
  sha256: digest("pdf"),
  base64: Buffer.from("pdf").toString("base64"),
};
const pack: AssistedPackage = {
  version: 1,
  id: "fixture",
  applicationId: "app",
  draftId: "cv",
  approvedAt: "2026-11-10T00:00:00.000Z",
  target,
  company: "Fictional test company",
  title: "Developer",
  facts: {
    firstName: "Test",
    lastName: "Candidate",
    email: "test@example.org",
  },
  files: [file],
  answers: [
    {
      id: "work-answer",
      question: "Are you authorized to work in the United States?",
      answer: "No",
      vacancyKey: target.key,
      confirmedAt: "2026-11-10",
    },
  ],
};
const field = (
  id: string,
  label: string,
  value: string,
  extras: Partial<FormField> = {},
): FormField => ({
  id,
  label,
  value,
  required: true,
  kind: "text",
  valid: true,
  disabled: false,
  ...extras,
});
const fields = () => [
  field("first_name", "First Name", "Test"),
  field("last_name", "Last Name", "Candidate"),
  field("email", "Email", "test@example.org"),
  field("resume", "Resume/CV", "", {
    kind: "file",
    files: [
      {
        name: file.name,
        size: file.size,
        sha256: file.sha256,
        mime: file.mime,
      },
    ],
  }),
];
test("Greenhouse target binding rejects lookalike domains, other jobs, embedded links and credentials", () => {
  assert.equal(
    target.url,
    "https://job-boards.greenhouse.io/testfixture/jobs/123",
  );
  for (const url of [
    "http://boards.greenhouse.io/test/jobs/1",
    "https://boards.greenhouse.io.evil.org/test/jobs/1",
    "https://user:password@boards.greenhouse.io/test/jobs/1",
    "https://boards.greenhouse.io:444/test/jobs/1",
    "https://boards.greenhouse.io/embed/job_app?token=1",
    "https://job-boards.greenhouse.io/test",
  ])
    assert.throws(() => greenhouseTarget(url));
  assert.equal(
    verifyForm(pack, {
      url: target.url.replace("123", "124"),
      fields: fields(),
      challenge: "",
      unsupported: "",
    }).ready,
    false,
  );
});
test("field mapping uses verified facts and exact vacancy-scoped private answers, never inferred authorization", () => {
  assert.equal(
    mapField(field("first_name", "First Name *", ""), pack).value,
    "Test",
  );
  assert.equal(
    mapField(field("first_name", "Work authorization", ""), pack).value,
    undefined,
  );
  assert.equal(
    mapField(
      field(
        "question_1",
        "Are you authorized to work in the United States?",
        "",
      ),
      pack,
    ).value,
    "No",
  );
  assert.equal(
    mapField(
      field("question_1", "Are you authorized to work in the UK?", ""),
      pack,
    ).value,
    undefined,
  );
  assert.equal(
    mapField(
      field("question_1", "How many years of SOC experience do you have?", ""),
      pack,
    ).value,
    undefined,
  );
  const other = {
    ...pack,
    target: greenhouseTarget("https://job-boards.greenhouse.io/other/jobs/123"),
  };
  assert.equal(
    mapField(field("q", pack.answers[0].question, ""), other).value,
    undefined,
  );
});
test("verification checks every value, file bytes, required fields, challenges and unknown prefilled answers", () => {
  const input = {
    url: target.url,
    challenge: "",
    unsupported: "",
    fields: fields(),
  };
  assert.equal(verifyForm(pack, input).ready, true);
  assert.equal(
    verifyForm(pack, {
      ...input,
      fields: [...fields(), field("q", "Experience", "Five years")],
    }).ready,
    false,
  );
  assert.equal(
    verifyForm(
      pack,
      { ...input, fields: [...fields(), field("q", "Experience", "Beginner")] },
      ["q"],
    ).ready,
    true,
  );
  assert.equal(
    verifyForm(
      pack,
      { ...input, fields: [...fields(), field("q", "Required answer", "")] },
      ["q"],
    ).ready,
    false,
  );
  assert.equal(
    verifyForm(pack, { ...input, challenge: "Complete CAPTCHA yourself." })
      .ready,
    false,
  );
  assert.equal(
    verifyForm(pack, {
      ...input,
      fields: fields().map((f) =>
        f.id === "email" ? { ...f, value: "wrong@example.org" } : f,
      ),
    }).ready,
    false,
  );
  assert.equal(
    verifyForm(pack, {
      ...input,
      fields: fields().map((f) =>
        f.id === "resume"
          ? {
              ...f,
              files: [
                {
                  name: file.name,
                  size: 3,
                  sha256: digest("bad"),
                  mime: file.mime,
                },
              ],
            }
          : f,
      ),
    }).ready,
    false,
  );
  assert.equal(
    verifyForm(pack, {
      ...input,
      fields: fields().filter((f) => f.id !== "resume"),
    }).ready,
    false,
  );
  assert.equal(
    verifyForm(pack, { ...input, fields: [...fields(), fields()[0]] }).ready,
    false,
  );
});
test("Assisted Apply pages, packages, commands and answer bank use existing production authentication and origin protection", () => {
  const before = process.env.APP_PASSWORD,
    node = process.env.NODE_ENV;
  process.env.APP_PASSWORD = "test-only-password";
  Reflect.set(process.env, "NODE_ENV", "production");
  try {
    for (const path of [
      "/api/assisted-apply",
      "/api/assisted-apply/answers",
      "/api/assisted-apply/attempt/package",
      "/api/assisted-apply/attempt",
    ])
      assert.equal(
        proxy(new NextRequest(`https://example.org${path}`)).status,
        401,
      );
  } finally {
    if (before === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = before;
    Reflect.set(process.env, "NODE_ENV", node);
  }
});
test(
  "immutable packages, atomic duplicate protection, leases, verified submission and conservative recovery preserve existing records",
  { skip: !process.env.TEST_MONGODB_URI },
  async (t) => {
    const uri = process.env.TEST_MONGODB_URI!,
      name = `assisted_test_${randomUUID().replaceAll("-", "")}`,
      client = await new MongoClient(uri).connect();
    const previous = [process.env.MONGODB_URI, process.env.MONGODB_DB];
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = name;
    const database = client.db(name);
    const profile = {
      ...emptyProfile,
      name: "Test Candidate",
      email: "test@example.org",
      skills: "React",
      experience: "Actual developer experience",
    };
    let number = 1000;
    async function fixture() {
      const id = String(++number),
        url = `https://job-boards.greenhouse.io/fictionalfixture/jobs/${id}`;
      const job: Application["job"] = {
        id: `job-${id}`,
        title: "Developer",
        company: "Fictional Fixture",
        url,
        description: "Fictional test vacancy only",
        location: "Worldwide",
        source: "Greenhouse",
        eligibility: "eligible",
        eligibilityReason: "Fixture",
        salary: "",
        postedAt: "",
        discoveredAt: new Date().toISOString(),
        score: 80,
        matchedSkills: ["React"],
      };
      const app: Application = {
        id: `app-${id}`,
        job,
        status: "Saved",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        followUp: "Original notes",
      };
      const draft: ResumeDraft = {
        id: `cv-${id}`,
        familyId: `family-${id}`,
        createdAt: new Date().toISOString(),
        target: {
          title: job.title,
          company: job.company,
          description: job.description,
          url,
        },
        content: { ...profile, summary: "Actual development skills" },
        profileSnapshot: profile,
        evidence: [],
        method: "Basic",
        warnings: [],
        requirementsToReview: [],
        manualEdits: false,
        layoutVersion: 2,
      };
      await database.collection("applications").insertOne(app);
      await database.collection("resumes").insertOne(draft);
      return {
        app,
        draft,
        body: {
          applicationId: app.id,
          draftId: draft.id,
          approved: true,
          verifiedFacts: ["firstName", "lastName", "email"],
          firstName: "Test",
          lastName: "Candidate",
        },
      };
    }
    try {
      await t.test(
        "simultaneous approvals create one active attempt and freeze exact bytes without modifying source data",
        async () => {
          const f = await fixture(),
            results = await Promise.allSettled([
              approveAttempt(f.body),
              approveAttempt(f.body),
            ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          const a = await loadAttempt(
            (
              results.find(
                (r) => r.status === "fulfilled",
              ) as PromiseFulfilledResult<
                Awaited<ReturnType<typeof approveAttempt>>
              >
            ).value.id,
          );
          const bytes = Buffer.from(a.package.files[0].base64, "base64");
          assert.equal(digest(bytes), a.package.files[0].sha256);
          assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
          await database
            .collection("resumes")
            .updateOne(
              { id: f.draft.id },
              { $set: { "content.summary": "Changed after approval" } },
            );
          assert.equal(
            (await loadAttempt(a.id)).draft.content.summary,
            "Actual development skills",
          );
          assert.equal(
            (await database
              .collection("applications")
              .findOne({ id: f.app.id }))!.followUp,
            "Original notes",
          );
          assert.equal(
            (await database
              .collection("applications")
              .findOne({ id: f.app.id }))!.status,
            "Saved",
          );
          await database
            .collection("assisted_attempts")
            .updateOne(
              { id: a.id },
              { $set: { "package.facts.email": "tampered@example.org" } },
            );
          await assert.rejects(loadAttempt(a.id), /integrity/);
        },
      );
      await t.test(
        "only one companion claim wins and release/expiry require fresh verification",
        async () => {
          const f = await fixture(),
            a = await approveAttempt(f.body);
          const claims = await Promise.allSettled([
            attemptCommand(a.id, { action: "claim" }),
            attemptCommand(a.id, { action: "claim" }),
          ]);
          assert.equal(
            claims.filter((r) => r.status === "fulfilled").length,
            1,
          );
          const token = (
            claims.find(
              (r) => r.status === "fulfilled",
            ) as PromiseFulfilledResult<{ leaseToken: string }>
          ).value.leaseToken;
          await assert.rejects(
            attemptCommand(a.id, {
              action: "submit-intent",
              leaseToken: token,
              confirmed: true,
            }),
            /fresh/,
          );
          await attemptCommand(a.id, { action: "release", leaseToken: token });
          await assert.rejects(
            attemptCommand(a.id, { action: "heartbeat", leaseToken: token }),
            /expired/,
          );
          assert.ok(
            "leaseToken" in (await attemptCommand(a.id, { action: "claim" })),
          );
        },
      );
      await t.test(
        "submission intent survives crash, cannot be retried or downgraded, and recovery requires evidence",
        async () => {
          const f = await fixture(),
            a = await approveAttempt(f.body),
            claim = (await attemptCommand(a.id, { action: "claim" })) as {
              leaseToken: string;
            };
          const saved = await loadAttempt(a.id),
            report = {
              url: saved.package.target.url,
              challenge: "",
              unsupported: "",
              fields: fields().map((x) =>
                x.id === "resume"
                  ? {
                      ...x,
                      files: saved.package.files.map((y) => ({
                        name: y.name,
                        size: y.size,
                        sha256: y.sha256,
                        mime: y.mime,
                      })),
                    }
                  : x,
              ),
            };
          const ready = (await attemptCommand(a.id, {
            action: "verify",
            leaseToken: claim.leaseToken,
            manualReviewed: [],
            report,
          })) as { reportHash: string; state: string };
          assert.equal(ready.state, "verified-ready");
          await assert.rejects(
            attemptCommand(a.id, {
              action: "submit-intent",
              leaseToken: claim.leaseToken,
              reportHash: ready.reportHash,
            }),
            /explicit/,
          );
          await attemptCommand(a.id, {
            action: "submit-intent",
            leaseToken: claim.leaseToken,
            reportHash: ready.reportHash,
            confirmed: true,
          });
          await attemptCommand(a.id, {
            action: "failure",
            leaseToken: claim.leaseToken,
            reason: "Browser disconnected after intent",
          });
          assert.equal((await loadAttempt(a.id)).state, "uncertain-submission");
          await assert.rejects(
            attemptCommand(a.id, {
              action: "verify",
              leaseToken: claim.leaseToken,
              manualReviewed: [],
              report,
            }),
            /Reconcile/,
          );
          await attemptCommand(a.id, {
            action: "release",
            leaseToken: claim.leaseToken,
          });
          await assert.rejects(
            attemptCommand(a.id, { action: "claim" }),
            /uncertain/,
          );
          await assert.rejects(
            attemptCommand(a.id, {
              action: "reconcile",
              confirmed: true,
              outcome: "not-submitted",
              reason: "No",
            }),
            /ten/,
          );
          await attemptCommand(a.id, {
            action: "reconcile",
            confirmed: true,
            outcome: "not-submitted",
            reason:
              "Employer confirmed no application exists; retry authorized.",
          });
          assert.equal((await loadAttempt(a.id)).state, "awaiting-user");
          assert.equal((await loadAttempt(a.id)).submissionIntentAt, undefined);
          assert.equal(
            (await database
              .collection("applications")
              .findOne({ id: f.app.id }))!.submittedAt,
            undefined,
          );
        },
      );
      await t.test(
        "confirmed receipt links exact frozen documents once and keeps application notes",
        async () => {
          const f = await fixture(),
            a = await approveAttempt(f.body),
            claim = (await attemptCommand(a.id, { action: "claim" })) as {
              leaseToken: string;
            };
          const saved = await loadAttempt(a.id),
            report = {
              url: saved.package.target.url,
              challenge: "",
              unsupported: "",
              fields: fields().map((x) =>
                x.id === "resume"
                  ? {
                      ...x,
                      files: saved.package.files.map((y) => ({
                        name: y.name,
                        size: y.size,
                        sha256: y.sha256,
                        mime: y.mime,
                      })),
                    }
                  : x,
              ),
            };
          const ready = (await attemptCommand(a.id, {
            action: "verify",
            leaseToken: claim.leaseToken,
            manualReviewed: [],
            report,
          })) as { reportHash: string };
          await attemptCommand(a.id, {
            action: "submit-intent",
            leaseToken: claim.leaseToken,
            reportHash: ready.reportHash,
            confirmed: true,
          });
          await assert.rejects(
            attemptCommand(a.id, {
              action: "receipt",
              leaseToken: claim.leaseToken,
              url: report.url,
              text: "Submit application",
            }),
            /remains uncertain/,
          );
          for (const url of [
            report.url.replace(/\d+$/, "999999"),
            report.url.replace("fictionalfixture", "other-board"),
            "https://unrelated.example/thanks",
          ])
            await assert.rejects(
              attemptCommand(a.id, {
                action: "receipt",
                leaseToken: claim.leaseToken,
                url,
                text: "Thank you for applying! Your application has been received.",
              }),
              /remains uncertain/,
            );
          assert.equal((await loadAttempt(a.id)).state, "uncertain-submission");
          await attemptCommand(a.id, {
            action: "receipt",
            leaseToken: claim.leaseToken,
            url:
              report.url.replace(
                "job-boards.greenhouse.io",
                "boards.greenhouse.io",
              ) + "/confirmation",
            text: "Thank you for applying! Your application has been received.",
          });
          const app = await database
            .collection<Application>("applications")
            .findOne({ id: f.app.id });
          assert.equal(app!.status, "Submitted");
          assert.equal(app!.cvDraftId, f.draft.id);
          assert.equal(app!.assistedSubmission!.source, "browser-observed");
          assert.equal(app!.followUp, "Original notes");
          assert.equal(
            app!.documentSnapshot!.files![0].sha256,
            saved.package.files[0].sha256,
          );
          const stored = await database
            .collection("application_files")
            .findOne({ id: app!.documentSnapshot!.files![0].id });
          assert.equal(
            digest(Buffer.from(stored!.data.value())),
            saved.package.files[0].sha256,
          );
          await assert.rejects(approveAttempt(f.body), /not been submitted/);
          await assert.rejects(
            attemptCommand(a.id, { action: "claim" }),
            /confirmed/,
          );
        },
      );
      await t.test(
        "answer edits and deletion cannot mutate previously approved packages",
        async () => {
          const f = await fixture();
          await assert.rejects(
            saveAnswer({
              url: f.app.job.url,
              question: "Sponsorship?",
              answer: "No",
            }),
            /Confirm/,
          );
          await saveAnswer({
            url: f.app.job.url,
            question: "Sponsorship?",
            answer: "Yes",
            confirmed: true,
          });
          const a = await approveAttempt(f.body);
          await saveAnswer({
            url: f.app.job.url,
            question: "Sponsorship?",
            answer: "No",
            confirmed: true,
          });
          assert.equal(
            (await bankAnswers(greenhouseTarget(f.app.job.url).key))[0].answer,
            "No",
          );
          assert.equal(
            (await loadAttempt(a.id)).package.answers[0].answer,
            "Yes",
          );
        },
      );
      await t.test(
        "one-time handoffs bind origin, attempt, expiry and permissions",
        async () => {
          const f = await fixture(),
            a = await approveAttempt(f.body),
            ext = "a".repeat(32),
            code = await createHandoff(a.id, ext);
          const request = (token?: string, other = ext) =>
            new Request(
              "https://launchpad.example/api/assisted-companion/handoff",
              {
                method: "POST",
                headers: {
                  "x-launchpad-extension": other,
                  Origin: `chrome-extension://${other}`,
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              },
            );
          await assert.rejects(
            consumeHandoff(request(undefined, "b".repeat(32)), {
              token: code.token,
            }),
            /expired/,
          );
          const claim = (await consumeHandoff(request(), {
            token: code.token,
          })) as { leaseToken: string };
          await assert.rejects(
            consumeHandoff(request(), { token: code.token }),
            /already used/,
          );
          const scoped = request(claim.leaseToken);
          assert.equal(
            (await authenticateCompanion(scoped, a.id)).attempt.id,
            a.id,
          );
          const other = await approveAttempt((await fixture()).body);
          await assert.rejects(
            authenticateCompanion(scoped, other.id),
            /not authorized/,
          );
          await assert.rejects(
            authenticateCompanion(
              request(claim.leaseToken, "b".repeat(32)),
              a.id,
            ),
            /not authorized/,
          );
          const denied = await companionCommand(
            new Request(
              "https://launchpad.example/api/assisted-companion/" + a.id,
              {
                method: "POST",
                headers: Object.fromEntries(scoped.headers),
                body: JSON.stringify({ action: "claim" }),
              },
            ),
            { params: Promise.resolve({ id: a.id }) },
          );
          assert.equal(denied.status, 403);
          await attemptCommand(a.id, { action: "revoke", confirmed: true });
          await assert.rejects(
            authenticateCompanion(scoped, a.id),
            /not authorized/,
          );
          const expired = await createHandoff(other.id, ext);
          await database
            .collection("assisted_handoffs")
            .updateOne(
              { hash: digest(expired.token) },
              { $set: { expiresAt: new Date(0) } },
            );
          await assert.rejects(
            consumeHandoff(request(), { token: expired.token }),
            /expired/,
          );
        },
      );
      await t.test(
        "profile revisions invalidate answer memory and block stale-package handoffs",
        async () => {
          const f = await fixture();
          await saveAnswer({
            url: f.app.job.url,
            question: "Sponsorship?",
            answer: "Yes",
            confirmed: true,
          });
          const a = await approveAttempt(f.body);
          await database.collection("profile").insertOne({
            key: "owner",
            profile: { ...profile, name: "Changed profile name" },
          });
          assert.equal(
            (await bankAnswers(greenhouseTarget(f.app.job.url).key))[0]
              .invalidated,
            true,
          );
          await assert.rejects(
            attemptCommand(a.id, { action: "claim" }),
            /profile changed/,
          );
          assert.equal(
            (await loadAttempt(a.id)).package.answers[0].answer,
            "Yes",
          );
          await database.collection("profile").deleteOne({ key: "owner" });
        },
      );
      await t.test(
        "no provider never creates invented mapping proposals and leaves manual review available",
        async () => {
          const a = await approveAttempt((await fixture()).body),
            stored = await loadAttempt(a.id);
          stored.report = verifyForm(stored.package, {
            url: stored.package.target.url,
            challenge: "",
            unsupported: "",
            fields: [...fields(), field("q", "Unclear contact detail", "")],
          });
          const old = [
            process.env.AI_PROVIDER,
            process.env.GEMINI_API_KEY,
            process.env.OPENAI_API_KEY,
          ];
          delete process.env.GEMINI_API_KEY;
          delete process.env.OPENAI_API_KEY;
          process.env.AI_PROVIDER = "auto";
          try {
            await assert.rejects(proposeMappings(stored), /unavailable/);
          } finally {
            for (const [i, key] of [
              "AI_PROVIDER",
              "GEMINI_API_KEY",
              "OPENAI_API_KEY",
            ].entries())
              if (old[i] === undefined) delete process.env[key];
              else process.env[key] = old[i];
          }
        },
      );
      async function readyFixture() {
        const f = await fixture(),
          a = await approveAttempt(f.body),
          claim = (await attemptCommand(a.id, { action: "claim" })) as {
            leaseToken: string;
          },
          saved = await loadAttempt(a.id);
        const report = {
          url: saved.package.target.url,
          challenge: "",
          unsupported: "",
          fields: fields().map((x) =>
            x.id === "resume"
              ? {
                  ...x,
                  files: saved.package.files.map((y) => ({
                    name: y.name,
                    size: y.size,
                    sha256: y.sha256,
                    mime: y.mime,
                  })),
                }
              : x,
          ),
        };
        const ready = (await attemptCommand(a.id, {
          action: "verify",
          leaseToken: claim.leaseToken,
          manualReviewed: [],
          report,
        })) as { reportHash: string };
        return {
          f,
          a,
          body: {
            action: "submit-intent",
            leaseToken: claim.leaseToken,
            reportHash: ready.reportHash,
            confirmed: true,
          },
        };
      }
      await t.test(
        "a manually recorded submission after approval blocks a later companion click",
        async () => {
          const ready = await readyFixture();
          await database.collection("applications").insertOne({
            ...ready.f.app,
            _id: new ObjectId(),
            id: "outside-submission",
            job: {
              ...ready.f.app.job,
              id: "outside-job-alias",
              company: "Different imported employer label",
            },
            status: "Submitted",
            hasApplied: true,
            submittedAt: new Date().toISOString(),
          });
          await assert.rejects(
            attemptCommand(ready.a.id, ready.body),
            /submitted elsewhere/,
          );
          assert.equal(
            (await loadAttempt(ready.a.id)).submissionIntentAt,
            undefined,
          );
        },
      );
      await t.test(
        "concurrent different-vacancy intents cannot exceed the atomic daily budget",
        async () => {
          const one = await readyFixture(),
            two = await readyFixture(),
            counter = await database
              .collection("assisted_daily_limits")
              .findOne({});
          await database.collection("assistant_settings").updateOne(
            { key: "owner" },
            {
              $set: {
                policy: { maxPerDay: Number(counter?.count || 0) + 1 },
              },
            },
            { upsert: true },
          );
          const results = await Promise.allSettled([
            attemptCommand(one.a.id, one.body),
            attemptCommand(two.a.id, two.body),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            results.filter((r) => r.status === "rejected").length,
            1,
          );
          await database
            .collection("assistant_settings")
            .deleteOne({ key: "owner" });
        },
      );
      await t.test(
        "provider overload leaves no accepted mappings or successful cache and respects the opt-in budget",
        async () => {
          const a = await approveAttempt((await fixture()).body),
            stored = await loadAttempt(a.id);
          stored.report = verifyForm(stored.package, {
            url: stored.package.target.url,
            challenge: "",
            unsupported: "",
            fields: [
              ...fields(),
              field("unmapped", "Unclear contact detail", ""),
            ],
          });
          await database
            .collection("assistant_settings")
            .updateOne(
              { key: "owner" },
              { $set: { policy: { aiMaxCallsPerDay: 1 } } },
              { upsert: true },
            );
          const old = [
              process.env.AI_PROVIDER,
              process.env.GEMINI_API_KEY,
              process.env.GEMINI_MODEL,
            ],
            fetchBefore = globalThis.fetch;
          process.env.AI_PROVIDER = "gemini";
          process.env.GEMINI_API_KEY = "fictional-test-key";
          process.env.GEMINI_MODEL = "fixture-model";
          globalThis.fetch = async () => new Response("{}", { status: 503 });
          try {
            await assert.rejects(
              proposeMappings(stored),
              /503|unavailable|overloaded/,
            );
            assert.equal(
              await database
                .collection("assisted_mapping_cache")
                .countDocuments({}),
              0,
            );
            await assert.rejects(proposeMappings(stored), /limit/);
          } finally {
            globalThis.fetch = fetchBefore;
            for (const [i, key] of [
              "AI_PROVIDER",
              "GEMINI_API_KEY",
              "GEMINI_MODEL",
            ].entries())
              if (old[i] === undefined) delete process.env[key];
              else process.env[key] = old[i];
          }
        },
      );
      await t.test(
        "reviewed technical contact mappings can be reused without storing or reusing personal answer values",
        async () => {
          const first = await readyFixture(),
            saved = await loadAttempt(first.a.id),
            extra = field(
              "backup_contact",
              "Preferred contact address",
              saved.package.facts.email!,
            );
          const makeReport = (pack: AssistedPackage) => ({
            url: pack.target.url,
            challenge: "",
            unsupported: "",
            fields: [
              ...fields().map((f) =>
                f.id === "resume"
                  ? {
                      ...f,
                      files: pack.files.map((file) => ({
                        name: file.name,
                        size: file.size,
                        sha256: file.sha256,
                        mime: file.mime,
                      })),
                    }
                  : f,
              ),
              extra,
            ],
          });
          await attemptCommand(first.a.id, {
            action: "verify",
            leaseToken: first.body.leaseToken,
            report: makeReport(saved.package),
            manualReviewed: [extra.id],
            manualConfirmed: true,
            technicalMappings: [{ fieldId: extra.id, factKey: "email" }],
          });
          const next = await readyFixture(),
            nextRecord = await loadAttempt(next.a.id);
          nextRecord.report = verifyForm(
            nextRecord.package,
            makeReport(nextRecord.package),
          );
          const proposals = await proposeMappings(nextRecord);
          assert.equal(proposals.cached, true);
          assert.equal(proposals.calls, 0);
          assert.equal(proposals.proposals[0].fieldId, extra.id);
          assert.equal(proposals.proposals[0].factKey, "email");
          const technical = await database
            .collection("assisted_form_knowledge")
            .findOne({ mappedContacts: { $exists: true } });
          assert.equal(
            JSON.stringify(technical).includes(saved.package.facts.email!),
            false,
          );
        },
      );
    } finally {
      await closeDb();
      await database.dropDatabase();
      await client.close();
      if (previous[0] === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = previous[0];
      if (previous[1] === undefined) delete process.env.MONGODB_DB;
      else process.env.MONGODB_DB = previous[1];
    }
  },
);
