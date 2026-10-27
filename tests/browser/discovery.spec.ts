import { test, expect } from "@playwright/test";
const job = {
  id: "discovery-ui-fixture",
  title: "Frontend Developer",
  company: "Browser Test Fixture",
  location: "Remote",
  description: "React frontend development",
  url: "https://remotive.com/remote-jobs/test-fixture",
  salary: "",
  postedAt: new Date().toISOString(),
  discoveredAt: new Date().toISOString(),
  source: "Remotive",
  eligibility: "review",
  eligibilityReason: "Applicant location needs confirmation",
  score: 0,
  matchedSkills: [],
};
const excluded = {
  role: 0,
  remote: 0,
  invalid: 0,
  age: 0,
  location: 0,
  duplicate: 0,
};
test("first visit searches once and keeps location-review jobs visible", async ({
  page,
}) => {
  let searches = 0;
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai: false, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/discover", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: { jobs: [], persisted: false, refreshRecommended: true },
      });
    searches++;
    return r.fulfill({
      json: {
        jobs: [job],
        persisted: false,
        failures: [],
        checkedAt: new Date().toISOString(),
        sources: [
          {
            source: "Remotive",
            status: "ok",
            fetched: 1,
            accepted: 1,
            eligible: 0,
            review: 1,
            excluded,
          },
        ],
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Search activity" }),
  ).toContainText("1 checked · 0 location-supported · 1 need review");
  await expect(page.getByRole("button", { name: "Frontend Developer", exact: true })).toBeVisible();
  await expect(page.getByLabel('Include location review')).toBeChecked();
  await page.getByLabel('Include location review').uncheck();
  await expect(page.getByRole("button", { name: "Frontend Developer", exact: true })).not.toBeVisible();
  await page.getByRole('button',{name:'Review location requirements'}).click();
  await expect(page.getByRole("button", { name: "Frontend Developer", exact: true })).toBeVisible();
  expect(searches).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("source outage is displayed as a failed search instead of no openings", async ({
  page,
}) => {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai: false, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/discover", (r) =>
    r.fulfill({
      json:
        r.request().method() === "GET"
          ? { jobs: [], persisted: false, refreshRecommended: true }
          : {
              jobs: [],
              persisted: false,
              checkedAt: new Date().toISOString(),
              failures: ["Remotive unavailable: HTTP 429"],
              sources: [
                {
                  source: "Remotive",
                  status: "error",
                  fetched: 0,
                  accepted: 0,
                  eligible: 0,
                  review: 0,
                  excluded,
                  error: "HTTP 429",
                },
              ],
            },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Job sources could not be reached" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Search activity" }),
  ).toContainText("Unavailable · HTTP 429");
  await expect(
    page.getByRole("button", { name: "Find new jobs" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("a recent stored search is reused without another automatic source request", async ({
  page,
}) => {
  let searches = 0;
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai: false, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/discover", (r) => {
    if (r.request().method() === "POST") searches++;
    return r.fulfill({
      json: {
        jobs: [{ ...job, eligibility: "eligible" }],
        persisted: true,
        refreshRecommended: false,
        checkedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Frontend Developer", exact: true }),
  ).toBeVisible();
  expect(searches).toBe(0);
});

test("finder defaults to three days and offers wider posting views", async ({
  page,
}) => {
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { database: false, ai: false } }),
  );
  await page.route("**/api/discover", (r) =>
    r.fulfill({
      json: {
        jobs: [2, 71, 73, 120].map((hours) => ({
          ...job,
          id: `age-${hours}`,
          company: `Age ${hours} Company`,
          postedAt: new Date(Date.now() - hours * 3600000).toISOString(),
          eligibility: "eligible",
        })),
        persisted: true,
        refreshRecommended: false,
        checkedAt: new Date().toISOString(),
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Posting age")).toHaveValue("3");
  await expect(page.getByRole("option", { name: "Last 30 days" })).toHaveCount(
    1,
  );
  await expect(page.locator(".company-name").filter({ hasText: "Age 71 Company" })).toBeVisible();
  await expect(page.locator(".company-name").filter({ hasText: "Age 73 Company" })).toHaveCount(
    0,
  );
  await page.getByLabel("Posting age").selectOption("1");
  await expect(page.locator(".company-name").filter({ hasText: "Age 2 Company" })).toBeVisible();
  await expect(page.locator(".company-name").filter({ hasText: "Age 71 Company" })).toHaveCount(
    0,
  );
});

test("an open dashboard ages out jobs and refreshes a search after an hour", async ({
  page,
}) => {
  await page.clock.install({ time: new Date() });
  let searches = 0;
  const initial = {
    ...job,
    id: "almost-old",
    company: "Almost Old Company",
    eligibility: "eligible",
    postedAt: new Date(Date.now() - 71.9 * 3600000).toISOString(),
  };
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { database: false, ai: false } }),
  );
  await page.route("**/api/discover", (r) => {
    const post = r.request().method() === "POST";
    if (post) searches++;
    return r.fulfill({
      json: {
        jobs: post
          ? [
              {
                ...job,
                id: "new-source-fixture",
                company: "New Source Company",
                eligibility: "eligible",
              },
            ]
          : [initial],
        persisted: true,
        refreshRecommended: false,
        checkedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto("/");
  await expect(
    page.locator(".company-name").filter({ hasText: "Almost Old Company" }),
  ).toBeVisible();
  await page.clock.fastForward(61 * 60000);
  await expect(
    page.locator(".company-name").filter({ hasText: "New Source Company" }),
  ).toBeVisible();
  await expect(
    page.locator(".company-name").filter({ hasText: "Almost Old Company" }),
  ).toHaveCount(0);
  expect(searches).toBe(1);
});
