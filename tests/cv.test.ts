import { isolateAiEnv } from "./helpers/ai-env";
isolateAiEnv();
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { extractCv } from "../src/lib/cv";
import { MAX_CV_BYTES, cvFileProblem } from "../src/lib/cv-limits";
import { POST as upload } from "../src/app/api/cv/route";
import { docxFile, pdfFile } from "./helpers/cv-files.mjs";
const originalUri = process.env.MONGODB_URI;
after(() => {
  if (originalUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = originalUri;
});
test("text-based PDF, Word DOCX and TXT imports preserve actual qualifications", async () => {
  assert.match(
    await extractCv(new File([new Uint8Array(await pdfFile())], "resume.pdf")),
    /CV Upload Test - React and TypeScript/,
  );
  assert.match(
    await extractCv(
      new File([new Uint8Array(await docxFile())], "resume.docx"),
    ),
    /CV Upload Test — React and TypeScript/,
  );
  assert.equal(
    await extractCv(
      new File(["CV Upload Test\nReact, TypeScript"], "resume.txt"),
    ),
    "CV Upload Test\nReact, TypeScript",
  );
});
test("oversized, unsupported, empty, unreadable and image-only documents return useful errors", async () => {
  assert.equal(
    cvFileProblem({ name: "cv.pdf", size: MAX_CV_BYTES + 1 })?.status,
    413,
  );
  assert.equal(cvFileProblem({ name: "cv.doc", size: 100 })?.status, 415);
  assert.equal(cvFileProblem({ name: "cv.pdf", size: 0 })?.status, 400);
  await assert.rejects(
    () => extractCv(new File(["not a PDF"], "resume.pdf")),
    /not a readable PDF/,
  );
  await assert.rejects(
    () => extractCv(new File(["not a DOCX"], "resume.docx")),
    /invalid or protected/,
  );
  const blank = await pdfFile("");
  await assert.rejects(
    () => extractCv(new File([new Uint8Array(blank)], "scan.pdf")),
    /No readable text/,
  );
});
test("CV extraction remains available without storage and never reports a false save", async () => {
  delete process.env.MONGODB_URI;
  const form = new FormData();
  form.set("file", new File(["CV Upload Test\nReact"], "resume.txt"));
  const response = await upload(
    new Request("http://localhost/api/cv", { method: "POST", body: form }),
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.persisted, false);
  assert.equal(result.previewOnly, true);
  assert.match(result.warning, /not saved/);
  assert.match(result.text, /React/);
});

test("UTF-16 text remains readable and DOCX validation rejects embedded code, external templates and expansion bombs", async () => {
  const { default: JSZip } = await import("jszip");
  const text = "Fictional CV Candidate\nReact and TypeScript";
  assert.equal(
    await extractCv(
      new File(
        [
          Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from(text, "utf16le"),
          ]),
        ],
        "utf16.txt",
      ),
    ),
    text,
  );
  for (const fixture of ["macro", "external", "expanded"]) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file(
      "word/document.xml",
      "<w:document><w:body>Fictional CV</w:body></w:document>",
    );
    if (fixture === "macro") zip.file("word/vbaProject.bin", "executable");
    if (fixture === "external")
      zip.file(
        "word/_rels/document.xml.rels",
        '<Relationships><Relationship Type="http://example.org/attachedTemplate" Target="https://example.org/template" TargetMode="External"/></Relationships>',
      );
    if (fixture === "expanded")
      zip.file("word/oversized.xml", "x".repeat(11 * 1024 * 1024));
    const bytes = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    await assert.rejects(
      () => extractCv(new File([new Uint8Array(bytes)], fixture + ".docx")),
      /invalid or protected/,
    );
  }
});
