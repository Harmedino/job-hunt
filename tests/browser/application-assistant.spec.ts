import { test, expect, type Page } from "@playwright/test";
import { emptyProfile, type Application } from "../../src/lib/types";
import { greenhouseTarget } from "../../src/lib/assisted-apply";
const url = "https://job-boards.greenhouse.io/launchpadfixture/jobs/12345";
const job = {
  id: "assistant-fixture-job",
  company: "Fictional Employer",
  title: "React Developer",
  url,
  description: "Fictional fixture only. React and TypeScript development.",
  location: "Worldwide",
  salary: "",
  postedAt: new Date().toISOString(),
  discoveredAt: new Date().toISOString(),
  source: "Greenhouse",
  eligibility: "eligible" as const,
  eligibilityReason: "Worldwide fixture eligibility",
  score: 80,
  matchedSkills: ["React"],
};
const app: Application = {
  id: "assistant-fixture-app",
  job,
  status: "Saved",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  followUp: "Preserved notes",
};
const profile = {
  ...emptyProfile,
  name: "Test Candidate",
  email: "test@example.org",
  skills: "React, TypeScript",
};
const draft = {
  id: "assistant-fixture-cv",
  familyId: "fixture-family",
  createdAt: new Date().toISOString(),
  target: {
    title: job.title,
    company: job.company,
    description: job.description,
    url,
    applicationId: app.id,
  },
  content: { ...profile, summary: "Actual React project experience" },
  profileSnapshot: profile,
  evidence: [],
  method: "Basic",
  warnings: [],
  requirementsToReview: [],
  manualEdits: false,
  layoutVersion: 2,
};
const policy = {
  preparationEnabled: false,
  minScore: 60,
  maxPerDay: 5,
  maxAgeDays: 14,
  eligibleOnly: true,
  allowedBoards: ["Greenhouse", "Lever", "Ashby"],
  excludedCompanies: [],
  preferredRoles: [],
  startHour: 0,
  endHour: 24,
  timezone: "Africa/Lagos",
  aiMaxCallsPerDay: 0,
  unattendedSubmission: false,
};
const attempt = {
  id: "fixture-attempt",
  applicationId: app.id,
  state: "awaiting-user",
  revision: 0,
  company: job.company,
  title: job.title,
  target: greenhouseTarget(url),
  packageHash: "fixture-package-hash",
  draftId: draft.id,
  approvedAt: new Date().toISOString(),
  facts: { firstName: "Test", lastName: "Candidate", email: profile.email },
  answers: [],
  files: [
    { kind: "cv", name: "fixture.pdf", size: 100, sha256: "fixture-file-hash" },
  ],
  history: [],
  leaseActive: false,
};
async function base(page: Page) {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: true, ai: false, aiLabel: "Google Gemini" },
    }),
  );
  await page.route("**/api/profile", (r) => r.fulfill({ json: profile }));
  await page.route("**/api/applications", (r) => r.fulfill({ json: [app] }));
  for (const name of ["notifications", "keyword-presets", "manual-jobs"])
    await page.route(`**/api/${name}`, (r) => r.fulfill({ json: [] }));
  await page.route("**/api/discover", (r) =>
    r.fulfill({
      json: { jobs: [], persisted: true, refreshRecommended: false },
    }),
  );
  await page.route("**/api/resumes/working**", (r) =>
    r.fulfill({ json: { copy: null, ok: true } }),
  );
  await page.route("**/api/resumes", (r) => r.fulfill({ json: [draft] }));
  await page.route(`**/api/resumes/${draft.id}`, (r) =>
    r.fulfill({ json: draft }),
  );
  await page.route("**/api/assisted-apply/answers", (r) =>
    r.fulfill({ json: [] }),
  );
}
test("integrated assistant uses existing application and saved CV, requires fact/package approval and prepares a scoped handoff", async ({
  page,
}) => {
  await base(page);
  let approved = false,
    approval: Record<string, unknown> | undefined;
  await page.route("**/api/assisted-apply/dashboard", (r) =>
    r.fulfill({
      json: {
        recommended: [],
        attempts: approved ? [attempt] : [],
        policy,
        counts: { discovered: 0, shortlisted: 1, browserConfirmed: 0 },
        actions: [],
      },
    }),
  );
  await page.route("**/api/assisted-apply", (r) => {
    approval = r.request().postDataJSON();
    approved = true;
    return r.fulfill({ json: attempt, status: 201 });
  });
  await page.route(`**/api/assisted-apply/${attempt.id}/handoff`, (r) =>
    r.fulfill({
      json: {
        code: "launchpad1.fixture-one-use-code",
        expiresAt: new Date(Date.now() + 120000).toISOString(),
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page
    .getByRole("region", { name: "Applications workspace" })
    .getByRole("button", { name: "Application Assistant", exact: true })
    .click();
  const area = page.getByRole("region", {
    name: "Application Assistant",
    exact: true,
  });
  await expect(
    area.getByRole("heading", { name: "Prepare and approve an application" }),
  ).toBeVisible();
  await expect(area.getByLabel("Saved supported application")).toHaveValue(
    app.id,
  );
  await area.getByLabel("Saved tailored CV version").selectOption(draft.id);
  await expect(
    area.getByRole("link", { name: "Review exact CV PDF" }),
  ).toHaveAttribute("href", `/api/resumes/${draft.id}/pdf`);
  await expect(
    area.getByRole("button", { name: "Approve immutable package" }),
  ).toBeDisabled();
  for (const key of ["firstName", "lastName", "email"])
    await area
      .getByRole("checkbox", { name: new RegExp(`I verified ${key}:`) })
      .check();
  await area.getByRole("checkbox", { name: /I reviewed this CV/ }).check();
  await area.getByRole("button", { name: "Approve immutable package" }).click();
  await expect(
    area.getByRole("link", { name: "Review approved frozen CV PDF" }),
  ).toHaveAttribute("href", `/api/assisted-apply/${attempt.id}/file?kind=cv`);
  expect(approval?.applicationId).toBe(app.id);
  expect(approval?.draftId).toBe(draft.id);
  expect(approval?.verifiedFacts).toEqual(["firstName", "lastName", "email"]);
  expect(approval?.reviewedAnswers).toEqual([]);
  await area.getByLabel("Installed Chrome extension ID").fill("a".repeat(32));
  await area
    .getByRole("button", { name: "Create two-minute companion handoff" })
    .click();
  await expect(area.getByLabel(/One-time private handoff/)).toHaveValue(
    "launchpad1.fixture-one-use-code",
  );
  await expect(
    area.getByRole("button", { name: "Confirm and submit once" }),
  ).toHaveCount(0);
});
test("uncertain submission shows evidence reconciliation and never offers another browser handoff", async ({
  page,
}) => {
  await base(page);
  let action: Record<string, unknown> | undefined;
  const uncertain = {
    ...attempt,
    state: "uncertain-submission",
    submissionIntentAt: new Date().toISOString(),
    history: [
      {
        state: "uncertain-submission",
        at: new Date().toISOString(),
        reason: "Browser interrupted after explicit intent",
      },
    ],
  };
  await page.route("**/api/assisted-apply/dashboard", (r) =>
    r.fulfill({
      json: {
        recommended: [],
        attempts: [uncertain],
        policy,
        counts: { intervention: 1, browserConfirmed: 0 },
        actions: [],
      },
    }),
  );
  await page.route(`**/api/assisted-apply/${attempt.id}`, (r) => {
    action = r.request().postDataJSON();
    return r.fulfill({ json: uncertain });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Application Assistant", exact: true })
    .click();
  const area = page.getByRole("region", {
    name: "Application Assistant",
    exact: true,
  });
  await area.getByLabel("Saved supported application").selectOption(app.id);
  await expect(
    area.getByRole("button", { name: "Create two-minute companion handoff" }),
  ).toHaveCount(0);
  await area
    .getByText("Reconcile uncertain submission", { exact: true })
    .click();
  await expect(
    area.getByRole("button", {
      name: "I verified no submission occurred; allow fresh review",
    }),
  ).toBeDisabled();
  await area
    .getByLabel("Evidence or reason")
    .fill("Employer confirmed the application was received.");
  await area
    .getByRole("checkbox", { name: /I verified this decision/ })
    .check();
  await area
    .getByRole("button", { name: "Record my confirmed submission evidence" })
    .click();
  await expect.poll(() => action?.action).toBe("reconcile");
  expect(action?.confirmed).toBe(true);
  expect(action?.outcome).toBe("confirmed");
});
test("My Profile application answers require explicit confirmation and show source, scope and stale status", async ({
  page,
}) => {
  await base(page);
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/assisted-apply/answers", (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { id: "answer1", ...saved } });
    }
    return r.fulfill({
      json: saved
        ? [
            {
              id: "answer1",
              question: saved.question,
              answer: saved.answer,
              source: saved.source,
              vacancyKey: attempt.target.key,
              confirmedAt: new Date().toISOString(),
              invalidated: true,
            },
          ]
        : [],
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "My Profile", exact: true }).click();
  const bank = page.getByRole("region", {
    name: "Application Answers",
    exact: true,
  });
  await bank.getByLabel("Original supported job URL").fill(url);
  await bank
    .getByLabel("Exact employer question")
    .fill("Are you authorized to work in the United States?");
  await bank.getByLabel("Your accurate answer").fill("No");
  await bank
    .getByLabel("Source or evidence")
    .fill("My actual current work eligibility");
  await expect(
    bank.getByRole("button", { name: "Save confirmed answer" }),
  ).toBeDisabled();
  await bank.getByRole("checkbox", { name: /I confirm this answer/ }).check();
  await bank.getByRole("button", { name: "Save confirmed answer" }).click();
  await expect(
    bank.getByText("Stale: profile changed", { exact: false }),
  ).toBeVisible();
  expect(saved?.confirmed).toBe(true);
  expect(saved?.answer).toBe("No");
});
