import type { Bounty, TrackedBounty, Payment } from "./types";
export type BountyFilters = {
  includeUnverified?: boolean;
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
export function hasFundingEvidence(b: Bounty) {
  const r = b.reward;
  return !!(
    r &&
    r.verification === "user-verified" &&
    Number.isFinite(Number(r.amount)) &&
    Number(r.amount) > 0 &&
    /^https:\/\//i.test(r.evidenceUrl) &&
    (r.fundingType === "escrow" || r.fundingType === "deposit") &&
    /^https:\/\//i.test(r.payoutEvidenceUrl || "") &&
    r.conditions.trim() &&
    Number.isFinite(Date.parse(r.verifiedAt))
  );
}
export function filterBounties(values: Bounty[], f: BountyFilters) {
  const result = values.filter(
    (b) =>
      (f.includeUnverified || hasFundingEvidence(b)) &&
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
      (!f.currency || b.reward?.currency === f.currency) &&
      (f.min === undefined ||
        (!!b.reward && !!f.currency && Number(b.reward.amount) >= f.min)) &&
      (f.max === undefined ||
        (!!b.reward && !!f.currency && Number(b.reward.amount) <= f.max)) &&
      (!f.since ||
        Date.parse(b.updatedAt || b.publishedAt || "") >= Date.parse(f.since)),
  );
  return result.sort((a, b) =>
    f.sort === "match"
      ? (b.analysis?.score || 0) - (a.analysis?.score || 0)
      : f.sort === "reward"
        ? f.currency
          ? Number(b.reward?.currency === f.currency ? b.reward.amount : -1) -
            Number(a.reward?.currency === f.currency ? a.reward.amount : -1)
          : (a.reward?.currency || "ZZZ").localeCompare(
              b.reward?.currency || "ZZZ",
            ) || Number(b.reward?.amount || 0) - Number(a.reward?.amount || 0)
        : f.sort === "effort"
          ? (a.analysis?.ai?.effortHoursLow ?? Infinity) -
              (b.analysis?.ai?.effortHoursLow ?? Infinity) ||
            ["easy", "medium", "hard", "unknown"].indexOf(a.difficulty) -
              ["easy", "medium", "hard", "unknown"].indexOf(b.difficulty)
          : (Date.parse(b.updatedAt || b.publishedAt || "") || 0) -
            (Date.parse(a.updatedAt || a.publishedAt || "") || 0),
  );
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
        .filter((b) => hasFundingEvidence(b) && b.status === "open")
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
