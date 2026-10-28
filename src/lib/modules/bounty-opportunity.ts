import type { Bounty, TrackedBounty } from "./types";
import {
  bountyClassification,
  fundingStatus,
  hasFundingEvidence,
  opportunityReward,
} from "./bounty-verification";
export const bountySections = [
  "Verified Funded",
  "Paid Opportunities to Investigate",
  "Needs Funding Verification",
  "Unpaid Contributions",
  "Inactive",
] as const;
export function bountySection(b: Bounty) {
  const status = bountyClassification(b);
  return status === "Verified Funded"
    ? "Verified Funded"
    : status === "Reward Announced"
      ? "Paid Opportunities to Investigate"
      : status === "Unverified Bounty"
        ? "Needs Funding Verification"
        : status === "Inactive"
          ? "Inactive"
          : "Unpaid Contributions";
}
export function bountyIdentity(b: Bounty) {
  const issue =
    b.issueUrl ||
    (/github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(b.url) ? b.url : "");
  if (issue) {
    try {
      const u = new URL(issue),
        m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
      if (m)
        return `github:${m[1].toLowerCase()}/${m[2].toLowerCase()}:${m[3]}`;
    } catch {}
  }
  try {
    const u = new URL(b.url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (/^utm_|^(ref|source|gclid|fbclid)$/i.test(key))
        u.searchParams.delete(key);
    u.searchParams.sort();
    return u.href.replace(/\/$/, "");
  } catch {
    return b.id;
  }
}
export function groupBountyAdvertisements(values: Bounty[]) {
  const groups = new Map<string, Bounty>();
  for (const raw of values) {
    const key = bountyIdentity(raw),
      old = groups.get(key),
      advertisements = raw.advertisements?.length
        ? raw.advertisements
        : [
            {
              source: raw.source,
              url: raw.url,
              rewardAnnouncement: raw.rewardAnnouncement,
            },
          ];
    if (!old) {
      groups.set(key, {
        ...raw,
        aliasIds: [...new Set([raw.id, ...(raw.aliasIds || [])])],
        advertisements,
      });
      continue;
    }
    const primary =
      hasFundingEvidence(raw) && !hasFundingEvidence(old) ? raw : old;
    groups.set(key, {
      ...primary,
      aliasIds: [
        ...new Set([
          old.id,
          raw.id,
          ...(old.aliasIds || []),
          ...(raw.aliasIds || []),
        ]),
      ],
      advertisements: [...(old.advertisements || []), ...advertisements].filter(
        (ad, i, all) =>
          all.findIndex(
            (other) => other.url === ad.url && other.source === ad.source,
          ) === i,
      ),
      fundingArrangements: [
        ...(old.fundingArrangements || []),
        ...(raw.fundingArrangements || []),
        ...(old.reward ? [old.reward] : []),
        ...(raw.reward ? [raw.reward] : []),
      ].filter(
        (r, i, all) =>
          all.findIndex(
            (other) =>
              other.evidenceUrl === r.evidenceUrl &&
              other.verifiedAt === r.verifiedAt,
          ) === i,
      ),
    });
  }
  return [...groups.values()];
}
export function bountyIsHandled(b: Bounty, tracked: TrackedBounty[]) {
  return tracked.some(
    (t) =>
      t.bountyId === b.id ||
      t.bountyId === bountyIdentity(b) ||
      b.aliasIds?.includes(t.bountyId),
  );
}
export function bountyOpportunity(b: Bounty) {
  const text = b.title + " " + b.description,
    skills = b.analysis?.matchedSkills || [],
    unsupported =
      /\b(?:rust|golang|c\+\+|c#|java)\b/i.test(b.title) &&
      !skills.some((s) =>
        new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(b.title),
      ),
    advanced =
      /cryptograph|vulnerability research|exploit development|kernel|compiler backend|consensus algorithm|rewrite (?:the )?infrastructure|design (?:a |the )?distributed architecture|kubernetes operator/i.test(
        b.title,
      ) || b.difficulty === "hard",
    suspicious =
      /upfront fee|personal deposit|pay (?:a |the )?(?:registration|training|security) fee|send (?:your )?(?:password|private key|API key)/i.test(
        text,
      ),
    notTask =
      /introductions:|your first bounty|on the house|referral bonus|free credits|general freelance|hiring announcement/i.test(
        b.title,
      ),
    suitable = !unsupported && !advanced && !suspicious && !notTask;
  const low = b.analysis?.ai?.effortHoursLow,
    high = b.analysis?.ai?.effortHoursHigh;
  const competition = b.competingPrCount;
  const criteria = [
    {
      label: "Funding credibility",
      points: hasFundingEvidence(b)
        ? 25
        : fundingStatus(b) === "Reward Announced"
          ? 10
          : fundingStatus(b) === "Unverified Bounty"
            ? 3
            : 0,
      maximum: 25,
      reason: hasFundingEvidence(b)
        ? "Current exact-task funding proof is recorded. Payment remains conditional."
        : "Advertised reward or bounty signal only; funding must be checked.",
    },
    {
      label: "Actual skill mentions",
      points: Math.min(30, skills.length * 6),
      maximum: 30,
      reason: skills.length
        ? skills.join(", ") + " found in task metadata; confirm proficiency."
        : "No supporting profile skill match established.",
    },
    {
      label: "Availability and assignment",
      points: b.status === "open" && !b.assignees.length ? 10 : 0,
      maximum: 10,
      reason: `${b.status}; ${b.assignees.length} known assignees.`,
    },
    {
      label: "Reward evidence",
      points: opportunityReward(b) ? 5 : 0,
      maximum: 5,
      reason:
        "Amount presence only. Different currencies are not treated as equivalent.",
    },
    {
      label: "Estimated effort",
      points:
        high !== undefined && high <= 16
          ? 5
          : high !== undefined && high <= 40
            ? 3
            : 0,
      maximum: 5,
      reason:
        low === undefined
          ? "Unknown effort; no implementation time invented."
          : `AI estimate ${low}–${high} hours; uncertain and unverified.`,
    },
    {
      label: "Known competition",
      points:
        competition === 0
          ? 5
          : competition !== undefined
            ? Math.max(0, 5 - competition)
            : 0,
      maximum: 5,
      reason:
        competition === undefined
          ? "Competition is unknown, not zero."
          : `${competition} publicly linked candidate PRs; relevance requires review.`,
    },
    {
      label: "Repository activity",
      points:
        b.repositoryPushedAt &&
        Date.now() - Date.parse(b.repositoryPushedAt) < 30 * 86400000
          ? 5
          : 0,
      maximum: 5,
      reason: b.repositoryPushedAt
        ? `Last observed push ${b.repositoryPushedAt}.`
        : "Repository activity unverified.",
    },
    {
      label: "Maintainer response",
      points: b.maintainerResponseAt ? 5 : 0,
      maximum: 5,
      reason: b.maintainerResponseAt
        ? `Public maintainer comment ${b.maintainerResponseAt}; not a response-time guarantee.`
        : "Responsiveness unknown.",
    },
    {
      label: "Acceptance criteria",
      points:
        /acceptance criteria|expected (?:result|behavior|behaviour)|steps to reproduce|must pass|definition of done/i.test(
          b.description,
        )
          ? 5
          : 0,
      maximum: 5,
      reason: "Issue text signals only; confirm exact acceptance conditions.",
    },
    {
      label: "Nigeria payout evidence",
      points:
        b.paymentReview?.nigeria === "supported" &&
        b.paymentReview.eligibilitySourceUrl
          ? 5
          : 0,
      maximum: 5,
      reason:
        b.paymentReview?.nigeria === "supported"
          ? "Owner-reviewed published payout coverage; confirm fees and account requirements."
          : "Nigeria payout support remains unknown or restricted.",
    },
  ];
  return {
    suitable,
    reason: notTask
      ? "Promotional or general advertisement, not a specific paid coding deliverable."
      : suspicious
        ? "Suspicious payment/credential demand: do not proceed."
        : advanced
          ? "Advanced or infrastructure-heavy task, outside the preferred beginner/intermediate scope."
          : unsupported
            ? "The task title requires an unestablished primary stack."
            : "Candidate development task; inspect code, acceptance criteria and payment evidence before starting.",
    score:
      suitable && bountySection(b) !== "Inactive"
        ? criteria.reduce((sum, c) => sum + c.points, 0)
        : 0,
    criteria,
    effortLow: low,
    effortHigh: high,
    competition,
  };
}
export function fundingChecklist(b: Bounty) {
  return [
    {
      label: "Original issue open",
      state:
        b.status === "open"
          ? "observed"
          : b.status === "unknown"
            ? "unknown"
            : "not available",
      evidence: b.issueUrl || b.url,
    },
    {
      label: "Task-specific monetary reward",
      state: opportunityReward(b) ? "advertised" : "unknown",
      evidence: b.rewardAnnouncement?.evidenceUrl || b.reward?.evidenceUrl,
    },
    {
      label: "Current secured funding",
      state: hasFundingEvidence(b)
        ? "owner-reviewed current evidence"
        : "not established",
      evidence: b.reward?.evidenceUrl,
    },
    {
      label: "Acceptance and payment conditions",
      state: b.reward?.conditions ? "documented" : "unknown",
      evidence: b.reward?.evidenceUrl,
    },
    {
      label: "Assignment and competing PRs",
      state: `${b.assignees.length} known assignees; ${b.competingPrCount === undefined ? "competition unknown" : b.competingPrCount + " linked candidate PRs"}`,
      evidence: b.issueUrl,
    },
    {
      label: "Nigeria payout eligibility",
      state: b.paymentReview?.nigeria || "unknown",
      evidence: b.paymentReview?.eligibilitySourceUrl,
    },
    {
      label: "Payment methods, fees and restrictions",
      state:
        b.paymentReview?.methods && b.paymentReview?.fees
          ? "owner-recorded; verify before work"
          : "unknown",
      evidence: b.paymentReview?.eligibilitySourceUrl,
    },
    {
      label: "Historical payout evidence (does not fund this task)",
      state:
        b.paymentReview?.historicalPayoutUrl || b.reward?.payoutEvidenceUrl
          ? "provided"
          : "not provided",
      evidence:
        b.paymentReview?.historicalPayoutUrl || b.reward?.payoutEvidenceUrl,
    },
  ];
}
