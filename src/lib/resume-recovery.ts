import { createHash } from "node:crypto";
import { aiConnection } from "./ai";
import type { Profile } from "./types";
import type { ResumeTarget } from "./resume-types";
/** Exact-input, private checkpoint key. No credential value enters storage. */
export function resumeRecoveryKey(
  profile: Profile,
  target: ResumeTarget,
  options?: import("./resume-options").ResumeOptions,
) {
  const c = aiConnection();
  return createHash("sha256")
    .update(
      JSON.stringify({
        schema: 2,
        profile,
        target,
        options,
        provider: c.provider,
        model: c.model,
        modelPolicy: c.modelPolicy,
        fallbackModel: c.fallbackModel,
      }),
    )
    .digest("hex");
}
