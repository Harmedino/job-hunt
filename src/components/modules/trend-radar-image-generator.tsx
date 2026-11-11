"use client";
import { useEffect, useMemo, useState } from "react";
import type { RadarAssignment, RadarStory } from "@/lib/trend-radar/core";
import {
  assignmentKey,
  imageApprovalMatches,
  characterPrompt,
  imageStyles,
  type CharacterImageStyle,
  type ImageApproval,
} from "@/lib/trend-radar/image-policy";
import {
  saveLocalAssets,
  readLocalAssets,
} from "@/lib/trend-radar/local-media";
type Output = {
  base64: string;
  mime: string;
  sha256: string;
  provider: string;
  model: string;
  prompt: string;
  tag: string;
  assignmentKey: string;
  style: CharacterImageStyle;
};
const validTag = /^@Image[1-9]\d*$/;
async function toBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read reference photo."));
    reader.readAsDataURL(file);
  });
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
async function outputBlob(output: Output): Promise<Blob> {
  const response = await fetch(
    "data:" + output.mime + ";base64," + output.base64,
  );
  return response.blob();
}
export default function CharacterImageGenerator({
  story,
  assignments,
  onAssignments,
  projectId,
  approvals,
  onApprovals,
  scene,
}: {
  story: RadarStory;
  assignments: RadarAssignment[];
  onAssignments: (assignments: RadarAssignment[]) => void;
  projectId: string;
  approvals: ImageApproval[];
  onApprovals: (rows: ImageApproval[]) => Promise<void>;
  scene: string;
}) {
  const [config, setConfig] = useState<{
    provider: string;
    model: string;
    configured: boolean;
    message: string;
  }>();
  const [style, setStyle] = useState<CharacterImageStyle>("Photorealistic");
  const [customStyle, setCustomStyle] = useState("");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Record<string, Output>>({});
  const [referencePhotos, setReferencePhotos] = useState<Record<string, File>>(
    {},
  );
  const [promptOverrides, setPromptOverrides] = useState<
    Record<string, string>
  >({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void fetch("/api/trend-radar/image", { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        if (active) setConfig(result);
      })
      .catch(() => {
        if (active) setError("Image provider status could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void readLocalAssets(projectId)
      .then((rows) => {
        if (!active) return;
        const next: Record<string, string> = {};
        for (const item of rows)
          if (validTag.test(item.role))
            next[item.role] = URL.createObjectURL(item.blob);
        setPreviews((old) => {
          for (const url of Object.values(old)) URL.revokeObjectURL(url);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId]);
  const prompts = useMemo(
    () =>
      Object.fromEntries(
        assignments.map((a) => {
          try {
            return [
              a.imageTag,
              characterPrompt({
                assignment: a,
                story,
                scene,
                style,
                customStyle,
              }),
            ];
          } catch (error) {
            return [
              a.imageTag,
              error instanceof Error
                ? error.message
                : "Missing image description",
            ];
          }
        }),
      ),
    [assignments, scene, story, style, customStyle],
  );
  function setAssignment(
    index: number,
    key: "identity" | "description" | "outfit",
    value: string,
  ) {
    onAssignments(
      assignments.map((a, i) =>
        i === index
          ? {
              ...a,
              [key]: value,
              characterId: a.characterId || crypto.randomUUID(),
            }
          : a,
      ),
    );
  }
  const generate = async (a: RadarAssignment, prompt: string) => {
    if (working) return;
    setError("");
    setWorking(a.imageTag);
    try {
      if (!a.identity?.trim())
        throw new Error(
          "Enter a real public figure or fictional character name first.",
        );
      if (!validTag.test(a.imageTag)) throw new Error("Invalid Kling tag.");
      const photo = referencePhotos[a.imageTag];
      if (
        photo &&
        (!["image/png", "image/jpeg", "image/webp"].includes(photo.type) ||
          photo.size > 4 * 1024 * 1024)
      )
        throw new Error(
          "Reference photos must be PNG/JPEG/WebP and under 4MB.",
        );
      const body = {
        imageTag: a.imageTag,
        prompt,
        ...(photo
          ? { reference: { mime: photo.type, base64: await toBase64(photo) } }
          : {}),
      };
      const response = await fetch("/api/trend-radar/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "Image provider failed.");
      if (typeof value.base64 !== "string" || !value.mime?.startsWith("image/"))
        throw new Error("Image provider returned no actual image bytes.");
      setPending((old) => ({
        ...old,
        [a.imageTag]: {
          ...value,
          assignmentKey: assignmentKey(a, scene),
          style,
        } as Output,
      }));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Image generation unavailable.",
      );
    } finally {
      setWorking("");
    }
  };
  const approve = async (a: RadarAssignment) => {
    const output = pending[a.imageTag];
    if (!output || output.assignmentKey !== assignmentKey(a, scene)) {
      setError(
        "This draft belongs to an earlier character or scene. Regenerate or upload a matching image before approving.",
      );
      return;
    }
    setWorking(a.imageTag);
    setError("");
    try {
      const blob = await outputBlob(output);
      const name =
        a.imageTag.replace("@", "") +
        "-" +
        (a.identity || "character").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) +
        "." +
        (output.mime === "image/jpeg" ? "jpg" : output.mime.split("/")[1]);
      await saveLocalAssets(projectId, [
        {
          role: a.imageTag,
          file: new File([blob], name, { type: output.mime }),
        },
      ]);
      const assetUrl = URL.createObjectURL(blob);
      setPreviews((old) => {
        if (old[a.imageTag]) URL.revokeObjectURL(old[a.imageTag]);
        return { ...old, [a.imageTag]: assetUrl };
      });
      const row: ImageApproval = {
        characterId: a.characterId || a.imageTag,
        imageTag: a.imageTag,
        filename: name,
        mime: output.mime,
        prompt: output.prompt,
        style: output.style,
        sha256: output.sha256,
        assignmentKey: output.assignmentKey,
        provider: output.provider,
        model: output.model,
        approvedAt: new Date().toISOString(),
      };
      await onApprovals([
        ...approvals.filter((old) => old.imageTag !== a.imageTag),
        row,
      ]);
      setPending((old) => {
        const copy = { ...old };
        delete copy[a.imageTag];
        return copy;
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Local image could not be saved.",
      );
    } finally {
      setWorking("");
    }
  };
  return (
    <section className="radar-image-generator">
      <h3>Character Image Generator · One image per person</h3>
      <p className="module-note">
        Generate actual images using a configured image-capable OpenAI or Gemini
        model. You approve each result separately. Existing approved character
        images are preserved when regenerating another.
      </p>
      <p className={config?.configured ? "module-note" : "module-notice"}>
        Provider: {config?.provider || "unknown"} · Model:{" "}
        {config?.model || "unknown"} ·{" "}
        {config?.message || "Checking configuration…"}
      </p>
      <div className="radar-clip-form">
        <label>
          Image style{" "}
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as CharacterImageStyle)}
          >
            {imageStyles.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {style === "Custom" && (
          <input
            aria-label="Custom image style"
            placeholder="Describe visual style"
            value={customStyle}
            onChange={(e) => setCustomStyle(e.target.value)}
          />
        )}
      </div>
      {error && (
        <p className="module-error" role="alert">
          {error}
        </p>
      )}
      <div className="radar-generated-grid">
        {assignments.map((a, index) => {
          const image = pending[a.imageTag];
          const approved = approvals.find((p) =>
            imageApprovalMatches(a, p, scene),
          );
          const prompt = promptOverrides[a.imageTag] ?? prompts[a.imageTag];
          return (
            <article
              className="radar-generated-card"
              key={a.characterId || a.imageTag}
            >
              <div>
                <strong>
                  {a.imageTag} · {a.role}
                </strong>
                <small>
                  {approved
                    ? "Approved (browser local; metadata saved to project)"
                    : image
                      ? "Generated — awaiting approval"
                      : "Not approved"}
                </small>
              </div>
              <label>
                Replacement identity{" "}
                <input
                  value={a.identity || ""}
                  maxLength={120}
                  placeholder="e.g. manager or footballer name"
                  onChange={(e) =>
                    setAssignment(index, "identity", e.target.value)
                  }
                />
              </label>
              <label>
                Recognizable appearance (from verified reference or creator
                description){" "}
                <textarea
                  rows={2}
                  maxLength={500}
                  value={a.description || ""}
                  onChange={(e) =>
                    setAssignment(index, "description", e.target.value)
                  }
                />
              </label>
              <label>
                Scene clothing{" "}
                <input
                  maxLength={300}
                  value={a.outfit || ""}
                  onChange={(e) =>
                    setAssignment(index, "outfit", e.target.value)
                  }
                  placeholder="e.g. plain white training kit, boots"
                />
              </label>
              <label>
                Authentic identity reference photo (optional){" "}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      setReferencePhotos((old) => ({
                        ...old,
                        [a.imageTag]: file,
                      }));
                  }}
                />
              </label>
              <label>
                Upload a replacement image (review before approval){" "}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!!working}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void (async () => {
                      try {
                        if (
                          file.size > 3 * 1024 * 1024 ||
                          !["image/png", "image/jpeg", "image/webp"].includes(
                            file.type,
                          )
                        )
                          throw new Error("Use PNG/JPEG/WebP up to 3 MB.");
                        const bitmap = await createImageBitmap(file);
                        bitmap.close();
                        const hash = Array.from(
                          new Uint8Array(
                            await crypto.subtle.digest(
                              "SHA-256",
                              await file.arrayBuffer(),
                            ),
                          ),
                        )
                          .map((n) => n.toString(16).padStart(2, "0"))
                          .join("");
                        const base64 = await toBase64(file);
                        setPending((old) => ({
                          ...old,
                          [a.imageTag]: {
                            base64,
                            mime: file.type,
                            sha256: hash,
                            provider: "Creator upload",
                            model: "not AI-generated",
                            prompt: "Creator-supplied replacement image",
                            tag: a.imageTag,
                            assignmentKey: assignmentKey(a, scene),
                            style,
                          },
                        }));
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Image could not be decoded.",
                        );
                      }
                    })();
                  }}
                />
              </label>
              <label>
                Editable image prompt{" "}
                <textarea
                  rows={5}
                  value={prompt}
                  maxLength={6000}
                  onChange={(e) =>
                    setPromptOverrides((old) => ({
                      ...old,
                      [a.imageTag]: e.target.value,
                    }))
                  }
                />
              </label>
              {image && (
                <div className="radar-generated-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={"data:" + image.mime + ";base64," + image.base64}
                    alt={"Generated image for " + a.identity}
                  />
                  <p>
                    {image.provider} · {image.model} · Image draft — review
                    identity, framing and outfit before approving.
                  </p>
                </div>
              )}
              {previews[a.imageTag] && (
                <div className="radar-generated-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previews[a.imageTag]}
                    alt={"Approved local character image for " + a.identity}
                  />
                </div>
              )}
              <div className="module-actions">
                <button
                  className="primary"
                  disabled={!config?.configured || !!working}
                  type="button"
                  onClick={() => void generate(a, prompt)}
                >
                  {working === a.imageTag
                    ? "Generating…"
                    : approved
                      ? "Regenerate (approval preserved)"
                      : "Generate Image"}
                </button>
                {image && image.assignmentKey !== assignmentKey(a, scene) && (
                  <p role="status">
                    Character or scene changed. This draft needs replacement
                    before approval.
                  </p>
                )}
                {image && (
                  <button
                    className="secondary"
                    disabled={
                      !!working ||
                      image.assignmentKey !== assignmentKey(a, scene)
                    }
                    type="button"
                    onClick={() => void approve(a)}
                  >
                    Approve & Save
                  </button>
                )}
                {image && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() =>
                      void outputBlob(image).then((blob) =>
                        download(
                          blob,
                          a.imageTag.replace("@", "") + "-draft.png",
                        ),
                      )
                    }
                  >
                    Download draft
                  </button>
                )}
                {approved && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() =>
                      void readLocalAssets(projectId).then((rows) => {
                        const row = rows.find((r) => r.role === a.imageTag);
                        if (row) download(row.blob, row.filename);
                      })
                    }
                  >
                    Download approved
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
