import { test, expect } from "@playwright/test";
import { emptyProfile, type Application, type Job } from "../../src/lib/types";
test("explicit card submission and outside applications preserve dates and remain visible across career filters", async ({
  page,
}) => {
  const now = new Date().toISOString(),
    job = {
      id: "new-readiness-job",
      title: "React Frontend Developer",
      company: "Fictional Interface Labs",
      url: "https://example.org/jobs/react",
      location: "Worldwide",
      salary: "NGN 400000 monthly",
      source: "Test feed",
      description:
        "Develop accessible React and TypeScript components and API integration. Junior or intermediate responsibilities.",
      postedAt: now,
      discoveredAt: now,
      eligibility: "eligible",
      eligibilityReason: "Worldwide",
      score: 85,
      matchedSkills: ["React", "TypeScript"],
    } as Job;
  let apps: Application[] = [],
    last: Record<string, unknown> = {};
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { database: true, ai: false } }),
  );
  await page.route("**/api/profile", (r) =>
    r.fulfill({ json: { ...emptyProfile, skills: "React, TypeScript" } }),
  );
  await page.route("**/api/notifications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/job-searches", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/discover", (r) =>
    r.fulfill({ json: { jobs: [job], persisted: true } }),
  );
  await page.route("**/api/resumes", (r) =>
    r.fulfill({ json: { drafts: [] } }),
  );
  await page.route("**/api/applications", (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: apps });
    last = r.request().postDataJSON();
    let app = apps.find((a) => a.id === last.id || a.job.id === last.jobId);
    if (!app)
      app = {
        id: "app-" + apps.length,
        job: last.manual
          ? {
              ...job,
              id: "outside-job",
              title: String(last.title),
              company: String(last.company),
              url: String(last.url || ""),
              source: "Manual application",
              postedAt: "",
              location: "Not verified",
            }
          : job,
        status: "Saved",
        createdAt: now,
        updatedAt: now,
        followUp: "",
        origin: last.manual ? "manual" : "discovered",
      };
    app = {
      ...app,
      ...last,
      status:
        last.manual || last.status === "Submitted" || last.markApplied
          ? "Submitted"
          : app.status,
      applicationDate: String(last.applicationDate || ""),
      submittedAt: last.submissionConfirmed ? now : undefined,
    } as Application;
    apps = [...apps.filter((a) => a.id !== app!.id), app];
    return r.fulfill({ json: app });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Find new jobs", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: job.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Application Page", exact: true }),
  ).toHaveAttribute("href", job.url);
  expect(apps).toHaveLength(0);
  await page
    .getByRole("button", { name: "Mark as Applied", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "Mark as Applied",
    exact: true,
  });
  await form.getByLabel("Actual date applied").fill("2026-10-01");
  await form.getByLabel("I actually submitted this application").check();
  await form
    .getByRole("button", { name: "Confirm submitted application", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  expect(last.submissionConfirmed).toBe(true);
  expect(apps[0].applicationDate).toBe("2026-10-01");
  await expect(
    page.getByRole("button", { name: job.title, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cybersecurity Internships", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Applied Jobs", exact: true }).click();
  await expect(
    page.getByRole("button", { name: job.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Application Manually", exact: true })
    .click();
  const manual = page.getByRole("dialog", {
    name: "Add application manually",
    exact: true,
  });
  await manual
    .getByLabel("Company name", { exact: true })
    .fill("Outside Fictional Employer");
  await manual
    .getByLabel("Job title", { exact: true })
    .fill("Angular Developer");
  await manual.getByLabel("Actual date applied").fill("2026-02-10");
  await manual.getByLabel("I actually submitted this application").check();
  await manual
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(manual).toHaveCount(0);
  expect(last.url).toBe("");
  expect(apps).toHaveLength(2);
  const detail = page.getByRole("dialog", {
    name: "Application details",
    exact: true,
  });
  await expect(detail).toContainText("User-reported application");
  await expect(detail).toContainText("2026-02-10");
  await detail
    .getByRole("button", { name: "Close application details", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Application year", exact: true })
    .selectOption("2027");
  await expect(
    page.getByRole("heading", { name: "Angular Developer", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Application year", exact: true })
    .selectOption("2026");
  await expect(
    page.getByRole("heading", { name: "Angular Developer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Export CSV", exact: true }),
  ).toHaveAttribute("href", "/api/applications/export?format=csv");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
