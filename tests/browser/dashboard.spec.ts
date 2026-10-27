import { test, expect } from "@playwright/test";
test("dashboard navigation, empty states, and setup guidance", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: { database: false, ai: false, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/discover", (route) =>
    route.fulfill({
      json: {
        jobs: [],
        persisted: false,
        failures: ["Source unavailable"],
        checkedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route("**/api/sources", (route) =>
    route.fulfill({
      json: {
        sources: [
          {
            id: "remotive",
            name: "Remotive",
            platform: "Publisher website",
            url: "https://remotive.com",
            provenanceUrl: "https://remotive.com",
            status: "Check failed",
            note: "Network unavailable",
          },
        ],
        persisted: false,
      },
    }),
  );
  await page.goto("/");
  await page.getByText("Job sources and connection diagnostics",{exact:true}).click();
  await expect(
    page.getByRole("heading", { name: "Find your next opportunity." }),
  ).toBeVisible();
  await expect(
    page.getByText("No matching jobs in this search"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse job sources" }).click();
  await expect(page.getByRole("article").getByText("Remotive", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Find publisher social links" })
    .click();
  await expect(
    page.getByText(
      "Source checks could not confirm any candidates. Review network access or retry later.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide sources" }).click();
  await page.getByRole("button", { name: "Social opportunities awaiting verification" }).click();
  await expect(page.getByLabel("Social post or channel link")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save for verification" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close social inbox" }).click();
  await page.getByRole("button", { name: "Find new jobs" }).click();
  await expect(page.getByRole("status")).toContainText("Source unavailable");
  await page.getByRole("button", { name: "My Profile", exact: true }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await expect(
    page.getByText("A little organization. A lot of momentum."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
