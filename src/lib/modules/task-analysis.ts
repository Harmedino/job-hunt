import { AiError } from "../ai";
import { analyzeBounty } from "./bounties";
import { taskPlan } from "./creative";
import type { Bounty, BountyAnalysis } from "./types";
import { ModuleError } from "./validation";

export async function taskAnalysis(
  bounty: Bounty,
  skills: string,
  useAi: boolean,
  generate = taskPlan,
): Promise<BountyAnalysis> {
  const analysis = analyzeBounty(bounty, skills);
  if (!useAi) return analysis;
  try {
    analysis.ai = await generate(bounty, skills);
  } catch (error) {
    if (!(error instanceof AiError || error instanceof ModuleError)) throw error;
    analysis.aiWarning = `${error.message} Basic task analysis is available below. The AI task plan was not generated; retry AI analysis later.`;
  }
  return analysis;
}
