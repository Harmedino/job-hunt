import { test, expect } from "@playwright/test";
const now = new Date().toISOString();
const jobs = Array.from({ length: 3 }, (_, i) => ({
  id: `workflow-${i}`,
  title:
    i === 2
      ? "Senior PHP Developer"
      : i === 1
        ? "Junior React Developer"
        : "Backend Node.js Developer",
  company: `Workflow Fixture ${i}`,
  location: i === 1 ? "Remote" : "Nigeria",
  description:
    "Required: React and Node.js. Preferred: Docker. TypeScript APIs.",
  url: `https://example.org/jobs/${i}`,
  salary: "",
  source: "Public board test fixture",
  postedAt: new Date(Date.now() - (i === 0 ? 10 : 1) * 86400000).toISOString(),
  discoveredAt: now,
  eligibility: i === 1 ? "review" : "eligible",
  eligibilityClass: i === 1 ? "review" : "nigeria",
  eligibilityReason:
    i === 1 ? "Remote alone does not confirm Nigeria" : "Source lists Nigeria",
  matchedSkills: ["React"],
  score: i === 0 ? 80 : 50,
  jobType: i === 2 ? "Freelance" : "Full-time",
  experienceLevel: i === 2 ? "Senior" : "Junior",
}));
async function mock(page: import("@playwright/test").Page) {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: true, ai: false, protected: false, scheduler: false },
    }),
  );
  await page.route("**/api/profile", (r) =>
    r.fulfill({ json: { name: "Workflow Candidate", skills: "React" } }),
  );
  await page.route("**/api/applications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/notifications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/discover", (r) =>
    r.fulfill({ json: { jobs, checkedAt: now, persisted: true, sources: [] } }),
  );
}
test("unknown locations remain visible, and date/type/experience/view filters work", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Junior React Developer", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".job-card").getByText("Eligibility needs checking", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Posting age").selectOption("14");
  await expect(
    page.getByRole("button", {
      name: "Backend Node.js Developer",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Opportunity view").selectOption("strong");
  await expect(
    page.getByRole("button", {
      name: "Backend Node.js Developer",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Junior React Developer", exact: true }),
  ).not.toBeVisible();
  await page.getByLabel("Opportunity view").selectOption("all");
  await page.getByLabel("Job type", { exact: true }).selectOption("Freelance");
  await page.getByLabel("Experience level").selectOption("Senior");
  await expect(
    page.getByRole("button", { name: "Senior PHP Developer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Backend Node.js Developer",
      exact: true,
    }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("manual WhatsApp lead import and review preserve unverified status and do not require a social URL", async ({
  page,
}) => {
  await mock(page);
  let stored: unknown[] = [];
  let imported: Record<string, unknown> = {};
  await page.route("**/api/job-searches", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/leads", (r) => {
    if (r.request().method() === "POST") {
      imported = r.request().postDataJSON();
      stored = [
        {
          ...imported,
          id: "a".repeat(24),
          platform: "WhatsApp",
          createdAt: now,
          status: "Needs verification",
          details: {
            title: "React Developer",
            company: "Lead Fixture",
            location: "Remote",
            postedAt: "",
            applicationUrl: "https://example.org/jobs/lead",
            skills: ["React"],
            warnings: ["Imported content is an unverified lead."],
          },
        },
      ];
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: stored });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add social post", exact: true })
    .click();
  const inbox = page.getByRole("region", { name: "Social opportunity inbox" });
  await inbox.getByLabel("Import source").selectOption("WhatsApp");
  await inbox
    .getByLabel("Job post text", { exact: true })
    .fill(
      "Position: React Developer\nCompany: Lead Fixture\nLocation: Remote\nApply: https://example.org/jobs/lead",
    );
  await inbox
    .getByRole("button", { name: "Save for verification", exact: true })
    .click();
  await expect(inbox).toContainText("unverified lead");
  expect(imported.url).toBe("");
  await inbox.getByRole("button", { name: "Review and verify lead" }).click();
  const review = page.getByRole("form", {
    name: "Verify imported opportunity",
  });
  await expect(
    review.getByRole("button", {
      name: "Add reviewed opportunity to Job Finder",
    }),
  ).toBeDisabled();
  await review
    .getByLabel("I checked the employer identity", { exact: false })
    .check();
  await expect(
    review.getByRole("button", {
      name: "Add reviewed opportunity to Job Finder",
    }),
  ).toBeEnabled();
});
test("web share target hands pasted text to the private verification inbox", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/api/leads", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/job-searches", (r) => r.fulfill({ json: [] }));
  await page.goto(
    "/share?text=" +
      encodeURIComponent(
        "Position: React Developer\nCompany: Share Fixture\nRemote role requiring TypeScript.",
      ),
  );
  await expect(page.getByLabel("Shared job text")).toContainText(
    "Share Fixture",
  );
  await page
    .getByRole("button", { name: "Continue to verification inbox" })
    .click();
  await expect(page.getByLabel("Job post text", { exact: true })).toHaveValue(
    /Share Fixture/,
  );
  await expect(page.getByLabel("Import source")).toHaveValue("WhatsApp");
});
