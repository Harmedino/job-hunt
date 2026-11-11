import { boundedRadarText } from "@/lib/trend-radar/http";
import { sameOrigin } from "@/lib/auth";
import { json, moduleError } from "@/lib/modules/store";
import { ModuleError } from "@/lib/modules/validation";
import {
  generateRadarImage,
  imageProviderConfiguration,
} from "@/lib/trend-radar/image-service";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET() {
  return json(imageProviderConfiguration());
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request))
      throw new ModuleError("Invalid request origin.", 403);
    const raw = await boundedRadarText(request, 4250000);
    if (raw.length > 4_250_000)
      throw new ModuleError("Reference photo request is too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ModuleError("Invalid image-generation request.");
    }
    return json(await generateRadarImage(body));
  } catch (e) {
    return moduleError(e);
  }
}
