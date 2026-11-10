import { db } from "./db";
import { ensureJobApplication } from "./application-store";
import { evaluateJobPreferences } from "./job-ranking";
import { jobAvailable } from "./job-intelligence";
import {
  applicationWasApplied,
  employerIdentity,
  sameVacancy,
} from "./vacancy-groups";
import { applicationTarget } from "./assisted-apply";
import { AssistedError } from "./assisted-store";
import {
  emptyProfile,
  type Application,
  type Job,
  type Profile,
} from "./types";
export type AssistantPolicy = {
  preparationEnabled: boolean;
  minScore: number;
  maxPerDay: number;
  maxAgeDays: number;
  eligibleOnly: boolean;
  allowedBoards: string[];
  excludedCompanies: string[];
  preferredRoles: string[];
  startHour: number;
  endHour: number;
  timezone: string;
  aiMaxCallsPerDay: number;
  unattendedSubmission: false;
};
export const defaultAssistantPolicy: AssistantPolicy = {
  preparationEnabled: false,
  minScore: 60,
  maxPerDay: 5,
  maxAgeDays: 14,
  eligibleOnly: true,
  allowedBoards: ["Greenhouse", "Lever", "Ashby"],
  excludedCompanies: [],
  preferredRoles: [],
  startHour: 0,
  endHour: 24,
  timezone: "Africa/Lagos",
  aiMaxCallsPerDay: 0,
  unattendedSubmission: false,
};
export function validateAssistantPolicy(value: unknown): AssistantPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AssistedError("Invalid application preparation policy.");
  const body = { ...defaultAssistantPolicy, ...value } as AssistantPolicy;
  if (body.unattendedSubmission !== false)
    throw new AssistedError(
      "Unattended submissions are not supported or enabled.",
    );
  for (const [key, low, high] of [
    ["minScore", 0, 100],
    ["maxPerDay", 1, 100],
    ["maxAgeDays", 1, 30],
    ["startHour", 0, 23],
    ["endHour", 1, 24],
    ["aiMaxCallsPerDay", 0, 20],
  ] as const)
    if (!Number.isInteger(body[key]) || body[key] < low || body[key] > high)
      throw new AssistedError(`Invalid ${key}.`);
  if (
    body.endHour <= body.startHour ||
    typeof body.preparationEnabled !== "boolean" ||
    typeof body.eligibleOnly !== "boolean"
  )
    throw new AssistedError(
      "Choose valid operating hours and preparation settings.",
    );
  for (const key of [
    "allowedBoards",
    "excludedCompanies",
    "preferredRoles",
  ] as const)
    if (
      !Array.isArray(body[key]) ||
      body[key].length > 100 ||
      body[key].some((x) => typeof x !== "string" || x.length > 200)
    )
      throw new AssistedError(`Invalid ${key}.`);
  if (
    body.allowedBoards.some(
      (b) => !["Greenhouse", "Lever", "Ashby"].includes(b),
    )
  )
    throw new AssistedError("Choose supported application boards.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format();
  } catch {
    throw new AssistedError("Choose a valid timezone.");
  }
  return Object.fromEntries(
    Object.keys(defaultAssistantPolicy).map((k) => [
      k,
      body[k as keyof AssistantPolicy],
    ]),
  ) as AssistantPolicy;
}
export async function assistantPolicy() {
  const row = await (await db())
    .collection("assistant_settings")
    .findOne({ key: "owner" });
  return validateAssistantPolicy(row?.policy || defaultAssistantPolicy);
}
export function policyDay(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function withinOperatingHours(
  policy: AssistantPolicy,
  now = new Date(),
) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: policy.timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= policy.startHour && hour < policy.endHour;
}
export function recommendedApplications(
  jobs: Job[],
  apps: Application[],
  profile: Profile,
  policy: AssistantPolicy,
  now = Date.now(),
) {
  return jobs
    .map((job) => evaluateJobPreferences(job, profile, 0, now))
    .filter((job) => {
      if (
        !jobAvailable(job, now) ||
        job.eligibility === "restricted" ||
        (policy.eligibleOnly && job.eligibility !== "eligible") ||
        !job.careerAllowed ||
        job.stackFit === "incompatible" ||
        job.salaryPolicy === "excluded" ||
        job.score < policy.minScore ||
        apps.some(
          (a) =>
            (a.saved !== false || applicationWasApplied(a)) &&
            sameVacancy(a.job, job),
        )
      )
        return false;
      const posted = Date.parse(job.postedAt || job.lastVerifiedAt || "");
      if (
        !Number.isFinite(posted) ||
        now - posted > policy.maxAgeDays * 86400000 ||
        posted > now + 300000
      )
        return false;
      if (
        policy.excludedCompanies.some(
          (c) => employerIdentity(c) === employerIdentity(job.company),
        ) ||
        (policy.preferredRoles.length &&
          !policy.preferredRoles.some((role) =>
            job.title.toLowerCase().includes(role.toLowerCase()),
          ))
      )
        return false;
      try {
        return policy.allowedBoards.includes(
          applicationTarget(job.url).platform || "Greenhouse",
        );
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.score - a.score);
}
export async function runAssistantPreparation(now = new Date()) {
  const policy = await assistantPolicy();
  if (!policy.preparationEnabled || !withinOperatingHours(policy, now))
    return {
      prepared: 0,
      reason: "Scheduled shortlisting disabled or outside operating hours.",
    };
  const database = await db(),
    collection = database.collection("assistant_preparation_runs"),
    day = policyDay(now, policy.timezone);
  await collection.createIndex({ key: 1 }, { unique: true });
  const lock = await collection
    .findOneAndUpdate(
      {
        key: day,
        $or: [{ leaseUntil: { $lt: now } }, { leaseUntil: { $exists: false } }],
      },
      {
        $set: { leaseUntil: new Date(now.getTime() + 60000) },
        $setOnInsert: { count: 0 },
      },
      { upsert: true, returnDocument: "after" },
    )
    .catch((error) => {
      if (error.code === 11000) return null;
      throw error;
    });
  if (!lock)
    return {
      prepared: 0,
      reason: "Another scheduler is preparing this queue.",
    };
  let count = 0;
  try {
    const apps = await database
        .collection<Application>("applications")
        .find({})
        .toArray(),
      profile = await database.collection("profile").findOne({ key: "owner" });
    const jobs = recommendedApplications(
      await database.collection<Job>("jobs").find({}).toArray(),
      apps,
      { ...emptyProfile, ...profile?.profile },
      policy,
      now.getTime(),
    );
    for (const job of jobs.slice(
      0,
      Math.max(0, policy.maxPerDay - Number(lock.count)),
    )) {
      await ensureJobApplication(job);
      count++;
      await collection.updateOne({ key: day }, { $inc: { count: 1 } });
    }
    return {
      prepared: count,
      reason:
        "Suitable jobs shortlisted. CV approval, form filling and submission remain user-controlled.",
    };
  } finally {
    await collection.updateOne({ key: day }, { $unset: { leaseUntil: "" } });
  }
}
