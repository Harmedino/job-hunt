import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { MongoClient } from "mongodb";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";
import { startProduction } from "./server.mjs";
if (!process.env.TEST_MONGODB_URI)
  throw new Error("Set TEST_MONGODB_URI for the production CV builder test.");
for (const tracePath of [
  resolve(".next/server/app/api/resumes/[id]/pdf/route.js.nft.json"),
  resolve(".next/server/app/api/resumes/[id]/export/route.js.nft.json"),
  resolve(".next/server/app/api/documents/[id]/route.js.nft.json"),
]) {
  const trace = JSON.parse(await readFile(tracePath, "utf8"));
  const tracedFiles = new Set(
    trace.files.map((file) => resolve(dirname(tracePath), file)),
  );
  for (const font of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"])
    assert.ok(
      tracedFiles.has(resolve("src/assets/fonts/" + font)),
      "Serverless CV PDF trace must contain " + font,
    );
}
const databaseName = "job_hunt_builder_production_test_" + process.pid;
const client = new MongoClient(process.env.TEST_MONGODB_URI);
await client.connect();
const password = randomBytes(32).toString("base64url");
const server = await startProduction({
  APP_PASSWORD: password,
  MONGODB_URI: process.env.TEST_MONGODB_URI,
  MONGODB_DB: databaseName,
});
try {
  for (const path of [
    "/api/resumes",
    "/api/resumes/test/pdf",
    "/api/resumes/test/export?document=letter&format=docx",
  ])
    assert.equal((await fetch(server.url + path)).status, 401);
  const login = await fetch(server.url + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: server.url },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith("launchpad_session="))
    .split(";")[0];
  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
    Origin: server.url,
  };
  const profile = {
    name: "Production CV Test",
    email: "production-cv@example.org",
    phone: "",
    location: "Nigeria",
    github: "",
    linkedin: "",
    portfolio: "",
    skills: "React, TypeScript",
    experience: "Built a React dashboard at Example Co.",
    education: "BSc Computer Science",
    projects: "Accessible portfolio",
    roles: "Frontend Developer",
    preferences: "Worldwide remote",
    cvText: "",
  };
  assert.equal(
    (
      await fetch(server.url + "/api/profile", {
        method: "PUT",
        headers,
        body: JSON.stringify(profile),
      })
    ).status,
    200,
  );
  const generated = await fetch(server.url + "/api/resumes", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "generate",
      useAi: false,
      target: {
        title: "Frontend Developer",
        company: "Production Fixture",
        description:
          "Create accessible React and TypeScript interfaces for our remote team.",
        url: "",
      },
    }),
  });
  assert.equal(generated.status, 200);
  const first = await generated.json();
  const saved = await fetch(server.url + "/api/resumes", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "save",
      draftId: first.id,
      coverLetter:
        "Dear Hiring Team,\n\nMy edited production-test cover letter.\n\nKind regards,\nProduction CV Test",
      template: "modern",
      content: {
        ...first.content,
        summary: "React and TypeScript frontend skills.",
      },
    }),
  });
  assert.equal(saved.status, 200);
  const version = await saved.json();
  assert.notEqual(version.id, first.id);
  const pdf = await fetch(server.url + `/api/resumes/${version.id}/pdf`, {
    headers: { Cookie: cookie },
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
  assert.ok(
    (await PDFDocument.load(await pdf.arrayBuffer())).getPageCount() >= 1,
  );
  assert.equal(version.template, "modern");
  assert.match(version.coverLetter, /edited production-test/);
  for (const document of ["cv", "letter"]) {
    for (const format of ["pdf", "docx"]) {
      const exported = await fetch(
        server.url +
          `/api/resumes/${version.id}/export?document=${document}&format=${format}`,
        { headers: { Cookie: cookie } },
      );
      assert.equal(exported.status, 200);
      assert.equal(exported.headers.get("Cache-Control"), "no-store");
      const bytes = Buffer.from(await exported.arrayBuffer());
      if (format === "pdf")
        assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
      else {
        const text = (await mammoth.extractRawText({ buffer: bytes })).value;
        assert.match(text, /Production CV Test/);
        assert.match(
          text,
          document === "cv"
            ? /React and TypeScript frontend skills/
            : /edited production-test/,
        );
      }
    }
  }
  const original = await (
    await fetch(server.url + `/api/resumes/${first.id}`, {
      headers: { Cookie: cookie },
    })
  ).json();
  assert.equal(original.content.summary, first.content.summary);
  console.log(
    "Production CV builder: authenticated drafting, immutable edited version, CV/letter PDF and editable Word exports, saved styles and serverless font tracing passed.",
  );
} finally {
  await server.stop();
  await client.db(databaseName).dropDatabase();
  await client.close();
}
