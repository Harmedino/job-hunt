import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { startProduction } from "./server.mjs";
import { pdfFile, docxFile } from "../helpers/cv-files.mjs";
const tracePath = resolve(".next/server/app/api/cv/route.js.nft.json");
const trace = JSON.parse(await readFile(tracePath, "utf8"));
const files = new Set(trace.files.map((f) => resolve(dirname(tracePath), f)));
assert.ok(
  files.has(resolve("node_modules/pdf-parse/dist/worker/pdf.worker.mjs")),
  "PDF worker must be included in the serverless deployment trace",
);
const password = randomBytes(32).toString("base64url");
const server = await startProduction({ APP_PASSWORD: password });
try {
  assert.equal(
    (await fetch(server.url + "/api/cv", { method: "POST" })).status,
    401,
  );
  const login = await fetch(server.url + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: server.url },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .find((c) => c.startsWith("launchpad_session="))
    .split(";")[0];
  for (const [name, bytes] of [
    ["resume.txt", Buffer.from("CV Upload Test - React")],
    ["resume.pdf", await pdfFile()],
    ["resume.docx", await docxFile()],
  ]) {
    const form = new FormData();
    form.set("file", new File([bytes], name));
    const response = await fetch(server.url + "/api/cv", {
      method: "POST",
      headers: { Cookie: cookie, Origin: server.url },
      body: form,
    });
    const result = await response.json();
    assert.equal(
      response.status,
      200,
      `${name}: ${result.error || "upload failed"}`,
    );
    assert.match(result.text, /CV Upload Test/);
    assert.equal(result.persisted, false);
    assert.equal(result.previewOnly, true);
    assert.match(result.warning, /not changed/);
  }
  const bad = new FormData();
  bad.set("file", new File(["not-a-real-pdf"], "bad.pdf"));
  const response = await fetch(server.url + "/api/cv", {
    method: "POST",
    headers: { Cookie: cookie, Origin: server.url },
    body: bad,
  });
  assert.equal(response.status, 422);
  console.log(
    "Production uploads: authenticated PDF, DOCX, TXT parsing; explicit unsaved state; malformed file handling; serverless PDF worker tracing passed.",
  );
} finally {
  await server.stop();
}
