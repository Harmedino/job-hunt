import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import {
  normalizeIssue,
  persistBounty,
  importBounty,
} from "../src/lib/modules/bounties";
import { saveRecord, deleteRecord } from "../src/lib/modules/records";
import { get, list, ensureModuleIndexes } from "../src/lib/modules/store";
import { closeDb } from "../src/lib/db";
import {
  bountyEarnings,
  filterBounties,
} from "../src/lib/modules/bounties-client";
import { syncTrackedPullRequest } from "../src/lib/modules/bounty-repository";
import type { Payment, TrackedBounty } from "../src/lib/modules/types";
test(
  "bounty stages, manual imports, status sync, receipt deduplication and archives preserve truthful work/payment history",
  { skip: !process.env.TEST_MONGODB_URI, timeout: 30000 },
  async () => {
    const oldUri = process.env.MONGODB_URI,
      oldDb = process.env.MONGODB_DB,
      originalFetch = globalThis.fetch;
    const client = new MongoClient(process.env.TEST_MONGODB_URI!);
    const name = "job_hunt_bounty_workflow_" + process.pid;
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = name;
    const database = client.db(name);
    try {
      await ensureModuleIndexes();
      const bounty = normalizeIssue({
        html_url: "https://github.com/fixture/project/issues/12",
        title: "React form bug",
        body: "Reward: USD 100 for fixing TypeScript form validation.",
        state: "open",
        labels: [{ name: "bounty" }],
        author_association: "MEMBER",
        user: { login: "maintainer" },
      });
      await persistBounty(bounty, "React, TypeScript");
      await saveRecord(
        "tracked",
        { bountyId: bounty.id, status: "Saved", notes: "Preserve this note" },
        "",
      );
      await assert.rejects(
        () =>
          saveRecord(
            "tracked",
            { bountyId: bounty.id, status: "Funding Verified" },
            "",
          ),
        /funding evidence/,
      );
      await assert.rejects(
        () =>
          saveRecord(
            "payment-review",
            { bountyId: bounty.id, nigeria: "supported" },
            "",
          ),
        /Review and cite/,
      );
      await saveRecord(
        "payment-review",
        {
          bountyId: bounty.id,
          nigeria: "unknown",
          methods: "Unknown; ask sponsor",
          fees: "Not established",
        },
        "",
      );
      const tracked = (await saveRecord(
        "tracked",
        {
          bountyId: bounty.id,
          status: "Submitted",
          submissionUrl: "https://github.com/fixture/project/pull/40",
          branchUrl: "https://github.com/contributor/project/tree/fix-form",
          claimStatus: "Not claimed",
          effortHours: 3,
        },
        "",
      )) as TrackedBounty;
      assert.equal(tracked.notes, "Preserve this note");
      const merged = await syncTrackedPullRequest(tracked, async (path) =>
        path.endsWith("/pulls/40")
          ? {
              state: "closed",
              merged_at: "2026-10-20T12:00:00Z",
              updated_at: "2026-10-20T12:00:00Z",
            }
          : { private: false },
      );
      assert.equal(merged.status, "Merged");
      assert.equal(merged.reviewStatus, "Merged");
      assert.deepEqual(bountyEarnings([bounty], [merged], []).received, {});
      await syncTrackedPullRequest(merged, async (path) =>
        path.endsWith("/pulls/40")
          ? {
              state: "closed",
              merged_at: "2026-10-20T12:00:00Z",
              updated_at: "2026-10-20T12:00:00Z",
            }
          : { private: false },
      );
      assert.equal(
        await database
          .collection("notifications")
          .countDocuments({ id: { $regex: "^bounty-pr:" } }),
        1,
      );
      await assert.rejects(
        () =>
          saveRecord("tracked", { bountyId: bounty.id, status: "Paid" }, ""),
        /actual received/,
      );
      await assert.rejects(
        () =>
          saveRecord(
            "tracked",
            {
              bountyId: bounty.id,
              status: "Reward Claimed",
              claimStatus: "Approved unpaid",
              approvedAmount: "100",
              approvedCurrency: "USD",
            },
            "",
          ),
        /approval evidence/,
      );
      await saveRecord(
        "tracked",
        {
          bountyId: bounty.id,
          status: "Reward Claimed",
          claimStatus: "Approved unpaid",
          approvedAmount: "100",
          approvedCurrency: "USD",
          approvalEvidenceUrl:
            "https://github.com/fixture/project/pull/40#issuecomment-1",
          claimDate: new Date().toISOString().slice(0, 10),
        },
        "",
      );
      const paymentInput = {
        bountyId: bounty.id,
        amount: "50",
        currency: "USD",
        receivedAt: "2026-10-20",
        evidenceUrl: "https://example.org/receipts/transaction-1",
        confirmation: "owner-confirmed",
        platform: "Test payment provider",
        pullRequestUrl: "https://github.com/fixture/project/pull/40",
      };
      const first = (await saveRecord("payments", paymentInput, "")) as Payment,
        repeat = (await saveRecord("payments", paymentInput, "")) as Payment;
      assert.equal(first.id, repeat.id);
      assert.equal((await list<Payment>("payments")).length, 1);
      assert.deepEqual(
        bountyEarnings([bounty], [], await list<Payment>("payments")).received,
        { USD: "50.00" },
      );
      await saveRecord(
        "tracked",
        { bountyId: bounty.id, status: "Paid", claimStatus: "Paid" },
        "",
      );
      await deleteRecord("payments", first.id);
      assert.ok((await get<Payment>("payments", first.id)).voidedAt);
      assert.deepEqual(
        bountyEarnings([bounty], [], await list<Payment>("payments")).received,
        {},
      );
      await assert.rejects(
        () =>
          saveRecord("tracked", { bountyId: bounty.id, status: "Paid" }, ""),
        /actual received/,
      );
      await deleteRecord("tracked", bounty.id);
      const archived = await get<TrackedBounty>("tracked", bounty.id);
      assert.equal(archived.archived, true);
      assert.equal(archived.notes, "Preserve this note");
      assert.equal(filterBounties([bounty], {}, [archived]).length, 0);
      globalThis.fetch = async () => new Response("", { status: 503 });
      const manual = await importBounty(
        {
          url: "https://opire.dev/rewards/test-fixture",
          issueUrl: "https://github.com/fixture/manual/issues/4",
          title: "User supplied Node.js API fix",
          description: "Manual fixture, no checked funding.",
        },
        "Node.js",
      );
      assert.equal(manual.source, "Opire");
      assert.equal(manual.status, "unknown");
      assert.equal(manual.id, "github:fixture/manual:4");
      assert.equal(manual.reward, undefined);
    } finally {
      globalThis.fetch = originalFetch;
      await closeDb();
      await database.dropDatabase();
      await client.close();
      if (oldUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = oldUri;
      if (oldDb === undefined) delete process.env.MONGODB_DB;
      else process.env.MONGODB_DB = oldDb;
    }
  },
);
