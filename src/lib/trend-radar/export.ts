import JSZip from "jszip";
import { readLocalAssets } from "./local-media";
import { klingReplacementPrompt, type RadarAssignment, type RadarStory, type RadarClip } from "./core";
import { validateImageTagApprovals, type ImageApproval } from "./image-policy";
export async function downloadKlingPackage(args: {
  projectId: string;
  story: RadarStory;
  clip?: RadarClip;
  assignments: RadarAssignment[];
  approvedImages: ImageApproval[];
  environmentTag: string;
  captions: Record<string, string>;
}): Promise<void> {
  const { projectId, story, assignments, approvedImages, environmentTag, captions, clip } = args;
  const assets = await readLocalAssets(projectId);
  const problems = validateImageTagApprovals(assignments, approvedImages, assets.map((a) => a.role));
  if (problems.length) throw new Error(problems.join(" "));
  const original = assets.find((a) => a.role === "video");
  if (!original) throw new Error("An authorized local source video is required for a fully ready Kling package. YouTube references cannot be automatically downloaded or reused.");
  const prompt = klingReplacementPrompt(assignments, environmentTag);
  if (environmentTag && !assets.some((asset) => asset.role === environmentTag))
    throw new Error("The optional environment image must be added to this browser before exporting.");
  const zip = new JSZip();
  const sourceName = original.filename.replace(/[^a-z0-9._-]/gi, "_");
  zip.file("video/" + sourceName, original.blob);
  const mappings: Record<string, string> = {};
  for (const assignment of assignments) {
    const row = assets.find((asset) => asset.role === assignment.imageTag);
    if (!row) throw new Error("Missing approved image " + assignment.imageTag);
    const extension = row.mime === "image/png" ? "png" : row.mime === "image/jpeg" ? "jpg" : "webp";
    const file = assignment.imageTag.replace("@", "") + "." + extension;
    zip.file("images/" + file, row.blob);
    mappings[assignment.imageTag] = file;
  }
  if (environmentTag) {
    const environment = assets.find((asset) => asset.role === environmentTag)!;
    zip.file("images/" + environmentTag.replace("@", "") + "-environment." +
      (environment.mime === "image/png" ? "png" : "jpg"), environment.blob);
  }
  zip.file("Kling Prompt.txt", prompt);
  for (const [platform, value] of Object.entries(captions))
    zip.file("captions/" + platform.replace(/[^a-z0-9-]/gi, "_") + ".txt", value);
  zip.file("manifest.json", JSON.stringify({
    format: "Launchpad Trend Radar Kling export 1",
    generatedAt: new Date().toISOString(),
    story: { title: story.title, evidence: story.sources, publishedAt: story.publishedAt },
    sourceVideo: { filename: sourceName, originalPublicReference: clip?.url || null },
    characterMapping: assignments.map((a) => ({
      characterId: a.characterId || a.imageTag, role: a.role, replacement: a.identity || "Creator-assigned",
      imageTag: a.imageTag, imageFile: mappings[a.imageTag],
      approvedImage: approvedImages.find((p) => p.imageTag === a.imageTag),
    })),
    environmentTag: environmentTag || null,
    note: "These are fictional AI-parody replacement references, not actual footage of public figures. Kling production is not performed by Launchpad.",
  }, null, 2));
  zip.file("README.txt", [
    "Launchpad Kling package: all local images are approved creator assets.",
    "Upload the source video as @Video1 and each named image as the exact @Image number listed in manifest.json.",
    "Keep original audio, scene motion and character IDs. This ZIP has not generated a Kling video.",
    "Do not portray fictional parody as real footage. Only reuse media you own or are authorized to edit.",
  ].join("\n"));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = "launchpad-kling-" + projectId.slice(0, 8) + ".zip"; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
