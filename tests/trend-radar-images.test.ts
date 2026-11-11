import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assignmentKey,
  imageApprovalMatches,
  characterPrompt,
  type ImageApproval,
} from "../src/lib/trend-radar/image-policy";
import {
  imageProviderConfiguration,
  decodeImageResponse,
} from "../src/lib/trend-radar/image-service";
import {
  buildKlingArchive,
  type KlingExportInput,
} from "../src/lib/trend-radar/export";
import type { LocalAsset } from "../src/lib/trend-radar/local-media";
const scene =
  "Three original performers dance, cross positions, and keep dancing.";
const assignments = Array.from({ length: 3 }, (_, i) => ({
  characterId: `performer-${i}`,
  role: `original performer ${i + 1}`,
  identity: `Fictional coach ${i + 1}`,
  outfit: "navy tracksuit and white trainers",
  imageTag: `@Image${i + 1}`,
  imageFilename: "",
}));
const bytes = Buffer.from("fixture-only approved image content");
const hash = createHash("sha256").update(bytes).digest("hex");
const approvals: ImageApproval[] = assignments.map((a) => ({
  characterId: a.characterId,
  imageTag: a.imageTag,
  filename: a.imageTag + ".png",
  mime: "image/png",
  prompt: characterPrompt({
    assignment: a,
    story: { title: "Test result", category: "Football" },
    scene,
    style: "Photorealistic",
  }),
  style: "Photorealistic",
  provider: "Fixture",
  model: "Fixture",
  approvedAt: new Date().toISOString(),
  assignmentKey: assignmentKey(a, scene),
  sha256: hash,
}));
const args: KlingExportInput = {
  projectId: "project-test",
  story: {
    id: "manual:test",
    title: "Fixture only",
    category: "Football",
    summary: "",
    sources: [
      {
        publisher: "Fixture",
        url: "https://example.com/story",
        publishedAt: "",
      },
    ],
    publishedAt: "",
    checkedAt: "",
    score: 0,
    why: "",
    people: [],
  },
  assignments,
  approvedImages: approvals,
  environmentTag: "@Image4",
  captions: { X: "AI-generated fictional parody" },
  sceneDescription: scene,
};
const assets: LocalAsset[] = [
  {
    key: "video",
    projectId: "project-test",
    role: "video",
    filename: "owned.mp4",
    mime: "video/mp4",
    blob: new Blob(["fixture-only video"]),
    savedAt: "",
  },
  ...assignments.map((a) => ({
    key: a.imageTag,
    projectId: "project-test",
    role: a.imageTag,
    filename: a.imageTag + ".png",
    mime: "image/png",
    blob: new Blob([bytes]),
    savedAt: "",
  })),
  {
    key: "environment",
    projectId: "project-test",
    role: "@Image4",
    filename: "environment.webp",
    mime: "image/webp",
    blob: new Blob(["fixture environment"]),
    savedAt: "",
  },
];
test("image approval follows a stable performer and invalidates on identity, role or scene changes", () => {
  assert.ok(imageApprovalMatches(assignments[0], approvals[0], scene));
  for (const edit of [
    { identity: "Other person" },
    { role: "another role" },
    { outfit: "red shirt" },
    { characterId: "different-id" },
    { imageTag: "@Image8" },
  ])
    assert.equal(
      imageApprovalMatches({ ...assignments[0], ...edit }, approvals[0], scene),
      false,
    );
  assert.equal(
    imageApprovalMatches(assignments[0], approvals[0], "A different scene"),
    false,
  );
  assert.deepEqual(approvals.slice(1), args.approvedImages.slice(1));
});
test("three separate images export with exact mappings, audio instructions and a separate WebP environment", async () => {
  const zip = await buildKlingArchive(args, assets);
  assert.ok(zip.file("images/Image1.png"));
  assert.ok(zip.file("images/Image2.png"));
  assert.ok(zip.file("images/Image3.png"));
  assert.ok(zip.file("images/Image4-environment.webp"));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  assert.equal(manifest.characterMapping.length, 3);
  assert.equal(manifest.environmentFile, "images/Image4-environment.webp");
  assert.deepEqual(
    manifest.characterMapping.map(
      (m: { characterId: string }) => m.characterId,
    ),
    assignments.map((a) => a.characterId),
  );
  assert.match(
    await zip.file("Kling Prompt.txt")!.async("string"),
    /dialogue, sound, rhythm and timing completely unchanged/,
  );
  assert.match(
    await zip.file("Kling Prompt.txt")!.async("string"),
    /switch positions/,
  );
});
test("export refuses modified bytes, changed identity, missing local files and stale legacy approvals", async () => {
  await assert.rejects(
    buildKlingArchive(
      args,
      assets.map((a) =>
        a.role === "@Image2" ? { ...a, blob: new Blob(["replaced"]) } : a,
      ),
    ),
    /bytes changed/,
  );
  await assert.rejects(
    buildKlingArchive(
      {
        ...args,
        assignments: assignments.map((a, i) =>
          i === 0 ? { ...a, identity: "Other identity" } : a,
        ),
      },
      assets,
    ),
    /changed character/,
  );
  await assert.rejects(
    buildKlingArchive(
      args,
      assets.filter((a) => a.role !== "@Image1"),
    ),
    /missing/,
  );
  await assert.rejects(
    buildKlingArchive(
      {
        ...args,
        approvedImages: approvals.map((a) => ({
          ...a,
          assignmentKey: undefined,
        })),
      },
      assets,
    ),
    /reapprove/,
  );
});
test("text responses and MIME mismatches are never accepted as generated images", () => {
  assert.throws(
    () =>
      decodeImageResponse(
        Buffer.from("a text-only AI response").toString("base64"),
        "image/png",
      ),
    /invalid/,
  );
  const fake = Buffer.alloc(128);
  Buffer.from("89504e470d0a1a0a", "hex").copy(fake);
  assert.throws(
    () => decodeImageResponse(fake.toString("base64"), "image/jpeg"),
    /recognized/,
  );
});
test("text-only model is rejected explicitly in image configuration", () => {
  const original = { ...process.env };
  try {
    process.env.TREND_RADAR_IMAGE_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-not-real";
    process.env.TREND_RADAR_IMAGE_MODEL = "gemini-2.5-flash";
    assert.equal(imageProviderConfiguration().configured, false);
    assert.match(imageProviderConfiguration().message, /image-model/);
  } finally {
    process.env = original;
  }
});

