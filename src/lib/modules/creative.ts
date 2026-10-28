import { createHash, randomUUID } from "node:crypto";
import { aiJson } from "../ai";
import { db } from "../db";
import type {
  AnalyticsSnapshot,
  Bounty,
  ContentIdea,
  ContentProfile,
  Metadata,
  PromptVersion,
  TaskPlan,
  YoutubeVideo,
} from "./types";
import { get, lease, ownerFilter, OWNER, put } from "./store";
import { ModuleError, number, object, stringList, text } from "./validation";
import {
  fundingStatus,
  hasFundingEvidence,
  opportunityReward,
  paymentRisk,
} from "./bounty-verification";
async function generated(
  instructions: string,
  data: unknown,
  validate: (value: unknown) => unknown,
) {
  const key = createHash("sha256")
    .update(JSON.stringify({ instructions, data }))
    .digest("hex");
  const col = (await db()).collection("workspace_ai_cache");
  const cached = await col.findOne(
    ownerFilter({ key, expiresAt: { $gt: new Date() } }),
  );
  if (cached) return validate(cached.result);
  if (!(await lease("ai-request", 5)))
    throw new ModuleError("Wait a few seconds between AI requests.", 429);
  const result = await aiJson(instructions, data);
  let valid: unknown;
  try {
    valid = validate(result);
  } catch {
    throw new ModuleError(
      "AI returned incomplete or invalid structured content. Nothing was saved; retry or edit manually.",
      502,
    );
  }
  await col.updateOne(
    ownerFilter({ key }),
    {
      $set: {
        owner: OWNER,
        key,
        result,
        expiresAt: new Date(Date.now() + 86400000),
      },
    },
    { upsert: true },
  );
  return valid;
}
export function validateTaskPlan(value: unknown): TaskPlan {
  const o = object(value);
  return {
    explanation: text(o.explanation, "explanation", 4000, true),
    requirements: stringList(o.requirements),
    codeAreas: stringList(o.codeAreas),
    challenges: stringList(o.challenges),
    plan: stringList(o.plan),
    tests: stringList(o.tests),
    effort: text(o.effort, "effort estimate", 2000, true),
    effortHoursLow: number(o.effortHoursLow, 0, 2000),
    effortHoursHigh: number(o.effortHoursHigh, Number(o.effortHoursLow), 2000),
    rewardValue: text(o.rewardValue, "reward value", 2000, true),
    submission: text(o.submission, "submission", 2000, true),
    uncertainty: text(o.uncertainty, "uncertainty", 2000, true),
  };
}
export async function taskPlan(bounty: Bounty, skills: string) {
  // Only supplied, bounded public excerpts count as inspected repository evidence.
  return (await generated(
    "Explain this coding bounty using only supplied issue metadata and explicitly fetched repository evidence. Return {explanation,requirements:string[],codeAreas:string[],challenges:string[],plan:string[],tests:string[],effort,effortHoursLow:number,effortHoursHigh:number,rewardValue,submission,uncertainty}. Only repositoryEvidence.files are inspected file excerpts. If none are supplied, codeAreas must describe possible areas and must not assert exact files exist. Root directory names are not code inspection. State the actual inspection scope and missing information. Never claim tests were run. Effort must be an uncertain range, never a deadline. Give conservative numeric effortHoursLow and effortHoursHigh estimates from 0 to 2000 hours, with high >= low. Do not assert funding, payout, eligibility, responsiveness, hidden competitors or claim the task. rewardValue must say unavailable if no verified reward exists. Describe checking CONTRIBUTING, sponsor terms and explicitly authorized PR submission by the user. No external actions have been taken.",
    {
      bounty: {
        title: bounty.title,
        description: bounty.description,
        repository: bounty.repository,
        language: bounty.language,
        skills: bounty.skills,
        status: bounty.status,
        reward: hasFundingEvidence(bounty) ? bounty.reward : undefined,
        advertisedReward: hasFundingEvidence(bounty)
          ? undefined
          : opportunityReward(bounty),
        fundingStatus: fundingStatus(bounty),
        paymentRisk: paymentRisk(bounty),
        assignees: bounty.assignees,
        comments: bounty.comments,
        repositoryPushedAt: bounty.repositoryPushedAt,
        repositoryEvidence: bounty.repositoryEvidence,
      },
      skills,
    },
    validateTaskPlan,
  )) as TaskPlan;
}
export function validateIdea(
  value: unknown,
): Omit<
  ContentIdea,
  "id" | "profileId" | "approved" | "rejected" | "referenceIds" | "updatedAt"
