import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { aiConnection, aiJson, aiModel } from "../src/lib/ai";
import { GET as status } from "../src/app/api/status/route";
import { POST as checkAi } from "../src/app/api/ai/check/route";
import { extractResumeProfile } from "../src/lib/resume-profile";
import { buildResume } from "../src/lib/resume-builder";
import { emptyProfile } from "../src/lib/types";
const variables = [
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
];
const original = Object.fromEntries(
  variables.map((name) => [name, process.env[name]]),
);
const originalFetch = globalThis.fetch;
beforeEach(() => {
  for (const name of variables) delete process.env[name];
});
afterEach(() => {
  for (const name of variables) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
  globalThis.fetch = originalFetch;
});
const response = (value: unknown, finishReason = "STOP") =>
  Response.json({
    candidates: [
      { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
    ],
  });

test("provider choice is explicit, presence is not a connectivity claim, and status never exposes keys", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Should not send anything");
  };
  assert.equal(aiConnection().configured, false);
  assert.equal((await checkAi()).status, 503);
  process.env.GEMINI_API_KEY = "private-gemini-fixture";
  assert.equal(aiConnection().provider, "gemini");
  assert.equal(aiModel(), "gemini-flash-latest");
  const state = await (await status()).json();
  assert.equal(state.ai, true);
  assert.equal(state.aiLabel, "Google Gemini");
  assert.doesNotMatch(JSON.stringify(state), /private-gemini-fixture/);
  process.env.OPENAI_API_KEY = "private-openai-fixture";
  assert.equal(aiConnection().provider, "openai");
  process.env.AI_PROVIDER = "gemini";
  assert.equal(aiConnection().provider, "gemini");
  delete process.env.GEMINI_API_KEY;
  assert.equal(aiConnection().configured, false);
  await assert.rejects(() => aiJson("JSON", {}), /GEMINI_API_KEY/);
  process.env.AI_PROVIDER = "invalid";
  assert.equal(aiConnection().configured, false);
  await assert.rejects(() => aiJson("JSON", {}), /AI_PROVIDER/);
  assert.equal(calls, 0);
});
test("Gemini check uses server-side headers and JSON mode and sends no CV", async () => {
  process.env.GEMINI_API_KEY = "private-key-fixture";
  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    );
    assert.doesNotMatch(String(url), /private-key/);
    assert.equal(
      new Headers(init?.headers).get("x-goog-api-key"),
      "private-key-fixture",
    );
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.contents[0].parts[0].text, "{}");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.match(body.systemInstruction.parts[0].text, /untrusted data/);
    return response({ ok: true });
  };
  const checked = await checkAi();
  const result = await checked.json();
  assert.equal(checked.status, 200);
  assert.equal(checked.headers.get("Cache-Control"), "no-store");
  assert.equal(result.provider, "gemini");
  assert.match(result.message, /Google Gemini connection verified/);
});
test("Gemini CV import and tailoring preserve evidence checks, including cover letters", async () => {
  process.env.GEMINI_API_KEY = "fixture-key";
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls === 1)
      return response({
        fields: {
          name: ["Test Applicant"],
          skills: ["React"],
          education: ["Invented PhD"],
        },
      });
    if (calls === 2)
      return response({
        priorities: [
          {
            requirement: "Build React interfaces with Kubernetes.",
            evidence: [0, 1],
          },
        ],
        selectedEvidence: [0, 1],
      });
    if (calls === 3)
      return response({
        items: [
          {
            section: "summary",
            text: "Frontend skills include React and experience building accessible interfaces.",
            sources: [0, 1],
          },
          { section: "skills", text: "React", sources: [0] },
          {
            section: "experience",
            text: "Built accessible React interfaces at Example Co.",
            sources: [1],
          },
          {
            section: "coverLetter",
            text: "My skills include React for developing frontend interfaces.",
            sources: [0],
          },
          {
            section: "coverLetter",
            text: "I built accessible React interfaces at Example Co.",
            sources: [1],
          },
          {
            section: "experience",
            text: "Led Kubernetes operations.",
            sources: [1],
          },
        ],
      });
    return response({ supported: [0, 1, 2, 3, 4] });
  };
  const imported = await extractResumeProfile(
    "Test Applicant\ntest@example.org\nSkills\nReact",
  );
  assert.equal(imported.method, "AI-assisted CV import");
  assert.equal(imported.fields.education, undefined);
  const draft = await buildResume(
    {
      ...emptyProfile,
      name: "Test Applicant",
      email: "test@example.org",
      skills: "React",
      experience: "Built accessible React interfaces at Example Co.",
    },
    {
      title: "Frontend Developer",
      company: "Fixture",
      url: "",
      description: "Build React interfaces with Kubernetes.",
    },
    true,
  );
  assert.equal(calls, 4);
  assert.match(draft.content.summary, /React/);
  assert.match(draft.coverLetter, /My skills include React/);
  assert.doesNotMatch(
    JSON.stringify({ content: draft.content, letter: draft.coverLetter }),
    /Kubernetes/,
  );
  assert.ok(draft.warnings.length);
});
test("Gemini errors, blocked or truncated output and invalid model names fail without leaking details or using another provider", async () => {
  process.env.GEMINI_API_KEY = "fixture-key";
  process.env.OPENAI_API_KEY = "unused-key";
  process.env.AI_PROVIDER = "gemini";
  for (const code of [400, 401, 403, 404, 429, 500]) {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /generativelanguage.googleapis.com/);
      return new Response("private provider error fixture-key", {
        status: code,
      });
    };
    await assert.rejects(
      () => aiJson("JSON", {}),
      (error: Error) =>
        !error.message.includes("fixture-key") &&
        /Google Gemini|Gemini/.test(error.message),
    );
  }
  for (const finish of ["MAX_TOKENS", "SAFETY"]) {
    globalThis.fetch = async () => response({ ok: true }, finish);
    await assert.rejects(() => aiJson("JSON", {}), /incomplete response/);
  }
  globalThis.fetch = async () =>
    Response.json({
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } },
      ],
    });
  await assert.rejects(() => aiJson("JSON", {}), /unreadable/);
  process.env.GEMINI_MODEL = "../../not-a-model?key=secret";
  globalThis.fetch = async () => {
    throw new Error("Must validate before fetching");
  };
  await assert.rejects(() => aiJson("JSON", {}), /valid AI model/);
});

