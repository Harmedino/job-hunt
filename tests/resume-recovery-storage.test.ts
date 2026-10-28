import { isolateAiEnv } from "./helpers/ai-env";
isolateAiEnv();
import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { POST as generate } from "../src/app/api/resumes/route";
import { closeDb } from "../src/lib/db";
import { emptyProfile } from "../src/lib/types";
const req = (body: unknown) =>
  new Request("http://localhost/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test(
  "private stage checkpoints resume only unchanged input, expire and never appear as completed CVs",
  { skip: !process.env.TEST_MONGODB_URI, timeout: 30000 },
  async () => {
    const previous = {
        uri: process.env.MONGODB_URI,
        db: process.env.MONGODB_DB,
        key: process.env.OPENAI_API_KEY,
      },
      originalFetch = globalThis.fetch;
    const client = new MongoClient(process.env.TEST_MONGODB_URI!);
    const name = "job_hunt_recovery_" + process.pid;
    const database = client.db(name);
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = name;
    process.env.OPENAI_API_KEY = "test-only-placeholder";
    try {
      const profile = {
        ...emptyProfile,
        name: "Checkpoint Candidate",
        email: "checkpoint@example.org",
        skills: "React, TypeScript",
        experience: "Built accessible React interfaces.",
      };
      const target = {
        title: "Frontend Developer",
        company: "Checkpoint Fixture",
        url: "https://example.org/checkpoint",
        description:
          "Build accessible React interfaces. TypeScript development is required.",
      };
      await database.collection("profile").insertOne({ key: "owner", profile });
      let stages: string[] = [];
      const analysis = {
          priorities: [
            {
              requirement: "Build accessible React interfaces.",
              evidence: [1],
            },
          ],
          selectedEvidence: [0, 1],
        },
        writing = {
          items: [
            {
              section: "summary",
              text: "Frontend development skills include React and TypeScript, with experience building accessible interfaces.",
              sources: [0, 1],
            },
            { section: "skills", text: profile.skills, sources: [0] },
            { section: "experience", text: profile.experience, sources: [1] },
            {
              section: "coverLetter",
              text: "My supplied experience includes building accessible React interfaces.",
              sources: [1],
            },
            {
              section: "coverLetter",
              text: "My supplied frontend development skills include React and TypeScript.",
              sources: [0],
            },
          ],
        };
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(String(init?.body));
        const instructions = payload.messages[0].content;
        if (instructions.startsWith("Analyse")) {
          stages.push("analysis");
          return Response.json({
            choices: [{ message: { content: JSON.stringify(analysis) } }],
          });
        }
        if (instructions.startsWith("Write")) {
          stages.push("writing");
          return Response.json({
            choices: [{ message: { content: JSON.stringify(writing) } }],
          });
        }
        stages.push("verify");
        return Response.json(
          { error: { message: "Unavailable" } },
          { status: 503 },
        );
      };
      assert.equal(
        (await generate(req({ action: "generate", useAi: true, target })))
          .status,
        503,
      );
      assert.deepEqual(stages, ["analysis", "writing", "verify", "verify"]);
      assert.equal(await database.collection("resumes").countDocuments({}), 0);
      const cp = (await database
        .collection("resume_generation_recovery")
        .findOne({}))!;
      assert.ok(cp.checkpoint.generated);
      assert.ok(cp.expiresAt instanceof Date);
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(String(init?.body));
        assert.match(payload.messages[0].content, /Check each claim/);
        return Response.json({
          choices: [
            { message: { content: JSON.stringify({ supported: [0, 1, 2] }) } },
          ],
        });
      };
      const success = await generate(
        req({
          action: "generate",
          useAi: true,
          target,
          retry: true,
          checkpoint: { generated: { items: [] } },
        }),
      );
      assert.equal(success.status, 200);
      assert.equal(await database.collection("resumes").countDocuments({}), 1);
      assert.equal(
        await database
          .collection("resume_generation_recovery")
          .countDocuments({}),
        0,
      );
      await database
        .collection("resume_generation_recovery")
        .insertOne({ ...cp, expiresAt: new Date(Date.now() - 1000) });
      stages = [];
      globalThis.fetch = async (_url, init) => {
        const payload = JSON.parse(String(init?.body));
        stages.push(
          payload.messages[0].content.startsWith("Analyse")
            ? "analysis"
            : "other",
        );
        return Response.json({ error: {} }, { status: 503 });
      };
      assert.equal(
        (
          await generate(
            req({ action: "generate", useAi: true, target, retry: true }),
          )
        ).status,
        503,
      );
      assert.deepEqual(stages, ["analysis", "analysis"]);
      stages = [];
      await database
        .collection("resume_generation_recovery")
        .updateOne(
          { key: cp.key },
          { $set: { expiresAt: new Date(Date.now() + 100000) } },
        );
      assert.equal(
        (
          await generate(
            req({
              action: "generate",
              useAi: true,
              target: { ...target, company: "Changed company" },
              retry: true,
            }),
          )
        ).status,
        503,
      );
      assert.deepEqual(stages, ["analysis", "analysis"]);
    } finally {
      globalThis.fetch = originalFetch;
      await closeDb();
      await database.dropDatabase();
      await client.close();
      for (const [key, value] of Object.entries({
        MONGODB_URI: previous.uri,
        MONGODB_DB: previous.db,
        OPENAI_API_KEY: previous.key,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  },
);
