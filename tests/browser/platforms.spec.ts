import { test, expect } from "@playwright/test";
import { jobPlatforms } from "../../src/lib/job-platforms";
test("expanded platform directory clearly separates enabled sources, setup and browser-only sites", async ({
  page,
}) => {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai: false, protected: false, scheduler: false },
    }),
  );
  await page.route("**/api/discover", (r) =>
    r.fulfill({ json: { jobs: [], persisted: false, sources: [] } }),
  );
  await page.route("**/api/platforms", (r) =>
    r.fulfill({
      json: {
        platforms: jobPlatforms.map((p) => ({
          ...p,
          enabled: p.access === "public",
        })),
      },
    }),
  );
  await page.goto("/");
  await page.getByText("Job sources and connection diagnostics",{exact:true}).click();
  const directory = page.getByRole("region", { name: "Job platforms" });
  await expect(directory).toContainText("33 platforms");
  await expect(directory).toContainText("22 search connectors");
  await expect(directory).toContainText("11 enabled");
  await directory.locator("summary").click();
  await directory.getByLabel("Find a platform").fill("LinkedIn");
  await expect(
    directory.getByRole("heading", { name: "LinkedIn", exact: true }),
  ).toBeVisible();
  await expect(
    directory.locator("article").getByText("Browse directly", { exact: true }),
  ).toBeVisible();
  await expect(
    directory.getByRole("link", { name: "Open LinkedIn" }),
  ).toHaveAttribute("href", "https://www.linkedin.com/jobs/");
  await directory.getByLabel("Find a platform").fill("");
  await directory.getByRole("combobox", { name: "Access", exact: true }).selectOption("setup");
  await expect(
    directory.getByRole("heading", { name: "Findwork", exact: true }),
  ).toBeVisible();
  await expect(directory).toContainText("FINDWORK_API_KEY");
  await expect(
    directory.getByRole("heading", { name: "LinkedIn", exact: true }),
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("search activity does not report missing API keys as checked jobs or feed failures", async ({
  page,
}) => {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai: false, protected: false, scheduler: false },
    }),
  );
  await page.route("**/api/discover", (r) =>
    r.fulfill({
      json: {
        jobs: [],
        persisted: false,
        sources: [
          {
            source: "Findwork",
            status: "not_configured",
            fetched: 0,
            accepted: 0,
            eligible: 0,
            review: 0,
            excluded: {
              role: 0,
              remote: 0,
              invalid: 0,
              age: 0,
              location: 0,
              duplicate: 0,
            },
            error: "Needs FINDWORK_API_KEY in server settings.",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByText("Job sources and connection diagnostics",{exact:true}).click();
  const activity = page.getByRole("region", { name: "Search activity" });
  await expect(activity).toContainText("Setup required");
  await expect(activity).not.toContainText("0 checked");
  await expect(activity).not.toContainText("Unavailable");
});