test("Gemini retries transient overload once on the same provider and reports persistent outages accurately", async () => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "private-retry-key";
  let calls = 0;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /generativelanguage.googleapis.com/);
    calls++;
    return calls === 1
      ? new Response("private-retry-key", { status: 503 })
      : response({ ok: true });
  };
  assert.deepEqual(await aiJson("JSON", {}), { ok: true });
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("private-retry-key", { status: 503 });
  };
  await assert.rejects(
    () => aiJson("JSON", {}),
    (error) =>
      error instanceof Error &&
      /temporarily overloaded/.test(error.message) &&
      !error.message.includes("private-retry-key"),
  );
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("private", { status: 429 });
  };
  await assert.rejects(() => aiJson("JSON", {}), /rate limit/);
  assert.equal(calls, 1);
});

test('a timed-out retry preserves the actual Gemini provider overload without leaking keys',async()=>{
 process.env.AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='fixture-overload-key';let calls=0;
 globalThis.fetch=async()=>{calls++;if(calls===1)return new Response('private provider body',{status:503});throw new DOMException('fixture-overload-key','TimeoutError');};
 await assert.rejects(()=>aiJson('JSON',{}),error=>error instanceof Error && /temporarily overloaded.*503/.test(error.message) && !/fixture-overload-key|private provider body/.test(error.message));
 assert.equal(calls,2);
});

test('automatic Gemini recovery reports the actual model and reuses it within a CV flow',async()=>{
 process.env.AI_PROVIDER='gemini';process.env.GEMINI_MODEL='auto';process.env.GEMINI_API_KEY='fixture-recovery-key';
 const models:string[]=[];let used='';
 globalThis.fetch=async(input,init)=>{const model=new URL(String(input)).pathname.split('/').pop()!.split(':')[0];models.push(model);assert.equal(new Headers(init?.headers).get('x-goog-api-key'),'fixture-recovery-key');return models.length===1?new Response('private upstream body',{status:503}):response({ok:true});};
 assert.deepEqual(await aiJson('JSON',{}, {onModelUsed:model=>{used=model;}}),{ok:true});
 assert.deepEqual(models,['gemini-flash-latest','gemini-flash-lite-latest']);assert.equal(used,'gemini-flash-lite-latest');
 models.length=0;globalThis.fetch=async(input)=>{models.push(new URL(String(input)).pathname.split('/').pop()!.split(':')[0]);return response({ok:true});};
 await aiJson('JSON',{}, {preferredGeminiModel:used});assert.deepEqual(models,['gemini-flash-lite-latest']);
});
test('explicit Gemini model pins disable alternate-model recovery',async()=>{
 process.env.AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='fixture-pinned-key';process.env.GEMINI_MODEL='chosen-pinned-model';let calls=0;
 globalThis.fetch=async(input)=>{calls++;assert.match(String(input),/models\/chosen-pinned-model:generateContent$/);return new Response('private',{status:503});};
 await assert.rejects(()=>aiJson('JSON',{}),/temporarily overloaded/);assert.equal(calls,2);
});
test('automatic recovery never retries auth, quota, invalid-model, blocked or malformed output on another model',async()=>{
 process.env.AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='fixture-no-recovery';process.env.GEMINI_MODEL='auto';
 for(const status of [400,401,403,404,429]) {let calls=0;globalThis.fetch=async()=>{calls++;return new Response('private',{status});};await assert.rejects(()=>aiJson('JSON',{}));assert.equal(calls,1);}
 let calls=0;globalThis.fetch=async()=>{calls++;return response({ok:true},'SAFETY');};await assert.rejects(()=>aiJson('JSON',{}),/incomplete/);assert.equal(calls,1);
});
test('automatic recovery reserves deadline time when the primary model stalls',async()=>{
 process.env.AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='fixture-deadline';process.env.GEMINI_MODEL='auto';let calls=0;
 const keepAlive=setInterval(()=>{},20);
 try{
  globalThis.fetch=async(_input,init)=>{calls++;if(calls===1)return new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new DOMException('stalled','TimeoutError')),{once:true}));return response({ok:true});};
  assert.deepEqual(await aiJson('JSON',{}, {timeoutMs:1000}),{ok:true});assert.equal(calls,2);
 }finally{clearInterval(keepAlive);}
});
