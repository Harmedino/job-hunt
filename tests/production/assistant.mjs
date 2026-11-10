import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { MongoClient } from "mongodb";
import { startProduction } from "./server.mjs";
if (!process.env.TEST_MONGODB_URI)
  throw new Error(
    "Set TEST_MONGODB_URI for the production Application Assistant test.",
  );
const hash = (value) => createHash("sha256").update(value).digest("hex"),
  tracePath = resolve(".next/server/app/api/assisted-apply/route.js.nft.json"),
  trace = JSON.parse(await readFile(tracePath, "utf8"));
for (const font of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"])
  assert.ok(
    trace.files.some(
      (f) =>
        resolve(dirname(tracePath), f) === resolve("src/assets/fonts/" + font),
    ),
    "Approval route must trace its PDF font",
  );
const name = "assistant_prod_" + randomUUID().replaceAll("-", ""),
  client = await new MongoClient(process.env.TEST_MONGODB_URI).connect(),
  database = client.db(name),
  password = randomBytes(32).toString("base64url");
let server;
try {
  const now = new Date().toISOString(),
    profile = {
      name: "Fixture Candidate",
      email: "fixture@example.org",
      phone: "",
      location: "Nigeria",
      github: "",
      linkedin: "",
      portfolio: "",
      skills: "React, TypeScript",
      experience: "Actual fixture developer experience",
      education: "",
      projects: "Actual fixture project",
      roles: "React Developer",
      preferences: "Remote",
      cvText: "",
    },
    target = {
      title: "React Developer",
      company: "Fictional Test Employer",
      description:
        "Fictional test only; no real employer application will be opened or submitted.",
      url: "https://job-boards.greenhouse.io/launchpadfixture/jobs/12345",
    };
  const job = {
    id: "fixture-job",
    ...target,
    location: "Worldwide",
    salary: "",
    source: "Greenhouse",
    eligibility: "eligible",
    eligibilityReason: "Fictional fixture",
    score: 80,
    matchedSkills: ["React"],
    postedAt: now,
    discoveredAt: now,
  };
  await database.collection("profile").insertOne({ key: "owner", profile });
  await database.collection("applications").insertOne({
    id: "fixture-app",
    job,
    status: "Saved",
    createdAt: now,
    updatedAt: now,
    followUp: "Keep these original notes",
  });
  await database.collection("resumes").insertOne({
    id: "fixture-cv",
    familyId: "fixture-family",
    createdAt: now,
    target,
    content: { ...profile, summary: "Verified fixture development work" },
    profileSnapshot: profile,
    evidence: [],
    warnings: [],
    requirementsToReview: [],
    method: "Basic",
    manualEdits: false,
    layoutVersion: 2,
  });
  server = await startProduction({
    APP_PASSWORD: password,
    MONGODB_URI: process.env.TEST_MONGODB_URI,
    MONGODB_DB: name,
  });
  const login = await fetch(server.url + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: server.url },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
      .getSetCookie()
      .find((v) => v.startsWith("launchpad_session="))
      .split(";")[0],
    owner = {
      Cookie: cookie,
      Origin: server.url,
      "Content-Type": "application/json",
    };
  const post = async (path, body, headers = owner) =>
    fetch(server.url + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const input = {
    applicationId: "fixture-app",
    draftId: "fixture-cv",
    firstName: "Fixture",
    lastName: "Candidate",
    verifiedFacts: ["firstName", "lastName", "email"],
    reviewedAnswers: [],
    approved: true,
  };
  assert.equal(
    (
      await post("/api/assisted-apply", input, {
        ...owner,
        Origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  const approved = await post("/api/assisted-apply", input);
  assert.equal(approved.status, 201);
  const attempt = await approved.json();
  assert.equal((await post("/api/assisted-apply", input)).status, 409);
  const frozen = await fetch(
      server.url + `/api/assisted-apply/${attempt.id}/file?kind=cv`,
      { headers: owner },
    ),
    bytes = Buffer.from(await frozen.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.equal(hash(bytes), attempt.files[0].sha256);
  const extension = "a".repeat(32),
    handoff = await (
      await post(`/api/assisted-apply/${attempt.id}/handoff`, {
        extensionId: extension,
      })
    ).json(),
    decoded = JSON.parse(Buffer.from(handoff.code.split(".")[1], "base64url"));
  const baseHeaders = {
    Origin: `chrome-extension://${extension}`,
    "X-Launchpad-Extension": extension,
    "Content-Type": "application/json",
  };
  const preflight = await fetch(
    server.url + "/api/assisted-companion/handoff",
    { method: "OPTIONS", headers: baseHeaders },
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    baseHeaders.Origin,
  );
  const claimResponse = await post(
    "/api/assisted-companion/handoff",
    { token: decoded.token },
    baseHeaders,
  );
  assert.equal(claimResponse.status, 200);
  const claim = await claimResponse.json();
  assert.equal(
    (
      await post(
        "/api/assisted-companion/handoff",
        { token: decoded.token },
        baseHeaders,
      )
    ).status,
    401,
  );
  const scoped = {
      ...baseHeaders,
      Authorization: `Bearer ${claim.leaseToken}`,
    },
    packageResponse = await fetch(
      server.url + `/api/assisted-companion/${attempt.id}`,
      { headers: scoped },
    );
  assert.equal(packageResponse.status, 200);
  const payload = await packageResponse.json();
  assert.equal(hash(JSON.stringify(payload.package)), payload.sha256);
  const pack = payload.package,
    fields = [
      { id: "first_name", label: "First Name", value: "Fixture", kind: "text" },
      { id: "last_name", label: "Last Name", value: "Candidate", kind: "text" },
      { id: "email", label: "Email", value: profile.email, kind: "text" },
      {
        id: "resume",
        label: "Resume/CV",
        value: "",
        kind: "file",
        files: [
          {
            name: pack.files[0].name,
            size: pack.files[0].size,
            sha256: pack.files[0].sha256,
            mime: pack.files[0].mime,
          },
        ],
      },
    ].map((f) => ({ ...f, required: true, valid: true, disabled: false }));
  const verified = await post(
    `/api/assisted-companion/${attempt.id}`,
    {
      action: "verify",
      report: { url: pack.target.url, challenge: "", unsupported: "", fields },
      manualReviewed: [],
    },
    scoped,
  );
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).state, "verified-ready");
  assert.equal(
    (await database.collection("applications").findOne({ id: "fixture-app" }))
      .status,
    "Saved",
  );
  assert.equal(
    (await database.collection("applications").findOne({ id: "fixture-app" }))
      .followUp,
    "Keep these original notes",
  );
  assert.equal(
    (
      await post(
        `/api/assisted-companion/${attempt.id}`,
        { action: "claim" },
        scoped,
      )
    ).status,
    403,
  );
  await post(`/api/assisted-apply/${attempt.id}`, {
    action: "revoke",
    confirmed: true,
  });
  assert.equal(
    (
      await fetch(server.url + `/api/assisted-companion/${attempt.id}`, {
        headers: scoped,
      })
    ).status,
    401,
  );
  console.log(
    "Production Assistant passed: cookie/origin protection, traced PDF, immutable bytes, duplicate approval, one-use scoped handoff, CORS, actual readback persistence and revocation. No employer was contacted or submitted to.",
  );
} finally {
  await server?.stop();
  await database.dropDatabase();
  await client.close();
}
