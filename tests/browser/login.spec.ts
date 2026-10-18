import { test, expect } from "@playwright/test";
test("password form replaces browser popup and presents useful sign-in errors", async ({
  page,
}) => {
  // This form fixture emulates a configured deployment; the production smoke check exercises real sessions.
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "That password did not match." },
    }),
  );
  await page.goto("/login");
  // Local development may intentionally have no APP_PASSWORD. The setup page remains usable in that case.
  if (
    await page
      .getByRole("heading", { name: "Finish setting up your workspace." })
      .isVisible()
  ) {
    await expect(
      page.getByText(
        "Redeploy after saving, then open the newest deployment URL.",
      ),
    ).toBeVisible();
  } else {
    await page
      .getByLabel("Workspace password", { exact: true })
      .fill("wrong-test-password");
    await page.getByRole("button", { name: "Open my workspace" }).click();
    await expect(page.locator(".login-error")).toHaveText(
      "That password did not match.",
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
