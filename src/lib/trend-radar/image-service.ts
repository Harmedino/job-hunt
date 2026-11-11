import { createHash } from "node:crypto";
import { ModuleError } from "../modules/validation";
import { db } from "../db";
import { randomUUID } from "node:crypto";
const OPENAI_URL = "https://api.openai.com/v1/images/";
const GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta/models/";
const IMAGE_BYTES_LIMIT = 3 * 1024 * 1024;
const referenceTypes = ["image/png", "image/jpeg", "image/webp"];
const supportedOpenAI = [
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.6-flare",
  "gpt-image-2.6-sunburst",
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
];
const supportedGemini = [
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview",
  "gemini-3.1-flash-lite-image",
];
export function imageProviderConfiguration() {
  const preferred = (
    process.env.TREND_RADAR_IMAGE_PROVIDER || "auto"
  ).toLowerCase();
  const inherited = process.env.AI_PROVIDER?.trim().toLowerCase();
  const chosen =
    preferred === "auto"
      ? inherited === "gemini" && process.env.GEMINI_API_KEY?.trim()
        ? "gemini"
        : inherited === "openai" && process.env.OPENAI_API_KEY?.trim()
          ? "openai"
          : process.env.OPENAI_API_KEY?.trim()
            ? "openai"
            : process.env.GEMINI_API_KEY?.trim()
              ? "gemini"
              : "none"
      : preferred;
  const supported = ["openai", "gemini"].includes(chosen);
  const available =
    chosen === "openai"
      ? !!process.env.OPENAI_API_KEY?.trim()
      : chosen === "gemini"
        ? !!process.env.GEMINI_API_KEY?.trim()
        : false;
  const model = (
    process.env.TREND_RADAR_IMAGE_MODEL ||
    (chosen === "openai" ? "gpt-image-1.5" : "gemini-3.1-flash-image")
  ).trim();
  const validModel =
    chosen === "openai"
      ? supportedOpenAI.includes(model)
      : chosen === "gemini"
        ? supportedGemini.includes(model)
        : false;
  return {
    provider: chosen,
    model,
    configured: supported && available && validModel,
    message: !supported
      ? "Configure OPENAI_API_KEY or GEMINI_API_KEY for actual image generation."
      : !available
        ? "The selected image provider API key is missing."
        : !validModel
          ? "TREND_RADAR_IMAGE_MODEL is not in the supported image-model allowlist."
          : "Image generation provider configured; actual image access, quota and billing are checked when a request is made.",
  };
}
export function decodeImageResponse(base64: unknown, mime: unknown) {
  if (
    typeof base64 !== "string" ||
    !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64) ||
    base64.length > Math.ceil((IMAGE_BYTES_LIMIT * 4) / 3) + 8
  )
    throw new ModuleError(
      "Image provider returned invalid or oversized image data.",
      502,
    );
  const buffer = Buffer.from(base64, "base64");
  if (
    buffer.length < 100 ||
    buffer.length > IMAGE_BYTES_LIMIT ||
    buffer.toString("base64") !== base64
  )
    throw new ModuleError("Image response is incomplete or invalid.", 502);
  const detected = buffer
    .subarray(0, 8)
    .equals(Buffer.from("89504e470d0a1a0a", "hex"))
    ? "image/png"
    : buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
      ? "image/jpeg"
      : buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : "";
  if (
    !detected ||
    (typeof mime === "string" && mime.startsWith("image/") && mime !== detected)
  )
    throw new ModuleError(
      "Image provider did not return a recognized PNG, JPEG, or WebP image.",
      502,
    );
  return {
    base64,
    mime: detected,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    bytes: buffer.length,
  };
}
function imageRef(value: unknown): { mime: string; data: string } | undefined {
  if (value === null || value === undefined) return undefined;
  if (!value || typeof value !== "object")
    throw new ModuleError("Invalid identity photo.");
  const o = value as Record<string, unknown>;
  if (!referenceTypes.includes(String(o.mime)))
    throw new ModuleError("Reference photo must be PNG, JPEG or WebP.");
  if (
    typeof o.base64 !== "string" ||
    o.base64.length > 4.2e6 ||
    !/^[a-zA-Z0-9+/]+={0,2}$/.test(o.base64)
  )
    throw new ModuleError("Reference photo must be less than 3 MB.");
  const bytes = Buffer.from(o.base64, "base64");
  if (
    bytes.length < 100 ||
    bytes.length > 3 * 1024 * 1024 ||
    bytes.toString("base64") !== o.base64
  )
    throw new ModuleError("Invalid reference photo bytes.");
  // Enforce actual file format matches MIME.
  const verified = decodeImageResponse(o.base64, o.mime);
  if (verified.mime !== o.mime)
    throw new ModuleError("Reference photo type mismatch.");
  return { mime: String(o.mime), data: o.base64 };
}
async function providerResponse(res: Response, label: string) {
  if (!res.ok) {
    if (res.status === 429)
      throw new ModuleError(
        label +
          " image quota or rate limit reached; check the provider account and retry.",
        429,
      );
    if ([401, 403].includes(res.status))
      throw new ModuleError(
        label +
          " image-generation access denied. Check the key, billing and image-model permissions.",
        403,
      );
    if (res.status === 404 || res.status === 400)
      throw new ModuleError(
        label +
          " rejected the configured image model or request. Verify image model access and supported input options.",
        503,
      );
    if (res.status >= 500)
      throw new ModuleError(
        label + " image generation is temporarily unavailable.",
        503,
      );
    throw new ModuleError(
      label + " image generation failed (HTTP " + res.status + ").",
      502,
    );
  }
  try {
    if (Number(res.headers.get("content-length")) > 20_000_000)
      throw new Error();
    const reader = res.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20_000_000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new ModuleError(label + " returned unreadable data.", 502);
  }
}
/**
 * Make a real image-generation request, returning a verified image as base64.
 * The provider response is never treated as a successful image without recognizable bytes.
 * The caller must store returned bytes privately on the owner's device.
 */
