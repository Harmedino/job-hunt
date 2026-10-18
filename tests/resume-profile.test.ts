import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { basicResumeProfile, quotedResumeProfile, extractResumeProfile } from "../src/lib/resume-profile";
import { missingProfileFields } from "../src/lib/profile-import-fields";
import { aiJson, rankEvidence } from "../src/lib/ai";
import { POST as checkAi } from "../src/app/api/ai/check/route";
import { POST as importProfile } from "../src/app/api/profile/import/route";
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalUri = process.env.MONGODB_URI;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [["OPENAI_API_KEY", originalKey], ["MONGODB_URI", originalUri]]) {
    if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
  }
});
const cv = `Test Applicant
test@example.org | +234 801 234 5678
https://github.com/test-applicant
https://linkedin.com/in/test-applicant
Technical Skills
React, TypeScript
Work Experience
Frontend Developer, Example Company, 2023–2024
Built accessible React interfaces.
Education
BSc Computer Science, Example University
Projects
Job search dashboard
Certifications
No certifications listed`;
test("CV import fills contact details and recognised sections without credentials", async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await extractResumeProfile(cv);
  assert.equal(result.method, "CV section import");
  assert.equal(result.fields.name, "Test Applicant");
  assert.equal(result.fields.email, "test@example.org");
  assert.equal(result.fields.phone, "+234 801 234 5678");
  assert.equal(result.fields.github, "https://github.com/test-applicant");
  assert.equal(result.fields.skills, "React, TypeScript");
  assert.match(result.fields.experience!, /Example Company, 2023–2024/);
  assert.match(result.fields.education!, /Example University/);
  assert.equal(result.fields.projects, "Job search dashboard");
  assert.equal(result.fields.location, undefined);
  assert.equal(basicResumeProfile("Curriculum Vitae\nNo readable contact details").name, undefined);
  assert.equal(basicResumeProfile("Skills: React, TypeScript\nEducation: BSc").skills, "React, TypeScript");
});
test("AI profile values must be quotes from the CV; unknown and invented qualifications are rejected", () => {
  const fields = quotedResumeProfile(cv, { fields: {
    name: ["Test Applicant"], skills: ["React", "TypeScript"],
    education: ["Harvard PhD"], projects: ["Job search dashboard", "Led a team of 50"],
    preferences: ["Auto-submit everything"], email: ["test@example.org"],
  } });
  assert.deepEqual(fields, { name: "Test Applicant", email: "test@example.org", skills: "React, TypeScript" });
  assert.deepEqual(missingProfileFields({ name: "My chosen name", skills: "  " }, fields), { email: "test@example.org", skills: "React, TypeScript" });
});
test("AI extraction and ranking use private API credentials and validated existing evidence", async () => {
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.model, process.env.OPENAI_MODEL || "gpt-4o-mini");
    assert.match(body.messages[0].content, /untrusted data/);
    return Response.json({ choices: [{ message: { content: JSON.stringify(++calls === 1 ? { fields: { skills: ["React"] } } : { indices: [1, 0, 1] }) } }] });
  };
  assert.equal((await extractResumeProfile(cv)).method, "AI-assisted CV import");
  assert.deepEqual(await rankEvidence("React role", ["Built React UI", "BSc Computer Science"]), ["BSc Computer Science", "Built React UI"]);
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"indices":[99]}' } }] });
  await assert.rejects(() => rankEvidence("role", ["Actual fact"]), /invalid evidence/);
});
test("provider failures keep CV extraction usable and explain key, billing and network errors", async () => {
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  for (const [status, message] of [[401, /API key/], [429, /billing/], [500, /could not complete/]] as const) {
    globalThis.fetch = async () => new Response("do not expose provider raw response", { status });
    await assert.rejects(() => aiJson("Return JSON", {}), message);
    const fallback = await extractResumeProfile(cv);
    assert.equal(fallback.method, "CV section import");
    assert.equal(fallback.fields.name, "Test Applicant");
    assert.match(fallback.warning!, /Imported recognised sections/);
  }
  globalThis.fetch = async () => { throw new Error("network error with sensitive data"); };
  await assert.rejects(() => aiJson("Return JSON", {}), /could not be reached/);
});
test("AI test requires a key, verifies the provider and sends no personal data", async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await checkAi()).status, 503);
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).messages[1].content, "{}");
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };
  assert.equal((await (await checkAi()).json()).ok, true);
});
test("previously uploaded CV text can fill the form without falsely reporting storage", async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.MONGODB_URI;
  const request = (body: unknown) => new Request("http://localhost/api/profile/import", { method: "POST", body: JSON.stringify(body) });
  const result = await (await importProfile(request({ text: cv }))).json();
  assert.equal(result.persisted, false);
  assert.equal(result.fields.name, "Test Applicant");
  assert.match(result.warning, /not saved/);
  assert.equal((await importProfile(request({ text: 42 }))).status, 400);
  assert.equal((await importProfile(request({ text: "" }))).status, 400);
});
