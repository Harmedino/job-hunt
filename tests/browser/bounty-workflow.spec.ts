import { test, expect } from "@playwright/test";
import {
  brunoProfile,
  type Bounty,
  type WorkspaceSnapshot,
  type TrackedBounty,
  type Payment,
} from "../../src/lib/modules/types";
test("paid candidates group sources, move out of new tasks on save, and keep merged work separate from actual earnings", async ({
  page,
}) => {
  const task: Bounty = {
    id: "github:fixture/project:1",
    title: "Fix React form validation",
    description:
      "A real-format browser fixture, never a live task. Reward: USD 100. Expected result: reject empty fields.",
    source: "GitHub",
    manual: false,
    url: "https://github.com/fixture/project/issues/1",
    issueUrl: "https://github.com/fixture/project/issues/1",
    repository: "fixture/project",
    organization: "fixture",
    language: "TypeScript",
    skills: ["React", "TypeScript"],
    status: "open",
    sponsor: "Unknown",
    assignees: [],
    difficulty: "easy",
    bountySignal: true,
    rewardAnnouncement: {
      evidenceUrl: "https://github.com/fixture/project/issues/1",
      announcedBy: "Test fixture maintainer",
      reward: { amount: "100", currency: "USD" },
    },
    analysis: {
      score: 60,
      confidence: "Test metadata",
      matchedSkills: ["React", "TypeScript"],
      criteria: [],
      paymentRisk: "Funding unverified",
      eligibility: "Unknown for Nigeria",
      generatedAt: new Date().toISOString(),
    },
  };
  const state: WorkspaceSnapshot = {
    bounties: [
      task,
      {
        ...task,
        id: "opire-alias",
        source: "Opire",
        url: "https://opire.dev/rewards/test-fixture",
        manual: true,
      },
    ],
    tracked: [],
    payments: [],
    profiles: [brunoProfile],
    topics: [],
    videos: [],
    channels: [],
    ideas: [],
    prompts: [],
    metadata: [],
    entries: [],
    journal: [],
    sources: [],
    integrations: [],
    settings: {
      id: "preferences",
      bountyQuery: "",
      bountyRefresh: false,
      youtubeRefresh: false,
      refreshHours: 24,
      highMatch: 65,
    },
    storageAvailable: true,
    configured: { github: false, youtube: false, oauth: false, ai: false },
  };
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { database: true, ai: false } }),
  );
  await page.route("**/api/profile", (r) =>
    r.fulfill({ json: { skills: "React, TypeScript" } }),
  );
  await page.route("**/api/applications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/discover", (r) => r.fulfill({ json: { jobs: [] } }));
  await page.route("**/api/notifications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/job-searches", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/workspace/**", (r) => {
    const path = new URL(r.request().url()).pathname.split(
      "/api/workspace/",
    )[1];
    if (path === "state") return r.fulfill({ json: state });
    if (r.request().method() === "DELETE" && path === "records/payments") {
      state.payments[0].voidedAt = new Date().toISOString();
      return r.fulfill({ json: { ok: true } });
    }
    const body = r.request().postDataJSON();
    if (path === "records/tracked") {
      const old = state.tracked.find((t) => t.bountyId === body.bountyId);
      const updated = {
        ...old,
        ...body,
        ...(body.approvedAmount && body.approvedCurrency
          ? {
              approvedReward: {
                amount: body.approvedAmount,
                currency: body.approvedCurrency,
              },
            }
          : {}),
        id: body.bountyId,
        updatedAt: new Date().toISOString(),
      } as TrackedBounty;
      state.tracked = [updated];
      return r.fulfill({ json: updated });
    }
    if (path === "records/payments") {
      const payment = { ...body, id: "receipt-1" } as Payment;
      state.payments = [payment];
      return r.fulfill({ json: payment });
    }
    if (path === "records/settings") {
      state.settings = body;
      return r.fulfill({ json: body });
    }
    if (path === "records/payments/receipt-1") {
      state.payments[0].voidedAt = new Date().toISOString();
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Coding Bounties", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: task.title, exact: true }),
  ).toHaveCount(1);
  await expect(page.locator("article")).toContainText(
    "advertised; unconfirmed funding",
  );
  await expect(
    page.getByRole("combobox", { name: "Funding verification", exact: true }),
  ).toHaveValue("All paid or potentially paid");
  await page.getByRole("button", { name: "Save bounty", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: task.title, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Saved Opportunities", exact: true })
    .click();
  await page.getByText(task.title + " · Saved", { exact: true }).click();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Owner contribution note");
  await page
    .getByLabel("Branch or fork URL")
    .fill("https://github.com/contributor/project/tree/form-fix");
  await page
    .getByLabel("Submission URL", { exact: true })
    .fill("https://github.com/fixture/project/pull/4");
  await page
    .getByRole("combobox", { name: "Work status", exact: true })
    .selectOption("Working");
  await page.getByRole("button", { name: "Update work", exact: true }).click();
  await page.getByRole("button", { name: "In Progress", exact: true }).click();
  await expect(
    page.getByText(task.title + " · Working", { exact: true }),
  ).toBeVisible();
  await page.getByText(task.title + " · Working", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Work status", exact: true })
    .selectOption("Merged");
  await page
    .getByRole("combobox", { name: "Payment claim status", exact: true })
    .selectOption("Approved unpaid");
  await page
    .getByLabel("Approved reward amount (not received earnings)")
    .fill("100");
  await page.getByLabel("Approved reward currency").fill("USD");
  await page
    .getByLabel("Approval evidence URL")
    .fill("https://github.com/fixture/project/pull/4#issuecomment-1");
  await page.getByRole("button", { name: "Update work", exact: true }).click();
  await page
    .getByRole("button", { name: "Awaiting Payment", exact: true })
    .click();
  await expect(
    page.getByText(task.title + " · Merged", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Earnings History", exact: true })
    .click();
  const actual = page
    .getByRole("heading", { name: "Actual received payments", exact: true })
    .locator("..");
  await expect(actual).toContainText("No received payments recorded.");
  await expect(
    page
      .getByRole("heading", {
        name: "Approved but unpaid (owner recorded)",
        exact: true,
      })
      .locator(".."),
  ).toContainText("100.00");
  await page
    .getByRole("combobox", { name: "Tracked bounty", exact: true })
    .selectOption(task.id);
  await page.getByLabel("Amount received", { exact: true }).fill("25");
  await page.getByLabel("Date received", { exact: true }).fill("2026-10-20");
  await page
    .getByLabel("Receipt or transaction evidence URL")
    .fill("https://example.org/receipt-1");
  await page
    .getByRole("checkbox", {
      name: "I confirm this payment was actually received.",
    })
    .check();
  await page
    .getByRole("button", { name: "Record receipt", exact: true })
    .click();
  await expect(actual).toContainText("25.00");
  await expect(actual).not.toContainText("100.00");
  await page
    .getByRole("button", {
      name: "Void receipt (keep audit record)",
      exact: true,
    })
    .click();
  await expect(actual).toContainText("No received payments recorded.");
  await expect(
    page.getByText("Voided (excluded from earnings)", { exact: false }),
  ).toBeVisible();
  expect(state.tracked[0].notes).toBe("Owner contribution note");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
