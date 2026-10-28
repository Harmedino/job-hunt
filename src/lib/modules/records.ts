import { validateBountyFilters } from "./bounties-client";
import type { TrackedBounty } from "./types";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../db";
import { get, list, put, remove, type Bucket, ownerFilter } from "./store";
import {
  bool,
  choice,
  date,
  httpsUrl,
  id,
  money,
  ModuleError,
  number,
  object,
  stringList,
  text,
  videoId,
} from "./validation";
import { hasFundingEvidence } from "./bounty-verification";
import { analyzeBounty } from "./bounties";
import {
  brunoProfile,
  contentStatuses,
  workStatuses,
  type Bounty,
  type ContentEntry,
  type ContentIdea,
  type ContentProfile,
  type Metadata,
  type Payment,
  type PromptVersion,
} from "./types";
import { validateIdea } from "./creative";
export async function profileById(value: unknown) {
  const key = id(value);
  return key === "bruno"
    ? get<ContentProfile>("profiles", key).catch((e) => {
        if (e instanceof ModuleError && e.status === 404) return brunoProfile;
        throw e;
      })
    : get<ContentProfile>("profiles", key);
}
export function validateTransition(
  current: string,
  next: string,
  hasPayment: boolean,
) {
  choice(next, workStatuses, "work status");
  if (next === "Paid" && !hasPayment)
    throw new ModuleError(
      "Record an actual received payment before marking Paid.",
    );
  if (
    ["Rejected", "Cancelled", "Closed"].includes(current) &&
    !["Saved", current].includes(next)
  )
    throw new ModuleError(
      "Reopen this task as Saved before changing its work status.",
    );
}
export async function saveRecord(kind: string, input: unknown, skills: string) {
  const o = object(input);
  const recordId = o.id ? id(o.id) : randomUUID();
  const now = new Date().toISOString();
  switch (kind) {
    case "profiles": {
      const record = {
        id: recordId,
        name: text(o.name, "profile name", 150, true),
        niche: text(o.niche, "niche", 2000, true),
        character: text(o.character || "", "character", 6000),
        preferences: text(o.preferences || "", "preferences", 6000),
        referenceTags: text(o.referenceTags || "", "reference tags", 2000),
      };
      if (
        [...record.referenceTags.matchAll(/@Image\d+/g)].some(
          (m) => !["@Image1", "@Image2", "@Image3"].includes(m[0]),
        )
      )
        throw new ModuleError(
          "Supported tags are @Image1, @Image2 and @Image3.",
        );
      return put("profiles", record);
    }
    case "topics":
      await profileById(o.profileId);
      if (
        o.channelId &&
        (typeof o.channelId !== "string" || !/^UC[\w-]{22}$/.test(o.channelId))
      )
        throw new ModuleError(
          "Use a public channel ID beginning with UC, or leave it blank.",
        );
      return put("topics", {
        id: recordId,
        title: text(o.title, "topic", 200, true),
        profileId: id(o.profileId),
        channelId: text(o.channelId || "", "channel ID", 50),
      });
    case "tracked": {
      const bountyId = id(o.bountyId);
      const sourceBounty = await get<Bounty>("bounties", bountyId);
      const old = await get<TrackedBounty>("tracked", bountyId).catch((e) => {
        if (e instanceof ModuleError && e.status === 404) return undefined;
        throw e;
      });
      const payments = (await list<Payment>("payments")).filter(
        (p) => p.bountyId === bountyId && !p.voidedAt,
      );
      const status = choice(o.status, workStatuses, "work status");
      validateTransition(old?.status || "Saved", status, payments.length > 0);
      if (status === "Funding Verified" && !hasFundingEvidence(sourceBounty))
        throw new ModuleError(
          "Record current task-specific secured funding evidence before choosing Funding Verified.",
        );
      if (o.claimStatus === "Paid" && !payments.length)
        throw new ModuleError(
          "Record an actual received payment before marking a claim Paid.",
        );
      if (
        o.claimStatus === "Approved unpaid" &&
        !(o.approvalEvidenceUrl || old?.approvalEvidenceUrl)
      )
        throw new ModuleError(
          "Record approval evidence for approved but unpaid rewards.",
        );
      return put("tracked", {
        ...old,
        id: bountyId,
        bountyId,
        status,
        notes: text(o.notes ?? old?.notes ?? "", "notes", 10000),
        deadline: date(o.deadline ?? old?.deadline ?? ""),
        submissionUrl: httpsUrl(o.submissionUrl ?? old?.submissionUrl ?? ""),
        branchUrl: httpsUrl(o.branchUrl ?? old?.branchUrl ?? ""),
        reviewStatus: text(
          o.reviewStatus ?? old?.reviewStatus ?? "",
          "PR review status",
          200,
        ),
        maintainerFeedback: text(
          o.maintainerFeedback ?? old?.maintainerFeedback ?? "",
          "maintainer feedback",
          6000,
        ),
        claimStatus: choice(
          o.claimStatus ?? old?.claimStatus ?? "Not claimed",
          [
            "Not claimed",
            "Claim pending",
            "Approved unpaid",
            "Paid",
            "Disputed",
          ],
          "claim status",
        ),
        claimDate: date(o.claimDate ?? old?.claimDate ?? ""),
        approvalEvidenceUrl: httpsUrl(
          o.approvalEvidenceUrl ?? old?.approvalEvidenceUrl ?? "",
        ),
        approvedReward:
          o.approvedAmount || o.approvedCurrency
            ? money(o.approvedAmount, o.approvedCurrency)
            : old?.approvedReward,
        effortHours:
          o.effortHours !== undefined && o.effortHours !== ""
            ? number(o.effortHours, 0, 2000)
            : old?.effortHours,
        archived:
          o.archived === undefined ? old?.archived || false : bool(o.archived),
        updatedAt: now,
      });
    }
    case "payments": {
      const bountyId = id(o.bountyId);
      await get<Bounty>("bounties", bountyId);
      if (o.confirmation !== "owner-confirmed")
        throw new ModuleError(
          "Confirm that payment was actually received, not just promised.",
        );
      const receivedAt = date(o.receivedAt, true);
      if (Date.parse(receivedAt) > Date.now())
        throw new ModuleError("Received payment date cannot be in the future.");
      const amount = money(o.amount, o.currency),
        evidenceUrl = httpsUrl(o.evidenceUrl, true);
      const duplicate = (await list<Payment>("payments")).find(
        (p) =>
          !p.voidedAt &&
          p.bountyId === bountyId &&
          p.amount === amount.amount &&
          p.currency === amount.currency &&
          p.receivedAt === receivedAt &&
          p.evidenceUrl === evidenceUrl &&
          p.id !== recordId,
      );
      if (duplicate) return duplicate;
      return put("payments", {
        id: recordId,
        bountyId,
        ...amount,
        receivedAt,
        evidenceUrl,
        platform: text(o.platform || "", "payment platform", 150),
        pullRequestUrl: httpsUrl(o.pullRequestUrl || ""),
        notes: text(o.notes || "", "payment notes", 3000),
        confirmation: "owner-confirmed",
      });
    }
    case "reward": {
      const bounty = await get<Bounty>("bounties", id(o.bountyId));
      if (o.confirmed !== true)
        throw new ModuleError("Confirm that you checked funding evidence.");
      if (o.fundingType !== "escrow" && o.fundingType !== "deposit")
        throw new ModuleError(
          "Confirm escrow or deposited funding; a promised reward is not funded.",
        );
      if (o.fundingConfirmed !== true)
        throw new ModuleError(
          "Confirm that an authoritative source identifies current funding for this exact task; a reward announcement or past payout is insufficient.",
        );
      const reward: NonNullable<Bounty["reward"]> = {
        ...money(o.amount, o.currency),
        verification: "user-verified" as const,
        evidenceUrl: httpsUrl(o.evidenceUrl, true),
        fundingType: o.fundingType,
        payoutEvidenceUrl: httpsUrl(o.payoutEvidenceUrl || "", false),
        authoritativeConfirmation: {
          authority: text(o.authority, "funding authority", 500, true),
          taskUrl: bounty.issueUrl || bounty.url,
          validUntil: new Date(Date.parse(now) + 7 * 86400000).toISOString(),
        },
        conditions: text(o.conditions, "payment conditions", 4000, true),
        eligibility: text(
          o.eligibility || "Unverified for Nigeria",
          "eligibility",
          2000,
          true,
        ),
        verifiedAt: now,
      };
      const value = {
        ...bounty,
        reward,
        fundingArrangements: [
          ...(bounty.fundingArrangements || []),
          ...(bounty.reward ? [bounty.reward] : []),
          reward,
        ].filter(
          (r, i, all) =>
            all.findIndex(
              (other) =>
                other.evidenceUrl === r.evidenceUrl &&
                other.verifiedAt === r.verifiedAt,
            ) === i,
        ),
        deadline: date(o.deadline || ""),
        sponsor: text(o.sponsor || "Unknown", "sponsor", 300),
      };
      value.analysis = analyzeBounty(value, skills);
      const saved = await put("bounties", value);
      if (
        (await list<TrackedBounty>("tracked")).some(
          (t) => t.bountyId === bounty.id,
        )
      ) {
        const noticeId =
          "bounty-funding:" +
          createHash("sha256")
            .update(
              JSON.stringify([
                bounty.id,
                reward.amount,
                reward.currency,
                reward.evidenceUrl,
                reward.conditions,
                now.slice(0, 10),
              ]),
            )
            .digest("hex");
        await (await db())
          .collection("notifications")
          .updateOne(
            { id: noticeId },
            {
              $setOnInsert: {
                id: noticeId,
                title: `Current funding evidence recorded: ${bounty.title}. Payment remains conditional.`,
                createdAt: now,
                read: false,
              },
            },
            { upsert: true },
          );
      }
      return saved;
    }
    case "payment-review": {
      const bounty = await get<Bounty>("bounties", id(o.bountyId));
      const nigeria = choice(
          o.nigeria || "unknown",
          ["unknown", "supported", "restricted"],
          "Nigeria payout eligibility",
        ),
        eligibilitySourceUrl = httpsUrl(o.eligibilitySourceUrl || "");
      if (
        nigeria !== "unknown" &&
        (!eligibilitySourceUrl || o.confirmed !== true)
      )
        throw new ModuleError(
          "Review and cite published country/payout evidence, or leave Nigeria eligibility unknown.",
        );
      return put("bounties", {
        ...bounty,
        paymentReview: {
          nigeria,
          eligibilitySourceUrl,
          methods: text(o.methods || "", "payment methods", 2000),
          fees: text(o.fees || "", "fees and restrictions", 3000),
          acceptanceCriteria: text(
            o.acceptanceCriteria || "",
            "acceptance criteria",
            5000,
          ),
          historicalPayoutUrl: httpsUrl(o.historicalPayoutUrl || ""),
          checkedAt: now,
        },
        ...(o.competingPrCount !== undefined && o.competingPrCount !== ""
          ? { competingPrCount: number(o.competingPrCount, 0, 10000) }
          : {}),
      });
    }
    case "ideas": {
      const profileId = id(o.profileId);
      await profileById(profileId);
      const rejected = bool(o.rejected ?? false);
      return put("ideas", {
        ...validateIdea(o),
        id: recordId,
        profileId,
        approved: rejected ? false : bool(o.approved ?? false),
        rejected,
        referenceIds: stringList(o.referenceIds || [], 10).map(id),
        updatedAt: now,
      });
    }
    case "prompts": {
      const idea = await get<ContentIdea>("ideas", id(o.ideaId));
      if (!idea.approved || idea.rejected)
        throw new ModuleError("Approve the idea first.");
      // Edits always append: historical prompt versions cannot be overwritten.
      const record: PromptVersion = {
        id: randomUUID(),
        ideaId: idea.id,
        subject: text(o.subject, "subject", 4000, true),
        action: text(o.action, "action", 4000, true),
        environment: text(o.environment || "", "environment", 2000),
        lighting: text(o.lighting || "", "lighting", 2000),
        camera: text(o.camera || "", "camera", 2000),
        text: text(o.text, "prompt", 14000, true),
        createdAt: now,
      };
      return put("prompts", record);
    }
    case "entries": {
      const idea = await get<ContentIdea>("ideas", id(o.ideaId));
      if (!idea.approved || idea.rejected)
        throw new ModuleError("Approve the idea before adding it to the plan.");
      const promptId = o.promptId ? id(o.promptId) : "";
      const metadataId = o.metadataId ? id(o.metadataId) : "";
      if (
        promptId &&
        (await get<PromptVersion>("prompts", promptId)).ideaId !== idea.id
      )
        throw new ModuleError("Prompt belongs to a different idea.");
      if (
        metadataId &&
        (await get<Metadata>("metadata", metadataId)).ideaId !== idea.id
      )
        throw new ModuleError("Metadata belongs to a different idea.");
      const status = choice(o.status, contentStatuses, "production status");
      const targetDate = date(o.targetDate || "");
      const publishedUrl = httpsUrl(o.publishedUrl || "");
      if (status === "Scheduled" && !targetDate)
        throw new ModuleError("Add a target date before scheduling.");
      if (status === "Published" && !publishedUrl)
        throw new ModuleError("Add the published URL first.");
      if (
        publishedUrl &&
        /youtube\.com|youtu\.be/.test(new URL(publishedUrl).hostname)
      )
        videoId(publishedUrl);
      return put("entries", {
        id: recordId,
        ideaId: idea.id,
        title: text(o.title, "content title", 500, true),
        channel: text(o.channel || "", "channel", 150),
        platform: text(o.platform || "YouTube", "platform", 100),
        targetDate,
        status,
        notes: text(o.notes || "", "production notes", 10000),
        references: text(o.references || "", "reference links", 4000),
        promptId,
        metadataId,
        publishedUrl,
        generatedComplete: bool(o.generatedComplete ?? false),
        updatedAt: now,
      });
    }
    case "journal":
      if (o.entryId) await get<ContentEntry>("entries", id(o.entryId));
      return put("journal", {
        id: recordId,
        entryId: o.entryId ? id(o.entryId) : "",
        worked: text(o.worked || "", "what worked", 5000),
        failed: text(o.failed || "", "what failed", 5000),
        next: text(o.next, "next experiment", 5000, true),
        createdAt: now,
      });
    case "settings": {
      const previous = await get<{ bountyFilters?: unknown }>(
        "settings",
        "preferences",
      ).catch(() => undefined);
      return put("settings", {
        id: "preferences",
        bountyQuery: text(o.bountyQuery || "", "bounty query", 150),
        bountyRefresh: bool(o.bountyRefresh),
        youtubeRefresh: bool(o.youtubeRefresh),
        refreshHours: number(o.refreshHours, 6, 168),
        highMatch: number(o.highMatch, 0, 100),
        ...(o.bountyFilters !== undefined
          ? { bountyFilters: validateBountyFilters(o.bountyFilters) }
          : previous?.bountyFilters
            ? { bountyFilters: previous.bountyFilters }
            : {}),
      });
    }
    default:
      throw new ModuleError("Unsupported record type.", 404);
  }
}
export async function deleteRecord(kind: string, recordId: string) {
  if (
    ![
      "profiles",
      "topics",
      "ideas",
      "entries",
      "journal",
      "tracked",
      "payments",
    ].includes(kind)
  )
    throw new ModuleError("Unsupported deletion.");
  if (
    kind === "profiles" &&
    (await list<ContentIdea>("ideas")).some((i) => i.profileId === recordId)
  )
    throw new ModuleError("This profile is used by saved ideas.");
  if (
    kind === "ideas" &&
    (await list<ContentEntry>("entries")).some((e) => e.ideaId === recordId)
  )
    throw new ModuleError("Remove this idea from the plan first.");
  if (kind === "ideas") {
    await (await db())
      .collection("workspace_prompts")
      .deleteMany(ownerFilter({ ideaId: recordId }));
    await (await db())
      .collection("workspace_metadata")
      .deleteMany(ownerFilter({ ideaId: recordId }));
  }
  if (kind === "tracked") {
    const tracked = await get<TrackedBounty>("tracked", recordId);
    await put("tracked", {
      ...tracked,
      archived: true,
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  if (kind === "payments") {
    const payment = await get<Payment>("payments", recordId);
    await put("payments", { ...payment, voidedAt: new Date().toISOString() });
    const remaining = (await list<Payment>("payments")).filter(
      (p) =>
        p.bountyId === payment.bountyId &&
        !p.voidedAt &&
        p.confirmation === "owner-confirmed",
    );
    if (!remaining.length)
      await (
        await (await import("./store")).collection("tracked")
      ).updateOne(ownerFilter({ bountyId: payment.bountyId, status: "Paid" }), {
        $set: { status: "Accepted", claimStatus: "Not claimed" },
      });
    return;
  }
  await remove(kind as Bucket, recordId);
}
