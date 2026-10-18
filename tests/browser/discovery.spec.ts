import { test, expect } from "@playwright/test";
const job = {
  id: "discovery-ui-fixture", title: "Frontend Developer", company: "Browser Test Fixture", location: "Remote",
  description: "React frontend development", url: "https://remotive.com/remote-jobs/test-fixture", salary: "",
  postedAt: new Date().toISOString(), discoveredAt: new Date().toISOString(), source: "Remotive",
  eligibility: "review", eligibilityReason: "Applicant location needs confirmation", score: 0, matchedSkills: [],
};
const excluded = { role: 0, remote: 0, invalid: 0, age: 0, location: 0, duplicate: 0 };
test("first visit searches once and explains jobs hidden for location review", async ({ page }) => {
  let searches = 0;
  await page.route("**/api/status", (r) => r.fulfill({ json: { database: false, ai: false, scheduler: false, protected: false } }));
  await page.route("**/api/discover", (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: { jobs: [], persisted: false, refreshRecommended: true } });
    searches++;
    return r.fulfill({ json: { jobs: [job], persisted: false, failures: [], checkedAt: new Date().toISOString(), sources: [{ source: "Remotive", status: "ok", fetched: 1, accepted: 1, eligible: 0, review: 1, excluded }] } });
  });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Search activity" })).toContainText("1 checked · 0 location-supported · 1 need review");
  await expect(page.getByText("1 remote opening needs applicant-location confirmation", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Frontend Developer", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Review location requirements" }).click();
  await expect(page.getByRole("button", { name: "Frontend Developer", exact: true })).toBeVisible();
  expect(searches).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("source outage is displayed as a failed search instead of no openings", async ({ page }) => {
  await page.route("**/api/status", (r) => r.fulfill({ json: { database: false, ai: false, scheduler: false, protected: false } }));
  await page.route("**/api/discover", (r) => r.fulfill({ json: r.request().method() === "GET" ? { jobs: [], persisted: false, refreshRecommended: true } : {
    jobs: [], persisted: false, checkedAt: new Date().toISOString(), failures: ["Remotive unavailable: HTTP 429"], sources: [{ source: "Remotive", status: "error", fetched: 0, accepted: 0, eligible: 0, review: 0, excluded, error: "HTTP 429" }],
  } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Job sources could not be reached" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Search activity" })).toContainText("Unavailable · HTTP 429");
  await expect(page.getByRole("button", { name: "Find new jobs" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("a recent stored search is reused without another automatic source request", async ({ page }) => {
  let searches = 0;
  await page.route("**/api/status", (r) => r.fulfill({ json: { database: false, ai: false, scheduler: false, protected: false } }));
  await page.route("**/api/discover", (r) => {
    if (r.request().method() === "POST") searches++;
    return r.fulfill({ json: { jobs: [{ ...job, eligibility: "eligible" }], persisted: true, refreshRecommended: false, checkedAt: new Date().toISOString() } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Frontend Developer", exact: true })).toBeVisible();
  expect(searches).toBe(0);
});
