import { ModuleError } from "../modules/validation";
/** Consume a bounded body even when Content-Length is missing or untrustworthy. */
export async function boundedRadarText(
  value: Request | Response,
  limit: number,
): Promise<string> {
  if (Number(value.headers.get("content-length")) > limit)
    throw new ModuleError(
      "Trend Radar request or provider response exceeds its size limit.",
      413,
    );
  const reader = value.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value: part } = await reader.read();
    if (done) break;
    total += part.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ModuleError(
        "Trend Radar request or provider response exceeds its size limit.",
        413,
      );
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks).toString("utf8");
}