> {
  const o = object(value);
  return {
    title: text(o.title, "concept title", 500, true),
    description: text(o.description, "concept", 3000, true),
    action: text(o.action, "main action", 3000, true),
    hook: text(o.hook, "hook", 1000, true),
    audience: text(o.audience, "audience", 1000, true),
    format: text(o.format, "format", 500, true),
    duration: text(o.duration, "duration", 300, true),
    angle: text(o.angle, "original angle", 2000, true),
    requirements: text(o.requirements, "production requirements", 3000, true),
  };
}
export async function generateIdeas(
  profile: ContentProfile,
  topic: string,
  references: YoutubeVideo[],
  count: number,
  variation: string,
  pastContent?: {
    title: string;
    description: string;
    action: string;
    notes: string;
  },
) {
  const result = (await generated(
    "Generate original video concepts. References are public title/description metadata ONLY: do not claim to view footage or infer performance, private statistics, scenes or audio. Do not copy scripts, distinctive scenes, character designs, titles or thumbnails. Use only broad subject inspiration. Honor the editable creative profile; it is not permanently restricted to football. Return {ideas:[{title,description,action,hook,audience,format,duration,angle,requirements}]}. Supply the requested count. No virality or monetization guarantees.",
    {
      profile,
      topic,
      count,
      variation,
      pastContent,
      references: references.map((v) => ({
        title: v.title,
        description: v.description.slice(0, 1500),
      })),
    },
    (value) => {
      const o = object(value);
      if (!Array.isArray(o.ideas) || o.ideas.length !== count)
        throw new ModuleError("AI returned an invalid number of ideas.", 502);
      return o.ideas.map(validateIdea);
    },
  )) as ReturnType<typeof validateIdea>[];
  const ideas: ContentIdea[] = result.map((idea) => ({
    ...idea,
    id: randomUUID(),
    profileId: profile.id,
    approved: false,
    rejected: false,
    referenceIds: references.map((v) => v.id),
    updatedAt: new Date().toISOString(),
  }));
  return ideas; // Explicit Save or Add to Content Plan persists a candidate.
}
export async function researchVideo(video: YoutubeVideo) {
  return generated(
    "Analyze only the supplied YouTube public title and description. Return {facts:string[],interpretations:string[],originalDirections:string[],limitations:string}. Facts must be limited to directly observable metadata. Treat apparent format, story premise, title structure, possible audience interest and creative angle as uncertain interpretation. Do not claim footage/audio/scene analysis or use custom performance metrics. Suggest independent original productions rather than copying protected expression.",
    {
      title: video.title,
      description: video.description,
      channel: video.channelTitle,
    },
    (value) => {
      const o = object(value);
      return {
        facts: stringList(o.facts),
        interpretations: stringList(o.interpretations),
        originalDirections: stringList(o.originalDirections),
        limitations: text(o.limitations, "limitations", 3000, true),
      };
    },
  );
}
export async function klingPrompt(
  idea: ContentIdea,
  profile: ContentProfile,
): Promise<PromptVersion> {
  if (!idea.approved || idea.rejected)
    throw new ModuleError("Approve the idea before creating a Kling prompt.");
  const result = (await generated(
    "Convert this approved idea to a Kling prompt. Return {subject,action,environment,lighting,camera}, strings. Use only details explicitly present in the idea, profile and user-configured reference tags. Leave unsupported environment, lighting or camera fields empty; do not invent arbitrary details, moves, characters or scenes. Use @Image1/@Image2/@Image3 only when those exact mappings were supplied. Do not claim video generation.",
    { idea, profile },
    (value) => {
      const o = object(value);
      return {
        subject: text(o.subject, "subject", 4000, true),
        action: text(o.action, "action", 4000, true),
        environment: text(o.environment, "environment", 2000),
        lighting: text(o.lighting, "lighting", 2000),
        camera: text(o.camera, "camera", 2000),
      };
    },
  )) as Pick<
    PromptVersion,
    "subject" | "action" | "environment" | "lighting" | "camera"
  >;
  return {
    ...result,
    id: randomUUID(),
    ideaId: idea.id,
    text: Object.entries(result)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n\n"),
    createdAt: new Date().toISOString(),
  };
}
export async function generateMetadata(
  idea: ContentIdea,
  platforms: string,
): Promise<Metadata> {
  if (!idea.approved || idea.rejected)
    throw new ModuleError("Approve the idea first.");
  const result = (await generated(
    "Generate original publishing metadata for the approved idea and requested platforms. Return {titles:string[],descriptions:string[],hashtags:string[],hooks:string[],pinnedComments:string[],captions:string[]}, 3 variations for titles, descriptions, hooks, comments and captions, up to 12 hashtags. No copied creator titles or guaranteed virality/monetization. Clearly fictional AI-produced content where appropriate.",
    { idea, platforms },
    (value) => {
      const o = object(value);
      return {
        titles: stringList(o.titles, 5),
        descriptions: stringList(o.descriptions, 5),
        hashtags: stringList(o.hashtags, 12),
        hooks: stringList(o.hooks, 5),
        pinnedComments: stringList(o.pinnedComments, 5),
        captions: stringList(o.captions, 5),
      };
    },
  )) as Pick<
    Metadata,
    | "titles"
    | "descriptions"
    | "hashtags"
    | "hooks"
    | "pinnedComments"
    | "captions"
  >;
  return {
    ...result,
    id: randomUUID(),
    ideaId: idea.id,
    createdAt: new Date().toISOString(),
  };
}
export async function learningRecommendations(snapshot: AnalyticsSnapshot) {
  // Called only after owned-channel authorization, with freshly fetched source reports.
  return generated(
    "Review these authorized own-channel YouTube Analytics reports. Return {observations:string[],experiments:string[],limitations:string}. Ground every observation in the actual provided rows, date range and metric names. Do not calculate new metrics, extrapolate missing retention/CTR/revenue, rank competitors or infer causality. Small samples and publication-period comparisons are uncertain; daily views do not establish the best publishing time. If reports lack data, say unavailable. Suggest original topic/format experiments, not guarantees.",
    snapshot,
    (value) => {
      const o = object(value);
      return {
        observations: stringList(o.observations),
        experiments: stringList(o.experiments),
        limitations: text(o.limitations, "limitations", 4000, true),
      };
    },
  );
}
export async function approvedIdea(id: string) {
  const idea = await get<ContentIdea>("ideas", id);
  if (!idea.approved || idea.rejected)
    throw new ModuleError("Approve this idea first.");
  return idea;
}
export async function savePromptVersion(prompt: PromptVersion) {
  await put("prompts", prompt);
  return prompt;
}
