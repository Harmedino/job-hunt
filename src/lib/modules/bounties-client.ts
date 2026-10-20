import type { Bounty, TrackedBounty, Payment } from "./types";
import type { SourceState } from "./types";
import { bountyClassification, fundingStatus, opportunityReward } from "./bounty-verification";
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
};
export function filterBounties(values: Bounty[], f: BountyFilters) {
  const result = values.filter(
    (b) =>
      ((f.verification || "Verified Funded") === "All paid or potentially paid"
        ? !["Inactive", "Unpaid / No Reward Found"].includes(bountyClassification(b))
        : bountyClassification(b) === (f.verification || "Verified Funded")) &&
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
        (!!opportunityReward(b) && !!f.currency && Number(opportunityReward(b)!.amount) >= f.min)) &&
      (f.max === undefined ||
        (!!opportunityReward(b) && !!f.currency && Number(opportunityReward(b)!.amount) <= f.max)) &&
      (!f.since ||
        Date.parse(b.updatedAt || b.publishedAt || "") >= Date.parse(f.since)),
  );
  const recent = (b: Bounty) => Date.parse(b.updatedAt || b.publishedAt || "") || 0;
  const score = (b: Bounty) => b.analysis?.score || 0;
  const funding = (b: Bounty) => ["Verified Funded", "Reward Announced", "Unverified Bounty", "Unpaid / No Reward Found"].indexOf(fundingStatus(b));
  const rewardOrder = (a: Bounty, b: Bounty) => {
    const ar = opportunityReward(a), br = opportunityReward(b);
    // Different currencies are grouped, never treated as equivalent amounts.
    return (ar?.currency || "ZZZ").localeCompare(br?.currency || "ZZZ") || Number(br?.amount || 0) - Number(ar?.amount || 0);
  };
  return result.sort((a, b) =>
    f.sort === "newest" ? recent(b) - recent(a)
      : f.sort === "reward" ? rewardOrder(a, b)
      : f.sort === "effort" ? (a.analysis?.ai?.effortHoursLow ?? Infinity) - (b.analysis?.ai?.effortHoursLow ?? Infinity)
      : f.sort === "payment risk" ? funding(a) - funding(b) || score(b) - score(a)
      : score(b) - score(a) || funding(a) - funding(b) || recent(b) - recent(a) || rewardOrder(a, b),
  );
}
export function bountyEmptyReason(values: Bounty[], sources: SourceState[], filters: BountyFilters) {
  const github = sources.find((s) => s.id === "github");
  if (!values.length) {
    if (github?.success === false) return `GitHub discovery failed: ${github.message} Existing results are preserved. This does not mean no opportunities exist.`;
    return github?.lastSuccessAt ? "The last successful source search returned no saved opportunities. Try different keywords or import an original task URL." : "No opportunities have been saved yet. Refresh GitHub discovery to query real sources.";
  }
  if (values.every((b) => bountyClassification(b) === "Inactive")) return "Only inactive saved tasks are available. Refresh discovery for open issues.";
  if ((!filters.verification || filters.verification === "Verified Funded") && !values.some((b) => bountyClassification(b) === "Verified Funded"))
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
  return {
    available: currencyTotals(
      bounties
        .filter((b) => bountyClassification(b) === "Verified Funded" && b.status === "open")
        .map((b) => b.reward!),
    ),
    received: currencyTotals(payments),
    active: tracked.filter((t) =>
      ["Evaluating", "Applied/Claimed", "Working"].includes(t.status),
    ).length,
    submitted: tracked.filter((t) => t.status === "Submitted").length,
    accepted: tracked.filter((t) => t.status === "Accepted").length,
    completed: tracked.filter((t) => t.status === "Paid").length,
  };
}
