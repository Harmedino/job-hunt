import type { RadarAssignment, RadarStory } from "./core";
export const imageStyles = [
  "Photorealistic",
  "3D cartoon",
  "Cinematic",
  "Sports photography",
  "Custom",
] as const;
export type CharacterImageStyle = (typeof imageStyles)[number];
export type ImageApproval = {
  characterId: string;
  imageTag: string;
  filename: string;
  mime: string;
  prompt: string;
  style: CharacterImageStyle;
  provider: string;
  model: string;
  approvedAt: string;
  sha256?: string;
  assignmentKey?: string;
};
/** Approval is bound to a stable performer and its scene, never its screen position. */
export function assignmentKey(
  assignment: RadarAssignment,
  scene: string,
): string {
  return JSON.stringify([
    assignment.characterId || assignment.imageTag,
    assignment.imageTag,
    assignment.role.trim(),
    assignment.identity?.trim() || "",
    assignment.description?.trim() || "",
    assignment.outfit?.trim() || "",
    scene.trim(),
  ]);
}
export function imageApprovalMatches(
  assignment: RadarAssignment,
  approval: ImageApproval,
  scene: string,
) {
  return (
    approval.characterId === (assignment.characterId || assignment.imageTag) &&
    approval.imageTag === assignment.imageTag &&
    approval.assignmentKey === assignmentKey(assignment, scene) &&
    /^[a-f0-9]{64}$/.test(approval.sha256 || "")
  );
}
export function characterPrompt(args: {
  assignment: RadarAssignment;
  story: Pick<RadarStory, "category" | "title">;
  scene: string;
  style: CharacterImageStyle;
  customStyle?: string;
}): string {
  const { assignment, story, scene, style } = args;
  const identity = (assignment.identity || "").trim();
  const costume = (assignment.outfit || "").trim();
  const details = (assignment.description || "").trim();
  if (!identity)
    throw new Error(
      "Enter a replacement person or original fictional character.",
    );
  if (!scene.trim())
    throw new Error(
      "Describe the target video scene before generating character images.",
    );
  const appearance =
    identity +
    (details ? ". Appearance details supplied by creator: " + details : "");
  const outfit =
    costume ||
    (/training|football/i.test(scene)
      ? "Appropriate believable football training attire and shoes for the original role"
      : /boxing|fight/i.test(scene)
        ? "Appropriate boxing or referee attire and footwear matching the role"
        : /office|meeting/i.test(scene)
          ? "Office attire and realistic shoes suitable for the action"
          : "Clothing and footwear appropriate for this video's character role and scene");
  const styleText =
    style === "Custom" ? (args.customStyle || "").trim() : style;
  if (!styleText) throw new Error("Enter the visual style.");
  return [
    "Generate a SINGLE separate, fictional AI-parody character reference image, NOT a group photo, collage, or split screen.",
    "Subject: " +
      appearance +
      ". Preserve recognizable facial structure, eyes, nose, mouth, hairstyle, age-appropriate appearance, natural build and body proportions from the supplied authentic reference where available. Original performer role: " +
      assignment.role +
      ".",
    "Action: Neutral upright, relaxed reference pose, arms separated enough to show body silhouette. No overlapping people.",
    "Environment: Simple uncluttered backdrop compatible with a scene described as: " +
      scene.slice(0, 500) +
      ".",
    "Clothing: " +
      outfit.slice(0, 300) +
      ". Keep every clothing item and footwear visible.",
    "Lighting: realistic even illumination, sharp eyes, clear facial features, consistent natural shadows, balanced skin detail.",
    "Camera: vertical 9:16 single-person FULL-BODY portrait, head to toe; subject centered, face unobstructed, BOTH FEET and all footwear fully in frame, with headroom and margin below shoes. No cropping. One body only.",
    "Visual treatment: " +
      styleText.slice(0, 150) +
      ". " +
      (style === "Photorealistic"
        ? "Photographic realism, accurate human anatomy and skin texture."
        : "Internally consistent art direction."),
    "Story is only context for a fictional parody, not a depiction of actual events: " +
      story.category +
      ".",
    "If an identity photo is provided, use it as the strongest reference for that person's observable facial traits and hairstyle. Do not copy its background, watermark or other people. Do not invent verification of the identity.",
    "No text, watermark, brand logos, labels, or extra characters.",
  ].join("\n");
}
export function validateImageTagApprovals(
  assignments: RadarAssignment[],
  approvals: ImageApproval[],
  tags: string[],
  scene?: string,
) {
  const problems: string[] = [];
  const approvedIds = new Set<string>();
  for (const a of assignments) {
    const approval = approvals.find(
      (v) => v.characterId === a.characterId && v.imageTag === a.imageTag,
    );
    if (!approval)
      problems.push(
        "Image not approved for " + a.role + " (" + a.imageTag + ").",
      );
    else if (scene !== undefined && !imageApprovalMatches(a, approval, scene))
      problems.push(
        "Review and reapprove the image for changed character or scene: " +
          a.imageTag,
      );
    else if (approvedIds.has(approval.imageTag))
      problems.push("Duplicate approved tag: " + approval.imageTag);
    else if (!tags.includes(a.imageTag))
      problems.push("Approved image missing from this browser: " + a.imageTag);
    if (approval) approvedIds.add(approval.imageTag);
  }
  return problems;
}
