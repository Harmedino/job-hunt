import type { Bounty, Money } from "./types";

export const fundingStatuses = ["Verified Funded", "Reward Announced", "Unverified Bounty", "Unpaid / No Reward Found"] as const;
export type FundingStatus = (typeof fundingStatuses)[number];
const https = (url?: string) => {
  try { return !!url && new URL(url).protocol === "https:"; } catch { return false; }
};
export function isInactive(b: Bounty, now = Date.now()) {
  const deadline = b.deadline && Date.parse(b.deadline) + (/^\d{4}-\d{2}-\d{2}$/.test(b.deadline) ? 86400000 - 1 : 0);
  return b.status === "completed" || (!!deadline && deadline < now);
}
export function hasFundingEvidence(b: Bounty, now = Date.now()) {
  const r = b.reward;
  const proof = r?.authoritativeConfirmation;
  // Historical receipts, labels, AI scores and legacy manual links prove no current funding.
  return !!(r && proof && r.verification === "user-verified" &&
    Number.isFinite(Number(r.amount)) && Number(r.amount) > 0 &&
    (r.fundingType === "escrow" || r.fundingType === "deposit") &&
    https(r.evidenceUrl) && r.conditions.trim() && proof.authority.trim() &&
    proof.taskUrl === (b.issueUrl || b.url) &&
    Date.parse(r.verifiedAt) <= now && Date.parse(r.verifiedAt) > now - 7 * 86400000 &&
    Date.parse(proof.validUntil) > now && Date.parse(proof.validUntil) <= Date.parse(r.verifiedAt) + 7 * 86400000);
}
export function fundingStatus(b: Bounty): FundingStatus {
  if (hasFundingEvidence(b)) return "Verified Funded";
  if (b.rewardAnnouncement || b.reward) return "Reward Announced";
  if (b.bountySignal || b.labels?.some((l) => /bounty|reward/i.test(l)) || /\bbount(?:y|ies)\b/i.test(`${b.title} ${b.description}`)) return "Unverified Bounty";
  return "Unpaid / No Reward Found";
}
export function bountyClassification(b: Bounty) {
  return isInactive(b) ? "Inactive" : fundingStatus(b);
}
export function opportunityReward(b: Bounty): Money | undefined {
  return hasFundingEvidence(b) ? b.reward : b.rewardAnnouncement?.reward || b.reward;
}
export function paymentRisk(b: Bounty) {
  if (isInactive(b)) return "Unavailable: the task is closed or its recorded deadline has passed.";
  if (hasFundingEvidence(b)) return "Current funding evidence manually checked against an authoritative source. Acceptance, payout eligibility and payment remain conditional.";
  if (b.reward?.authoritativeConfirmation) return "HIGH — funding evidence has expired or no longer matches this task. Recheck before starting.";
  if (fundingStatus(b) === "Reward Announced") return "HIGH — reward announced; current funding has not been confirmed.";
  return "HIGH — reward terms and current funding are unverified. Do not start on the strength of a bounty label.";
}

export function sourceRewardAnnouncement(title: string, body: string, trustedAuthor: boolean, author: string, url: string) {
  if (!trustedAuthor) return undefined;
  const content = `${title}\n${body}`;
  // A compensation term must be close to a monetary amount; ordinary cost examples are not rewards.
  const match = content.match(/(?:\b(?:bounty|cash reward|reward|compensation|paid task|paid issue|will pay|offering)\b[^\n]{0,45}?((?:USD|EUR|GBP|NGN|\$|€|£)\s*\d[\d,]*(?:\.\d{1,2})?)|((?:USD|EUR|GBP|NGN|\$|€|£)\s*\d[\d,]*(?:\.\d{1,2})?)[^\n]{0,25}?\b(?:bounty|reward|compensation)\b)/i);
  if (!match) return undefined;
  const context = content.slice(Math.max(0, (match.index || 0) - 35), (match.index || 0) + match[0].length);
  if (/\b(?:no\s+(?:(?:cash|paid|available)\s+)?(?:reward|bounty)|unpaid|not paid)\b/i.test(context)) return undefined;
  const amountText = match[1] || match[2];
  const currencyToken = amountText.match(/USD|EUR|GBP|NGN|\$|€|£/i)![0].toUpperCase();
  // A bare dollar symbol is ambiguous; preserve the mention without inventing USD.
  const currency = ({ "€": "EUR", "£": "GBP" } as Record<string, string>)[currencyToken] || (/^[A-Z]{3}$/.test(currencyToken) ? currencyToken : undefined);
  const amount = amountText.replace(/USD|EUR|GBP|NGN|\$|€|£|,|\s/gi, "");
  return { evidenceUrl: url, announcedBy: author, ...(currency && Number.isFinite(Number(amount)) && Number(amount) > 0 ? { reward: { amount, currency } } : {}) };
}
