import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIssue, analyzeBounty, collectBountyCandidates, bountyQueries } from "../src/lib/modules/bounties";
import { bountyClassification, fundingStatus, hasFundingEvidence } from "../src/lib/modules/bounty-verification";
import { filterBounties, bountyEmptyReason } from "../src/lib/modules/bounties-client";
import { ModuleError } from "../src/lib/modules/validation";
import type { Bounty } from "../src/lib/modules/types";

const issue = (number = 1, extra = {}) => ({
  html_url: `https://github.com/example/project/issues/${number}`, title: "React bounty USD 500",
  body: "Reward: USD 500 for a TypeScript fix", labels: [{ name: "bounty" }], state: "open",
  assignees: [], author_association: "OWNER", user: { login: "example" }, ...extra,
});
const funded = (): Bounty => {
  const b = normalizeIssue(issue());
  b.reward = {
    amount: "500", currency: "USD", verification: "user-verified", fundingType: "escrow",
    evidenceUrl: "https://example.com/escrow/task-1", conditions: "On accepted solution", eligibility: "Unverified",
    verifiedAt: new Date().toISOString(), authoritativeConfirmation: { authority: "Fixture escrow authority",
      taskUrl: b.issueUrl!, validUntil: new Date(Date.now() + 86400000).toISOString() },
  };
  return b;
};
test("funding is separate from announcements, past payments, AI and availability", () => {
  const announced = normalizeIssue(issue());
  assert.equal(fundingStatus(announced), "Reward Announced");
  assert.equal(announced.rewardAnnouncement?.reward?.amount, "500");
  const b = funded();
  assert.equal(hasFundingEvidence(b), true); // No past payout evidence is required.
  assert.equal(filterBounties([announced, b], {}).length, 1);
  assert.equal(analyzeBounty(b, "React").score, analyzeBounty(announced, "React").score);
  b.status = "completed";
  assert.equal(fundingStatus(b), "Verified Funded");
  assert.equal(bountyClassification(b), "Inactive");
  assert.equal(filterBounties([b], {}).length, 0);
  assert.equal(filterBounties([b], { verification: "Inactive" }).length, 1);
  b.status = "open";
  b.reward!.authoritativeConfirmation!.validUntil = new Date(Date.now() - 1000).toISOString();
  assert.equal(fundingStatus(b), "Reward Announced");
  b.reward!.payoutEvidenceUrl = "https://example.com/previous-payout";
  assert.equal(hasFundingEvidence(b), false);
  b.reward!.authoritativeConfirmation = undefined;
  assert.equal(hasFundingEvidence(b), false);
});
test("normal issues and unrelated cost examples are not paid opportunities", () => {
  const b = normalizeIssue(issue(1, { title: "React purchase form bug", body: "Example price: USD 500", labels: [] }));
  assert.equal(fundingStatus(b), "Unpaid / No Reward Found");
  assert.equal(filterBounties([b], { verification: "All paid or potentially paid" }).length, 0);
  assert.equal(filterBounties([b], { verification: "Unpaid / No Reward Found" }).length, 1);
  const potential = normalizeIssue(issue(2, { author_association: "NONE", user: { login: "visitor" } }));
  assert.equal(fundingStatus(potential), "Unverified Bounty");
  const billingBug = normalizeIssue(issue(3, { title: "React payment bug", body: "The payment form charges USD 500 incorrectly", labels: [] }));
  assert.equal(fundingStatus(billingBug), "Unpaid / No Reward Found");
  const negated = normalizeIssue(issue(4, { title: "React issue", body: "No bounty USD 500 will be paid", labels: [] }));
  assert.equal(negated.rewardAnnouncement, undefined);
});
test("verified mode rejects mismatched tasks, missing authority, future checks and invalid links", () => {
  for (const mutation of [
    (b: Bounty) => { b.reward!.authoritativeConfirmation!.taskUrl = "https://github.com/other/repo/issues/2"; },
    (b: Bounty) => { b.reward!.authoritativeConfirmation!.authority = ""; },
    (b: Bounty) => { b.reward!.verifiedAt = new Date(Date.now() + 86400000).toISOString(); },
    (b: Bounty) => { b.reward!.evidenceUrl = "not a url"; },
  ]) { const b = funded(); mutation(b); assert.equal(hasFundingEvidence(b), false); }
});
test("queries are independent and paginated results deduplicate before storage", async () => {
  const queries = bountyQueries("React TypeScript repo:example/project is:closed");
  assert.equal(queries.length, 6);
  assert.ok(queries.every((q) => q.includes("is:open") && !q.includes("is:closed")));
  assert.ok(queries.every((q) => !(q.includes("React") && q.includes("TypeScript"))));
  const collected = await collectBountyCandidates("React", async (path) => {
    const page = new URL(`https://api.github.com${path}`).searchParams.get("page");
    return { items: page === "1" ? Array.from({ length: 30 }, (_, i) => issue(i + 1)) : [issue(31)], total_count: 31 };
  }, 12);
  assert.equal(collected.items.length, 31);
  assert.equal(collected.diagnostics.raw, 186);
  assert.equal(collected.diagnostics.duplicates, 155);
  assert.equal(collected.diagnostics.queries.filter((q) => q.page === 2).length, 6);
});
test("source failures retain partial results, rate limits are explicit and empty states explain filters", async () => {
  let calls = 0;
  const partial = await collectBountyCandidates("React", async () => {
    if (++calls === 1) return { items: [issue()] };
    throw new ModuleError("GitHub rate limit reached", 429, new Date(Date.now() + 60000).toISOString());
  });
  assert.equal(partial.items.length, 1);
  assert.equal(partial.diagnostics.queries[1].success, false);
  assert.ok(partial.retryAt);
  assert.match(bountyEmptyReason([normalizeIssue(issue())], [], {verification:"Verified Funded"}), /current verified funding/);
  assert.match(bountyEmptyReason([], [{ id: "github", name: "GitHub", mode: "Official API", message: "API quota exhausted", success: false }], {}), /quota exhausted/);
});