export async function generateRadarImage(input: unknown) {
  if (!input || typeof input !== "object")
    throw new ModuleError("Invalid image generation request.");
  const o = input as Record<string, unknown>;
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
  if (!prompt || prompt.length < 70 || prompt.length > 6000)
    throw new ModuleError(
      "A detailed character image prompt (70–6000 characters) is required.",
    );
  const tag = typeof o.imageTag === "string" ? o.imageTag : "";
  if (!/^@Image[1-9]\d*$/.test(tag))
    throw new ModuleError("Choose a valid Kling image tag.");
  const ref = imageRef(o.reference);
  const config = imageProviderConfiguration();
  if (!config.configured) throw new ModuleError(config.message, 503);
  const locks = (await db()).collection("trend_radar_image_locks");
  await locks.createIndex({ key: 1 }, { unique: true });
  await locks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const lockId = "owner-image-generation",
    nonce = randomUUID();
  try {
    const acquired = await locks.findOneAndUpdate(
      {
        key: lockId,
        $or: [
          { expiresAt: { $lte: new Date() } },
          { expiresAt: { $exists: false } },
        ],
      },
      {
        $set: { key: lockId, nonce, expiresAt: new Date(Date.now() + 120000) },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!acquired) throw new Error();
  } catch {
    throw new ModuleError(
      "Another image-generation request is running. Wait for it to finish before retrying.",
      429,
    );
  }
  const deadline = AbortSignal.timeout(105000);
  let response: Response;
  try {
    const usage = (await db()).collection("trend_radar_image_usage");
    await usage.createIndex({ key: 1 }, { unique: true });
    await usage.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const windowKey = "owner:" + new Date().toISOString().slice(0, 13);
    const limit = Math.max(
      1,
      Math.min(60, Number(process.env.TREND_RADAR_IMAGE_HOURLY_LIMIT) || 20),
    );
    try {
      await usage.findOneAndUpdate(
        { key: windowKey, count: { $lt: limit } },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(Date.now() + 2 * 3600000) },
        },
        { upsert: true },
      );
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 11000)
        throw new ModuleError(
          "Local image-generation hourly budget reached. Try next hour or adjust TREND_RADAR_IMAGE_HOURLY_LIMIT.",
          429,
        );
      throw e;
    }
    if (config.provider === "openai") {
      const body = {
        model: config.model,
        n: 1,
        prompt:
          prompt +
          "\nGenerate precisely ONE image with exactly ONE character, full-body, vertical 9:16.",
        size: /^gpt-image-1/.test(config.model) ? "1024x1536" : "864x1536",
        quality: "medium",
        output_format: "png",
      };
      let payload: BodyInit = JSON.stringify(body);
      const headers: Record<string, string> = {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      };
      if (ref) {
        const form = new FormData();
        for (const [key, value] of Object.entries(body))
          form.set(key, String(value));
        form.set(
          "image",
          new Blob([Buffer.from(ref.data, "base64")], { type: ref.mime }),
          "identity-reference." +
            (ref.mime === "image/jpeg" ? "jpg" : ref.mime.split("/")[1]),
        );
        payload = form;
      } else headers["Content-Type"] = "application/json";
      response = await fetch(OPENAI_URL + (ref ? "edits" : "generations"), {
        method: "POST",
        headers,
        body: payload,
        signal: deadline,
        cache: "no-store",
        redirect: "error",
      });
      const json = await providerResponse(response, "OpenAI");
      const item = Array.isArray(json.data)
        ? (json.data[0] as Record<string, unknown> | undefined)
        : undefined;
      const image = decodeImageResponse(item?.b64_json, "image/png");
      return { ...image, provider: "OpenAI", model: config.model, prompt, tag };
    }
    const parts: Record<string, unknown>[] = [
      { text: prompt + "\nExactly ONE character in ONE 9:16 portrait image." },
    ];
    if (ref) parts.push({ inlineData: { mimeType: ref.mime, data: ref.data } });
    response = await fetch(GEMINI_ROOT + config.model + ":generateContent", {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: "9:16",
            ...(config.model.startsWith("gemini-2.5-")
              ? {}
              : { imageSize: "1K" }),
          },
        },
      }),
      signal: deadline,
      cache: "no-store",
      redirect: "error",
    });
    const json = await providerResponse(response, "Gemini");
    const candidate = (
      Array.isArray(json.candidates) ? json.candidates[0] : undefined
    ) as Record<string, unknown> | undefined;
    const content = candidate?.content as
      | { parts?: { inlineData?: { data?: string; mimeType?: string } }[] }
      | undefined;
    const part = content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part)
      throw new ModuleError(
        "Gemini returned text or a blocked response, but no image. No generated image was saved.",
        502,
      );
    const image = decodeImageResponse(part.data, part.mimeType);
    return { ...image, provider: "Gemini", model: config.model, prompt, tag };
  } catch (error) {
    if (error instanceof ModuleError) throw error;
    throw new ModuleError(
      "Image provider timed out or could not be reached. No generated image was saved. Check the provider before retrying; a timed-out request may still incur a charge.",
      504,
    );
  } finally {
    await locks.deleteOne({ key: lockId, nonce }).catch(() => {});
  }
}
