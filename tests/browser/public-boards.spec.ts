import { test, expect } from "@playwright/test";
test("active undated public board jobs show honest dates and paginate without changing the fresh view", async ({
  page,
}) => {
  const now = new Date().toISOString();
  const jobs = Array.from({ length: 26 }, (_, i) => ({
    id: `public-board-fixture-${i}`,
    title: `Backend Node.js Developer ${i}`,
    company: `Public Board Test Fixture ${i}`,
    location: "Worldwide",
    salary: "",
    description: "TypeScript APIs and React interfaces.",
    url: `https://jobs.lever.co/test-fixture/${i}`,
    source: "Lever",
    postedAt: "",
    discoveredAt: now,
    lastVerifiedAt: now,
    eligibility: "eligible",
    eligibilityReason: "Worldwide test fixture",
    score: 0,
    matchedSkills: [],
  }));
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai: false, protected: false, scheduler: false },
    }),
  );
  await page.route("**/api/discover", (r) =>
    r.fulfill({
      json: {
        jobs,
        persisted: false,
        checkedAt: now,
        sources: [
          {
            source: "Lever",
            status: "partial",
            fetched: 26,
            accepted: 26,
            eligible: 26,
            review: 0,
            excluded: {
              role: 0,
              remote: 0,
              age: 0,
              location: 0,
              invalid: 0,
              duplicate: 0,
            },
            boards: {
              total: 40,
              checked: 20,
              verified: 18,
              failed: 2,
              unvisited: 20,
            },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByText("Job sources and connection diagnostics",{exact:true}).click();
  await expect(
    page.getByRole("button", {
      name: "Backend Node.js Developer 0",
      exact: true,
    }),
  ).not.toBeVisible();
  await page.getByLabel("Posting age").selectOption("active");
  await expect(
    page.getByRole("button", {
      name: "Backend Node.js Developer 0",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Posting date unavailable", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Page 1 of 2 · 26 opportunities")).toBeVisible();
  await page.getByRole("button", { name: "Next jobs" }).click();
  await expect(
    page.getByRole("button", {
      name: "Backend Node.js Developer 24",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Backend Node.js Developer 0",
      exact: true,
    }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Backend Node.js Developer 24", exact: true })
    .click();
  await expect(
    page.getByText("Lever · Posting date unavailable"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close job details" }).click();
  const activity = page.getByRole("region", { name: "Search activity" });
  await activity.locator("summary").click();
  await expect(activity).toContainText("18 public company boards verified");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
