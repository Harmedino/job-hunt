import { validateRoleTimeline, type RoleMoment } from "./browser-analysis";
import JSZip from "jszip";
import { readLocalAssets, type LocalAsset } from "./local-media";
import {
  klingReplacementPrompt,
  type RadarAssignment,
  type RadarStory,
  type RadarClip,
} from "./core";
import { validateImageTagApprovals, type ImageApproval } from "./image-policy";
export type KlingExportInput = {
  projectId: string;
  story: RadarStory;
  clip?: RadarClip;
  assignments: RadarAssignment[];
  approvedImages: ImageApproval[];
  environmentTag: string;
  captions: Record<string, string>;
  sceneDescription: string;
  roleTimeline?: RoleMoment[];
};
export async function buildKlingArchive(
  args: KlingExportInput,
  assets: LocalAsset[],
): Promise<JSZip> {
  const { story, assignments, approvedImages, environmentTag, captions, clip } =
    args;

  const problems = validateImageTagApprovals(
    assignments,
    approvedImages,
    assets.map((a) => a.role),
    args.sceneDescription,
  );
  if (problems.length) throw new Error(problems.join(" "));
  const original = assets.find((a) => a.role === "video");
  if (!original)
    throw new Error(
      "An authorized local source video is required for a fully ready Kling package. YouTube references cannot be automatically downloaded or reused.",
    );
  const prompt = klingReplacementPrompt(assignments, environmentTag);
  if (environmentTag && !assets.some((asset) => asset.role === environmentTag))
    throw new Error(
      "The optional environment image must be added to this browser before exporting.",
    );
  const zip = new JSZip();
  const sourceName = original.filename.replace(/[^a-z0-9._-]/gi, "_");
  zip.file(
    "video/" + sourceName,
    new Uint8Array(await original.blob.arrayBuffer()),
  );
  const mappings: Record<string, string> = {};
  for (const assignment of assignments) {
    const row = assets.find((asset) => asset.role === assignment.imageTag);
    if (!row) throw new Error("Missing approved image " + assignment.imageTag);
    const approval = approvedImages.find(
      (a) => a.imageTag === assignment.imageTag,
    )!;
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await row.blob.arrayBuffer()),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    if (
      approval.sha256 !== digest ||
      approval.filename !== row.filename ||
      approval.mime !== row.mime
    )
      throw new Error(
        "Approved image bytes changed or were replaced: " +
          assignment.imageTag +
          ". Review and approve the correct file again.",
      );
    const extension =
      row.mime === "image/png"
        ? "png"
        : row.mime === "image/jpeg"
          ? "jpg"
          : "webp";
    const file = assignment.imageTag.replace("@", "") + "." + extension;
    zip.file("images/" + file, new Uint8Array(await row.blob.arrayBuffer()));
    mappings[assignment.imageTag] = file;
  }
  if (environmentTag) {
    const environment = assets.find((asset) => asset.role === environmentTag)!;
    zip.file(
      "images/" +
        environmentTag.replace("@", "") +
        "-environment." +
        (environment.mime === "image/png"
          ? "png"
          : environment.mime === "image/webp"
            ? "webp"
            : environment.mime === "image/gif"
              ? "gif"
              : "jpg"),
      new Uint8Array(await environment.blob.arrayBuffer()),
    );
  }
  zip.file("Kling Prompt.txt", prompt);
  for (const [platform, value] of Object.entries(captions))
    zip.file(
      "captions/" + platform.replace(/[^a-z0-9-]/gi, "_") + ".txt",
      value,
    );
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        format: "Launchpad Trend Radar Kling export 1",
        generatedAt: new Date().toISOString(),
        story: {
          title: story.title,
          evidence: story.sources,
          publishedAt: story.publishedAt,
        },
        sourceVideo: {
          filename: sourceName,
          originalPublicReference: clip?.url || null,
        },
        characterMapping: assignments.map((a) => ({
          characterId: a.characterId || a.imageTag,
          role: a.role,
          replacement: a.identity || "Creator-assigned",
          imageTag: a.imageTag,
          imageFile: mappings[a.imageTag],
          approvedImage: approvedImages.find((p) => p.imageTag === a.imageTag),
        })),
        environmentTag: environmentTag || null,
        environmentFile: environmentTag
          ? "images/" +
            environmentTag.replace("@", "") +
            "-environment." +
            ({
              "image/png": "png",
              "image/jpeg": "jpg",
              "image/webp": "webp",
              "image/gif": "gif",
            }[assets.find((a) => a.role === environmentTag)!.mime] || "bin")
          : null,
        sceneDescription: args.sceneDescription,
        roleTimeline: validateRoleTimeline(
          args.roleTimeline || [],
          assignments.map((a) => a.characterId || a.imageTag),
        ),
        note: "These are fictional AI-parody replacement references, not actual footage of public figures. Kling production is not performed by Launchpad.",
      },
      null,
      2,
    ),
  );
  zip.file(
    "README.txt",
    [
      "Launchpad Kling package: all local images are approved creator assets.",
      "Upload the source video as @Video1 and each named image as the exact @Image number listed in manifest.json.",
      "Keep original audio, scene motion and character IDs. This ZIP has not generated a Kling video.",
      "Do not portray fictional parody as real footage. Only reuse media you own or are authorized to edit.",
    ].join("\n"),
  );
  return zip;
}
export async function downloadKlingPackage(
  args: KlingExportInput,
): Promise<void> {
  const assets = await readLocalAssets(args.projectId);
  const video = assets.find((a) => a.role === "video");
  if (!video)
    throw new Error(
      "Save the authorized source video to this browser before exporting.",
    );
  // Inspect again at export: a resumed project may contain a different local file.
  const videoUrl = URL.createObjectURL(video.blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const media = document.createElement("video");
      media.preload = "metadata";
      const timer = window.setTimeout(
        () => finish(new Error("Video inspection timed out.")),
        10000,
      );
      function finish(error?: Error) {
        window.clearTimeout(timer);
        media.removeAttribute("src");
        media.load();
        if (error) reject(error);
        else resolve();
      }
      media.onloadedmetadata = () => {
        if (
          !Number.isFinite(media.duration) ||
          media.duration < 1 ||
          media.duration > 15 ||
          !media.videoWidth ||
          !media.videoHeight
        )
          finish(
            new Error(
              "The actual source video must be 1–15 seconds with a readable video track.",
            ),
          );
        else {
          try {
            validateRoleTimeline(
              args.roleTimeline || [],
              args.assignments.map((a) => a.characterId || a.imageTag),
              media.duration,
            );
            finish();
          } catch (e) {
            finish(
              e instanceof Error
                ? e
                : new Error("Role intervals exceed the actual video."),
            );
          }
        }
      };
      media.onerror = () =>
        finish(new Error("The local source video cannot be decoded."));
      media.src = videoUrl;
    });
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
  const zip = await buildKlingArchive(args, assets);
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 4 },
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "launchpad-kling-" + args.projectId.slice(0, 8) + ".zip";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
