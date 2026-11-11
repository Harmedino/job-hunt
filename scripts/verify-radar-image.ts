/** Opt-in real provider smoke: one fictional image; only a disposable local DB is used. */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { closeDb, db } from "../src/lib/db";
import {
  generateRadarImage,
  imageProviderConfiguration,
} from "../src/lib/trend-radar/image-service";
import { characterPrompt } from "../src/lib/trend-radar/image-policy";
async function main() {
  if (!process.argv.includes("--generate"))
    throw new Error(
      "Pass --generate to authorize one real image request (provider usage may be billed).",
    );
  if (
    !process.env.TEST_MONGODB_URI ||
    !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.TEST_MONGODB_URI)
  )
    throw new Error("Use local TEST_MONGODB_URI for this smoke check.");
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
  process.env.MONGODB_DB =
    "radar_image_smoke_" + randomUUID().replaceAll("-", "");
  const config = imageProviderConfiguration();
  console.log(JSON.stringify(config));
  try {
    const prompt = characterPrompt({
      assignment: {
        characterId: "fictional-coach",
        role: "the main dancer",
        identity:
          "An original fictional adult football coach with short brown hair, oval face and athletic build",
        outfit: "navy tracksuit and white trainers",
        imageTag: "@Image1",
        imageFilename: "",
      },
      story: { title: "Fictional smoke check", category: "Football" },
      scene: "A fictional group dance in a simple training room",
      style: "Photorealistic",
    });
    const output = await generateRadarImage({ imageTag: "@Image1", prompt });
    const path =
      "/tmp/launchpad-radar-image-smoke." +
      (output.mime === "image/jpeg" ? "jpg" : output.mime.split("/")[1]);
    await writeFile(path, Buffer.from(output.base64, "base64"));
    const report = {
      status: "generated",
      provider: output.provider,
      model: output.model,
      mime: output.mime,
      bytes: output.bytes,
      sha256: output.sha256,
      path,
    };
    await writeFile(
      "/tmp/launchpad-radar-image-report.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } catch (e) {
    const report = {
      status: "unavailable",
      provider: config.provider,
      model: config.model,
      error: e instanceof Error ? e.message : "Unknown error",
    };
    await writeFile(
      "/tmp/launchpad-radar-image-report.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    process.exitCode = 1;
  } finally {
    await (await db()).dropDatabase();
    await closeDb();
  }
}
void main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
