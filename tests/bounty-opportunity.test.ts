import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeIssue,
  enrichRewardFromComments,
} from "../src/lib/modules/bounties";
import {
  bountySection,
  bountyOpportunity,
  groupBountyAdvertisements,
  fundingChecklist,
} from "../src/lib/modules/bounty-opportunity";
import {
  filterBounties,
  bountyEarnings,
  paymentNgnEstimates,
} from "../src/lib/modules/bounties-client";
import { hasFundingEvidence } from "../src/lib/modules/bounty-verification";
import {
  inspectBountyRepository,
  inspectIssueActivity,
} from "../src/lib/modules/bounty-repository";
import type { Bounty, Payment, TrackedBounty } from "../src/lib/modules/types";
const issue = (number = 1, extra = {}) => ({
  html_url: `https://github.com/fixture/project/issues/${number}`,
  title: "React form validation bug",
  body: "Reward: USD 100 for fixing this TypeScript form. Expected result: validation rejects empty fields.",
  labels: [{ name: "bounty" }, { name: "good first issue" }],
  state: "open",
  assignees: [],
  author_association: "MEMBER",
  user: { login: "maintainer" },
  ...extra,
});
const bounty = (number = 1) => ({
  ...normalizeIssue(issue(number)),
  analysis: {
    score: 50,
    confidence: "Metadata only",
    matchedSkills: ["React", "TypeScript"],
    criteria: [],
    paymentRisk: "Unverified",
    eligibility: "Unknown for Nigeria",
    generatedAt: new Date().toISOString(),
  },
});
const funded = (number = 2): Bounty => {
  const b = bounty(number);
  return {
    ...b,
    reward: {
      amount: "200",
      currency: "USD",
      verification: "user-verified",
      fundingType: "escrow",
      evidenceUrl: "https://example.org/escrow/" + number,
      conditions: "Accepted issue solution; owner reviewed terms.",
      eligibility: "Unknown for Nigeria",
      verifiedAt: new Date().toISOString(),
      authoritativeConfirmation: {
        authority: "Test escrow authority",
        taskUrl: b.issueUrl!,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  };
};
test("useful advertised candidates remain visible without being promoted to current funding", () => {
  const advertised = bounty(),
    verified = funded(),
    signal = { ...bounty(3), rewardAnnouncement: undefined };
  assert.equal(bountySection(advertised), "Paid Opportunities to Investigate");
  assert.equal(bountySection(signal), "Needs Funding Verification");
  assert.equal(filterBounties([advertised, verified, signal], {}).length, 3);
  assert.equal(
    filterBounties([advertised, verified, signal], {
      verification: "Verified Funded",
    }).length,
    1,
  );
  assert.ok(
    bountyOpportunity(verified).score > bountyOpportunity(advertised).score,
  );
  assert.equal(hasFundingEvidence(advertised), false);
  assert.match(
    fundingChecklist(advertised).find(
      (c) => c.label === "Nigeria payout eligibility",
    )!.state,
    /unknown/,
  );
  verified.updatedAt = new Date(Date.now() + 1000).toISOString();
  assert.equal(hasFundingEvidence(verified), false);
});
test("grouped platform ads preserve distinct funding evidence and saved tasks stay handled across rediscovery", () => {
  const b = funded(),
    mirror = {
      ...b,
      id: "algora-ad",
      source: "Algora" as const,
      url: "https://algora.io/fixture/reward",
      reward: undefined,
    },
    opire = {
      ...b,
      id: "opire-ad",
      source: "Opire" as const,
      url: "https://opire.dev/rewards/fixture",
      reward: {
        ...b.reward!,
        amount: "75",
        evidenceUrl: "https://example.org/opire-escrow",
      },
    };
  const grouped = groupBountyAdvertisements([b, mirror, opire]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].advertisements?.length, 3);
  assert.equal(grouped[0].fundingArrangements?.length, 2);
  const tracked = [
    {
      id: b.id,
      bountyId: b.id,
      status: "Saved",
      notes: "",
      deadline: "",
      submissionUrl: "",
      updatedAt: "",
    },
  ] as TrackedBounty[];
  assert.equal(filterBounties([mirror], {}, tracked).length, 0);
  assert.equal(filterBounties(grouped, {}, tracked).length, 0);
  assert.equal(
    filterBounties(grouped, { showHandled: true }, tracked).length,
    1,
  );
  assert.equal(
    filterBounties(
      [b, { ...b, id: b.id + "-later", issueUrl: b.issueUrl }],
      {},
      tracked,
    ).length,
    0,
  );
});
test("unpaid, promotional, advanced and unsafe tasks require explicit selection or stay excluded", () => {
  const unpaid = {
    ...bounty(),
    rewardAnnouncement: undefined,
    bountySignal: false,
    labels: [],
    description: "Fix a React form as an ordinary contribution.",
  };
  assert.equal(filterBounties([unpaid], {}).length, 0);
  assert.equal(
    filterBounties([unpaid], { verification: "Unpaid Contributions" }).length,
    1,
  );
  for (const title of [
    "Design a distributed architecture",
    "Rust compiler backend rewrite",
    "Your first bounty is on the house",
  ])
    assert.equal(bountyOpportunity({ ...bounty(), title }).suitable, false);
  assert.equal(
    bountyOpportunity({
      ...bounty(),
      description: "Send your private key to receive payment.",
    }).suitable,
    false,
  );
  assert.equal(
    filterBounties(
      [{ ...bounty(), title: "Rust compiler backend rewrite" }],
      {},
    ).length,
    0,
  );
  assert.equal(
    filterBounties([{ ...bounty(), title: "Rust compiler backend rewrite" }], {
      includeUnsuitable: true,
    }).length,
    1,
  );
});
test("repository analysis reports actual bounded files and preserves unknown competition", async () => {
  const b = bounty();
  const reader = async (path: string): Promise<unknown> => {
    if (path.endsWith("/contents"))
      return [
        { path: "package.json", type: "file" },
        { path: "CONTRIBUTING.md", type: "file" },
        { path: "tests", type: "dir" },
      ];
    if (path.endsWith("/contents/tests"))
      return [{ path: "tests/form.test.ts" }];
    if (path.includes("/contents/"))
      return {
        type: "file",
        encoding: "base64",
        content: Buffer.from(
          path.endsWith("package.json")
            ? '{"scripts":{"test":"node --test"}}'
            : "Run tests and follow contribution guidance.",
        ).toString("base64"),
        size: 80,
        html_url:
          "https://github.com/fixture/project/blob/main/" +
          path.split("/").at(-1),
      };
    return { private: false, default_branch: "main" };
  };
  const evidence = await inspectBountyRepository(b, reader);
  assert.equal(evidence.files.length, 2);
  assert.match(evidence.scope, /2 bounded public file excerpts/);
  assert.ok(evidence.rootFiles.includes("tests/form.test.ts"));
  const denied = await inspectBountyRepository(b, async () => ({
    private: true,
  }));
  assert.equal(denied.files.length, 0);
  assert.match(denied.scope, /not inspected/);
  const activity = await inspectIssueActivity(b, async (path) =>
    path.includes("timeline")
      ? [
          {
            source: {
              issue: {
                html_url: "https://github.com/fixture/project/pull/4",
                pull_request: {},
                state: "open",
                title: "Candidate fix",
              },
            },
          },
        ]
      : [{ author_association: "MEMBER", created_at: "2026-10-20T12:00:00Z" }],
  );
  assert.equal(activity.linkedPullRequests?.length, 1);
  const merged = await inspectIssueActivity(b, async (path) =>
    path.includes("timeline")
      ? [
          {
            source: {
              issue: {
                html_url: "https://github.com/acme/web/pull/2",
                state: "closed",
                pull_request: { merged_at: "2026-10-20T12:00:00Z" },
              },
            },
          },
        ]
      : [],
  );
  assert.equal(merged.linkedPullRequests?.[0]?.state, "merged");
  const closed = await inspectIssueActivity(b, async (path) =>
    path.includes("timeline")
      ? [
          {
            source: {
              issue: {
                html_url: "https://github.com/acme/web/pull/2",
                state: "closed",
                pull_request: {},
              },
            },
          },
        ]
      : [],
  );
  assert.equal(closed.linkedPullRequests?.[0]?.state, "closed");
  assert.equal(activity.competingPrCount, undefined);
  assert.equal(activity.maintainerResponseAt, "2026-10-20T12:00:00Z");
});
test("maintainer comments may announce a reward but ordinary comments and cost examples cannot fund it", async () => {
  const b = { ...bounty(), rewardAnnouncement: undefined };
  const updated = await enrichRewardFromComments(b, async () => [
    {
      html_url: b.issueUrl + "#issuecomment-1",
      body: "Reward: USD 250 for this fix",
      author_association: "MEMBER",
      user: { login: "maintainer" },
    },
  ]);
  assert.equal(updated.rewardAnnouncement?.reward?.amount, "250");
  assert.equal(hasFundingEvidence(updated), false);
  const visitor = await enrichRewardFromComments(b, async () => [
    {
      html_url: b.issueUrl + "#issuecomment-2",
      body: "Reward: USD 250",
      author_association: "NONE",
      user: { login: "visitor" },
    },
  ]);
  assert.equal(visitor.rewardAnnouncement, undefined);
});
test("received, submitted and approved totals remain separate, with per-currency dated estimates", () => {
  const b = funded();
  const tracked = [
    {
      id: b.id,
      bountyId: b.id,
      status: "Merged",
      notes: "",
      deadline: "",
      submissionUrl: "https://github.com/fixture/project/pull/4",
      updatedAt: "",
      claimStatus: "Approved unpaid",
      approvedReward: { amount: "100", currency: "USD" },
      effortHours: 4,
    },
  ] as TrackedBounty[];
  const payment: Payment = {
    id: "receipt-1",
    bountyId: b.id,
    amount: "25",
    currency: "USD",
    receivedAt: "2026-10-01",
    evidenceUrl: "https://example.org/receipt",
    notes: "",
    confirmation: "owner-confirmed",
  };
  const totals = bountyEarnings([b], tracked, [
    payment,
    {
      ...payment,
      id: "voided",
      amount: "500",
      voidedAt: new Date().toISOString(),
    },
  ]);
  assert.deepEqual(totals.received, { USD: "25.00" });
  assert.deepEqual(totals.approvedUnpaid, { USD: "100.00" });
  assert.deepEqual(totals.submittedRewards, { USD: "200.00" });
  assert.deepEqual(totals.monthly, { "2026-10": { USD: "25.00" } });
  assert.equal(totals.recordedHours, 4);
  assert.equal(paymentNgnEstimates([payment], [])[0].ngnEstimate, undefined);
  const rate = {
    currency: "USD",
    ngnPerUnit: 1000,
    asOf: new Date().toISOString().slice(0, 10),
    source: "Test-only manual rate, not live FX",
  };
  assert.equal(paymentNgnEstimates([payment], [rate])[0].ngnEstimate, 25000);
  assert.equal(
    paymentNgnEstimates([payment], [{ ...rate, asOf: "2020-01-01" }])[0]
      .ngnEstimate,
    undefined,
  );
});
