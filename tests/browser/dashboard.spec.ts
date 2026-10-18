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
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your next opportunity." }),
  ).toBeVisible();
  await expect(
    page.getByText("Your next opportunity is out there."),
  ).toBeVisible();
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
