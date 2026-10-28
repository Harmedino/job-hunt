import { test, expect, type Page } from "@playwright/test";
import {
  brunoProfile,
  type WorkspaceSnapshot,
} from "../../src/lib/modules/types";
async function fixtures(
  page: Page,
  bounties: WorkspaceSnapshot["bounties"] = [],
  ai = false,
) {
  const state: WorkspaceSnapshot = {
    bounties,
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
    configured: { github: false, youtube: false, oauth: false, ai },
  };
  // The Next.js development toolbar overlaps the first mobile nav item.
  // Hide developer tooling only in this browser fixture; production has no portal.
  await page.addInitScript(() => {
    const attach = () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(style);
    };
    if (document.head) attach();
    else document.addEventListener("DOMContentLoaded", attach, { once: true });
  });
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      json: {
        name: "",
        email: "",
        location: "Nigeria",
        phone: "",
        github: "",
        linkedin: "",
        portfolio: "",
        skills: "React, TypeScript",
        experience: "",
        education: "",
        projects: "",
        roles: "",
        preferences: "",
        cvText: "",
      },
    }),
  );
  await page.route("**/api/applications", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/notifications", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/resumes", (route) =>
    route.fulfill({ json: { drafts: [] } }),
  );
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: { database: true, ai: false, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/discover", (route) =>
    route.fulfill({ json: { jobs: [], persisted: true, sources: [] } }),
  );
  await page.route("**/api/workspace/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/workspace/",
      "",
    );
    if (path === "state") return route.fulfill({ json: state });
    if (path === "bounties/analyze") {
      const bounty = state.bounties.find(
        (b) => b.id === route.request().postDataJSON().id,
      )!;
      bounty.analysis = {
        score: 20,
        confidence: "Metadata only",
        matchedSkills: [],
        criteria: [],
        paymentRisk: "Check funding evidence",
        eligibility: "Unverified",
        generatedAt: new Date().toISOString(),
        ...(route.request().postDataJSON().ai
          ? {
              aiWarning:
                "Google Gemini could not be reached. Basic task analysis is available below. The AI task plan was not generated; retry AI analysis later.",
            }
          : {}),
      };
      return route.fulfill({ json: bounty });
    }
    if (path === "bounties/import") {
      state.bounties.push({
        id: "manual:test",
        title: "Test-only bounty fixture",
        description: "Explicit development test fixture; no verified funding",
        source: "Algora",
        manual: true,
        url: "https://algora.io/example/bounties",
        repository: "Unknown",
        organization: "Unknown",
        language: "Unknown",
        skills: [],
        status: "unknown",
        sponsor: "Unverified",
        assignees: [],
        difficulty: "unknown",
        bountySignal: true,
      });
      return route.fulfill({ json: state.bounties[0] });
    }
    if (path === "records/ideas") {
      const idea = route.request().postDataJSON();
      state.ideas = [...state.ideas.filter((i) => i.id !== idea.id), idea];
      return route.fulfill({ json: idea });
    }
    if (path === "records/entries") {
      const entry = {
        ...route.request().postDataJSON(),
        id: "entry-test",
        updatedAt: new Date().toISOString(),
      };
      state.entries = [entry];
      return route.fulfill({ json: entry });
    }
    if (path === "bounties/discover")
      return route.fulfill({
        status: 429,
        json: {
          error: "GitHub rate limit reached. Retry after the provider reset.",
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: "Provider not configured in this test fixture." },
    });
  });
}
test("separate module tabs preserve job finder and profile navigation and show honest empty states", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Coding Bounties", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find paid coding opportunities" }),
  ).toBeVisible();
  await expect(
    page.getByText("No opportunities have been saved yet.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh opportunities", exact: true })
    .click();
  await expect(
    page.locator(".module-workspace").getByRole("alert"),
  ).toContainText("GitHub rate limit");
  await page
    .getByRole("button", { name: "Edit matching skills in My Profile" })
    .click();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await page
    .getByRole("button", { name: "YouTube Research", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Discover videos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Set YOUTUBE_API_KEY", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Load analytics" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Configure YouTube OAuth client ID", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Job Finder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Find your next opportunity." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("funded and advertised tasks stay distinct and strict funded mode remains available", async ({
  page,
}) => {
  const bounty: WorkspaceSnapshot["bounties"][number] = {
    id: "proof-test",
    title: "Task with checked funding evidence",
    description: "Test fixture",
    source: "GitHub",
    manual: false,
    url: "https://github.com/example/project/issues/1",
    repository: "example/project",
    organization: "example",
    language: "TypeScript",
    skills: [],
    status: "open",
    sponsor: "example",
    assignees: [],
    difficulty: "easy",
    reward: {
      amount: "100",
      currency: "USD",
      verification: "user-verified",
      evidenceUrl:
        "https://github.com/example/project/issues/1#issuecomment-123",
      fundingType: "escrow",
      authoritativeConfirmation: {
        authority: "Test escrow provider",
        taskUrl: "https://github.com/example/project/issues/1",
        validUntil: new Date(Date.now() + 86400000).toISOString(),
      },
      conditions: "Accepted submission",
      eligibility: "Check payout provider",
      verifiedAt: new Date().toISOString(),
    },
  };
  await fixtures(
    page,
    [
      bounty,
      {
        ...bounty,
        id: "unverified-test",
        title: "Unverified task",
        reward: undefined,
        bountySignal: true,
        url: "https://github.com/example/project/issues/2",
      },
    ],
    true,
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Coding Bounties", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "View verification evidence",
      exact: false,
    }),
  ).toHaveAttribute("href", bounty.reward!.evidenceUrl);
  await expect(
    page.getByRole("heading", { name: "Unverified task", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Funding verification", exact: true })
    .selectOption("Verified Funded");
  await expect(
    page.getByRole("heading", { name: "Unverified task", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View task", exact: true }).click();
  await page.getByRole("button", { name: "Analyze Task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bounty details" });
  await dialog
    .getByRole("button", {
      name: "Generate AI implementation plan",
      exact: true,
    })
    .click();
  await expect(dialog).toContainText("Basic task analysis is available below");
  await expect(dialog).toContainText("Explainable score: 20/100");
  await dialog.getByRole("button", { name: /close/i }).click();
  await page
    .getByRole("combobox", { name: "Funding verification", exact: true })
    .selectOption("All paid or potentially paid");
  await expect(
    page.getByRole("heading", { name: "Unverified task", exact: true }),
  ).toBeVisible();
  await page.getByText("More filters and sorting", { exact: true }).click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Unverified task", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Funding verification", exact: true }),
  ).toHaveValue("All paid or potentially paid");
  await expect(
    page.getByRole("heading", { name: "Unverified task", exact: true }),
  ).toBeVisible();
});
test("manual bounty import never labels an unverified task as funded", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Coding Bounties", exact: true })
    .click();
  await page
    .getByText("Import an Algora, Opire, IssueHunt or GitHub task URL", {
      exact: true,
    })
    .click();
  await page
    .getByLabel("Original task URL", { exact: true })
    .fill("https://algora.io/example/bounties");
  await page
    .getByLabel("Task title (required without GitHub issue)")
    .fill("Test-only bounty fixture");
  await page.getByRole("button", { name: "Import task", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Test-only bounty fixture",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Funding verification", exact: true })
    .selectOption("All paid or potentially paid");
  await expect(
    page.getByRole("heading", {
      name: "Test-only bounty fixture",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .locator("article")
      .getByText("Needs Funding Verification", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bounty details" });
  await expect(dialog).toContainText("Manually submitted");
  await expect(dialog).toContainText("Unverified for Nigeria");
  await expect(
    dialog.getByRole("link", { name: "Original bounty" }),
  ).toHaveAttribute("href", "https://algora.io/example/bounties");
});
test("write and approve an original idea, add a plan, and use calendar without publishing", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "YouTube Research", exact: true })
    .click();
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  await page.getByRole("button", { name: "Write an idea" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit content idea" });
  for (const [label, value] of [
    ["Concept title", "Original fictional football idea"],
    ["Description", "An original test production"],
    ["Main action or story", "Bruno attempts a goal"],
    ["Opening hook", "An unexpected attempt"],
    ["Intended audience", "Football fans"],
    ["Possible duration", "15 seconds"],
    ["Original angle", "An independent fictional match"],
    ["Production requirements", "Original character reference"],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Add to Content Plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Content production plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This app does not generate or publish videos.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Original fictional football idea",
      exact: false,
    })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit planned content" });
  await editor.getByLabel("Target publication date").fill("2026-10-25");
  await editor.getByLabel("Production status").selectOption("Scheduled");
  await editor.getByRole("button", { name: "Save production plan" }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Calendar month").fill("2026-10");
  await expect(
    page.getByRole("button", {
      name: "Original fictional football idea",
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
