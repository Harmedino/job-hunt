import {
  bountySection,
  bountyOpportunity,
  bountyIsHandled,
  groupBountyAdvertisements,
} from "./bounty-opportunity";
import type { Bounty, TrackedBounty, Payment } from "./types";
import type { SourceState } from "./types";
import {
  bountyClassification,
  fundingStatus,
  opportunityReward,
} from "./bounty-verification";
export { hasFundingEvidence } from "./bounty-verification";
export type BountyFilters = {
  verification?: string;
  keyword?: string;
  language?: string;
  difficulty?: string;
  source?: string;
  repository?: string;
  status?: string;
  skill?: string;
  currency?: string;
  min?: number;
  max?: number;
  since?: string;
  sort?: string;
  showHandled?: boolean;
  includeUnsuitable?: boolean;
  maxEffort?: number;
};
export function filterBounties(
  values: Bounty[],
  f: BountyFilters,
  tracked: TrackedBounty[] = [],
) {
  const result = groupBountyAdvertisements(values).filter(
    (b) =>
      ((f.verification || "All paid or potentially paid") ===
      "All paid or potentially paid"
        ? !["Inactive", "Unpaid / No Reward Found"].includes(
            bountyClassification(b),
          )
        : bountyClassification(b) ===
            (f.verification || "All paid or potentially paid") ||
          bountySection(b) === f.verification) &&
      (f.showHandled || !bountyIsHandled(b, tracked)) &&
      (f.includeUnsuitable || bountyOpportunity(b).suitable) &&
      (f.maxEffort === undefined ||
        b.analysis?.ai?.effortHoursHigh === undefined ||
        b.analysis.ai.effortHoursHigh <= f.maxEffort) &&
      (!f.keyword ||
        `${b.title} ${b.description}`
          .toLowerCase()
          .includes(f.keyword.toLowerCase())) &&
      (!f.language || b.language.toLowerCase() === f.language.toLowerCase()) &&
      (!f.difficulty || b.difficulty === f.difficulty) &&
      (!f.source || b.source === f.source) &&
      (!f.repository ||
        b.repository.toLowerCase().includes(f.repository.toLowerCase())) &&
      (!f.status || b.status === f.status) &&
      (!f.skill ||
        b.skills.some((s) =>
          s.toLowerCase().includes(f.skill!.toLowerCase()),
        )) &&
      (!f.currency || opportunityReward(b)?.currency === f.currency) &&
      (f.min === undefined ||
        (!!opportunityReward(b) &&
          !!f.currency &&
          Number(opportunityReward(b)!.amount) >= f.min)) &&
      (f.max === undefined ||
        (!!opportunityReward(b) &&
          !!f.currency &&
          Number(opportunityReward(b)!.amount) <= f.max)) &&
      (!f.since ||
        Date.parse(b.updatedAt || b.publishedAt || "") >= Date.parse(f.since)),
  );
  const recent = (b: Bounty) =>
    Date.parse(b.updatedAt || b.publishedAt || "") || 0;
  const score = (b: Bounty) => bountyOpportunity(b).score;
  const funding = (b: Bounty) =>
    [
      "Verified Funded",
      "Reward Announced",
      "Unverified Bounty",
      "Unpaid / No Reward Found",
    ].indexOf(fundingStatus(b));
  const rewardOrder = (a: Bounty, b: Bounty) => {
    const ar = opportunityReward(a),
      br = opportunityReward(b);
    // Different currencies are grouped, never treated as equivalent amounts.
    return (
      (ar?.currency || "ZZZ").localeCompare(br?.currency || "ZZZ") ||
      Number(br?.amount || 0) - Number(ar?.amount || 0)
    );
  };
  const hasVerified = (b: Bounty) => fundingStatus(b) === "Verified Funded";
  const valueOrder = (a: Bounty, b: Bounty) => {
    const value = (bounty: Bounty) => {
      const hours = bounty.analysis?.ai?.effortHoursHigh;
      return hasVerified(bounty) && hours && hours > 0
        ? Number(opportunityReward(bounty)?.amount) / hours
        : undefined;
    };
    const av = value(a),
      bv = value(b);
    if (av === undefined || bv === undefined)
      return av === undefined ? (bv === undefined ? 0 : 1) : -1;
    return (
      (opportunityReward(a)?.currency || "").localeCompare(
        opportunityReward(b)?.currency || "",
      ) || bv - av
    );
  };
  return result.sort((a, b) =>
    f.sort === "competition"
      ? (a.competingPrCount ?? Infinity) - (b.competingPrCount ?? Infinity) ||
        score(b) - score(a)
      : f.sort === "skills"
        ? (b.analysis?.matchedSkills.length || 0) -
            (a.analysis?.matchedSkills.length || 0) || score(b) - score(a)
        : f.sort === "verified_reward"
          ? Number(!hasVerified(a)) - Number(!hasVerified(b)) ||
            rewardOrder(a, b)
          : f.sort === "value"
            ? valueOrder(a, b)
            : f.sort === "newest"
              ? recent(b) - recent(a)
              : f.sort === "reward"
                ? rewardOrder(a, b)
                : f.sort === "effort"
                  ? (a.analysis?.ai?.effortHoursHigh ?? Infinity) -
                    (b.analysis?.ai?.effortHoursHigh ?? Infinity)
                  : f.sort === "payment risk"
                    ? funding(a) - funding(b) || score(b) - score(a)
                    : score(b) - score(a) ||
                      funding(a) - funding(b) ||
                      recent(b) - recent(a) ||
                      rewardOrder(a, b),
  );
}
export function bountyEmptyReason(
  values: Bounty[],
  sources: SourceState[],
  filters: BountyFilters,
) {
  const github = sources.find((s) => s.id === "github");
  if (!values.length) {
    if (github?.success === false)
      return `GitHub discovery failed: ${github.message} Existing results are preserved. This does not mean no opportunities exist.`;
    return github?.lastSuccessAt
      ? "The last successful source search returned no saved opportunities. Try different keywords or import an original task URL."
      : "No opportunities have been saved yet. Refresh GitHub discovery to query real sources.";
  }
  if (values.every((b) => bountyClassification(b) === "Inactive"))
    return "Only inactive saved tasks are available. Refresh discovery for open issues.";
  if (
    filters.verification === "Verified Funded" &&
    !values.some((b) => bountyClassification(b) === "Verified Funded")
  )
    return "No active opportunities have current verified funding. Other saved tasks may have announced rewards or incomplete evidence. Verified-only mode keeps them hidden; past payout history is not required.";
  return "Opportunities were saved but none match the active filters. Reset filters or explicitly choose another funding classification.";
}
export function currencyTotals(values: { amount: string; currency: string }[]) {
  // Integer minor units avoid floating point accounting and cross-currency addition.
  const units = new Map<string, bigint>();
  for (const v of values) {
    const digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: v.currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    const [whole, fraction = ""] = v.amount.split(".");
    const minor =
      BigInt(whole) * BigInt(10 ** digits) +
      BigInt(fraction.padEnd(digits, "0") || "0");
    units.set(v.currency, (units.get(v.currency) || BigInt(0)) + minor);
  }
  return Object.fromEntries(
    [...units].map(([currency, minor]) => {
      const digits =
        new Intl.NumberFormat("en", {
          style: "currency",
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2;
      const raw = minor.toString().padStart(digits + 1, "0");
      return [
        currency,
        digits ? `${raw.slice(0, -digits)}.${raw.slice(-digits)}` : raw,
      ];
    }),
  );
}
export function bountyEarnings(
  bounties: Bounty[],
  tracked: TrackedBounty[],
  payments: Payment[],
) {
  bounties = groupBountyAdvertisements(bounties);
  return {
    available: currencyTotals(
      bounties
        .filter(
          (b) =>
            bountyClassification(b) === "Verified Funded" &&
            b.status === "open",
        )
        .map((b) => opportunityReward(b)!),
    ),
    advertised: currencyTotals(
      bounties
        .filter((b) => b.status === "open" && !!opportunityReward(b))
        .map((b) => opportunityReward(b)!),
    ),
    received: currencyTotals(
      payments.filter(
        (p) => p.confirmation === "owner-confirmed" && !p.voidedAt,
      ),
    ),
    submittedRewards: currencyTotals(
      tracked
        .filter((t) =>
          ["Submitted", "In Review", "Merged", "Reward Claimed"].includes(
            t.status,
          ),
        )
        .flatMap((t) => {
          const bounty = bounties.find((b) => b.id === t.bountyId);
          const reward = bounty && opportunityReward(bounty);
          return reward ? [reward] : [];
        }),
    ),
    approvedUnpaid: currencyTotals(
      tracked
        .filter(
          (t) => t.claimStatus === "Approved unpaid" && !!t.approvedReward,
        )
        .map((t) => t.approvedReward!),
    ),
    pendingClaims: tracked.filter(
      (t) => t.claimStatus === "Claim pending" || t.status === "Reward Claimed",
    ).length,
    monthly: Object.fromEntries(
      [
        ...new Set(
          payments
            .filter((p) => p.confirmation === "owner-confirmed" && !p.voidedAt)
            .map((p) => p.receivedAt.slice(0, 7)),
        ),
      ]
        .sort()
        .map((month) => [
          month,
          currencyTotals(
            payments.filter(
              (p) =>
                p.confirmation === "owner-confirmed" &&
                !p.voidedAt &&
                p.receivedAt.startsWith(month),
            ),
          ),
        ]),
    ),
    recordedHours: tracked.reduce((sum, t) => sum + (t.effortHours || 0), 0),
    active: tracked.filter((t) =>
      [
        "Evaluating",
        "Funding Verified",
        "Assignment Requested",
        "Applied/Claimed",
        "Working",
      ].includes(t.status),
    ).length,
    submitted: tracked.filter((t) =>
      [
        "Submitted",
        "In Review",
        "Merged",
        "Reward Claimed",
        "Accepted",
        "Paid",
      ].includes(t.status),
    ).length,
    merged: tracked.filter(
      (t) => t.status === "Merged" || t.reviewStatus === "Merged",
    ).length,
    approvedPrs: tracked.filter(
      (t) => t.reviewStatus === "Approved review observed",
    ).length,
    accepted: tracked.filter((t) => t.status === "Accepted").length,
    completed: tracked.filter((t) => t.status === "Paid").length,
  };
}

export function validateBountyFilters(input: unknown): BountyFilters {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid bounty filters.");
  const value = input as Record<string, unknown>,
    result: BountyFilters = {};
  for (const key of [
    "verification",
    "keyword",
    "language",
    "difficulty",
    "source",
    "repository",
    "status",
    "skill",
    "currency",
    "since",
    "sort",
  ] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string" || value[key].length > 200)
        throw new Error("Invalid bounty filter.");
      result[key] = value[key];
    }
  }
  for (const key of ["showHandled", "includeUnsuitable"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean")
        throw new Error("Invalid bounty preference.");
      result[key] = value[key];
    }
  }
  for (const key of ["min", "max", "maxEffort"] as const) {
    if (value[key] !== undefined) {
      if (
        typeof value[key] !== "number" ||
        !Number.isFinite(value[key]) ||
        value[key] < 0 ||
        value[key] > 1e12
      )
        throw new Error("Invalid bounty range.");
      result[key] = value[key];
    }
  }
  return result;
}

export function paymentNgnEstimates(
  payments: Payment[],
  rates: import("../career-preferences").ExchangeRate[],
  now = Date.now(),
): {
  currency: string;
  amount: string;
  ngnEstimate?: number;
  rate?: import("../career-preferences").ExchangeRate;
  reason?: string;
}[] {
  const totals = currencyTotals(
    payments.filter((p) => p.confirmation === "owner-confirmed" && !p.voidedAt),
  );
  return Object.entries(totals).map(([currency, amount]) => {
    const rate =
      currency === "NGN"
        ? {
            currency: "NGN",
            ngnPerUnit: 1,
            asOf: new Date(now).toISOString().slice(0, 10),
            source: "Native NGN receipts",
          }
        : rates.find((r) => r.currency === currency);
    const current =
      rate &&
      Number.isFinite(rate.ngnPerUnit) &&
      rate.ngnPerUnit > 0 &&
      Date.parse(rate.asOf) <= now &&
      now - Date.parse(rate.asOf) <= 30 * 86400000;
    return {
      currency,
      amount,
      ...(current
        ? {
            ngnEstimate:
              Math.round(Number(amount) * rate!.ngnPerUnit * 100) / 100,
            rate: rate!,
          }
        : {
            reason:
              "No current configured exchange-rate basis; original received currency retained.",
          }),
    };
  });
}
