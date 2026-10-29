import { test, expect, type Page } from "@playwright/test";
import { emptyProfile } from "../../src/lib/types";
import { emptyCareerRecord } from "../../src/lib/career-records";
import { validateManualJob } from "../../src/lib/manual-jobs";
import { profileResume, resumeEvidence } from "../../src/lib/resume-builder";
import type { ResumeDraft } from "../../src/lib/resume-types";
const work = {
  ...emptyCareerRecord("actual-work"),
  confirmed: true,
  organization: "Fictional Web Studio",
  title: "Developer",
  start: "2023-04",
  end: "2025-08",
  responsibilities: "Built React forms.\nIntegrated REST APIs.",
  technologies: "React, TypeScript",
};
const profile = {
  ...emptyProfile,
  name: "Career Fixture",
  email: "career@example.org",
  skills: "React, TypeScript",
  careerRecords: { employment: [work] },
  nysc: {
    status: "Completed" as const,
    confirmed: true,
    completionDate: "2025-06-01",
    details: "",
  },
};
const target = {
  title: "React Developer",
  company: "Fictional Employer",
  description:
    "Required: React and TypeScript. Preferred: Kubernetes. NYSC completion requested.",
  url: "",
};
async function base(page: Page) {
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { database: true, ai: true, aiLabel: "Google Gemini" } }),
  );
  await page.route("**/api/profile", (r) => r.fulfill({ json: profile }));
  for (const api of [
    "applications",
    "notifications",
    "keyword-presets",
    "manual-jobs",
  ])
    await page.route(`**/api/${api}`, (r) => r.fulfill({ json: [] }));
  await page.route("**/api/discover", (r) =>
    r.fulfill({
      json: { jobs: [], persisted: true, refreshRecommended: false },
    }),
  );
  await page.route("**/api/resumes/working**", (r) =>
    r.fulfill({ json: { copy: null, ok: true } }),
  );
  await page.goto("/");
}
test("manual jobs support reviewed suggestions, editable keywords and private saved records without invented links", async ({
  page,
}) => {
  await base(page);
  let stored: ReturnType<typeof validateManualJob> | undefined;
  await page.route("**/api/manual-jobs", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: stored ? [stored] : [] });
    stored = validateManualJob(r.request().postDataJSON(), stored);
    return r.fulfill({ json: stored });
  });
  await page
    .getByRole("button", { name: "Add Job Manually", exact: true })
    .click();
  const form = page.getByRole("dialog", { name: "Add Job Manually" });
  await form
    .getByLabel("Job description", { exact: true })
    .fill(
      "Position: React Developer\nCompany: Fictional Employer\nRequired: React and TypeScript.\nPreferred: Kubernetes.",
    );
  await form
    .getByRole("button", { name: "Suggest fields from pasted description" })
    .click();
  await expect(form.getByLabel("Job title", { exact: true })).toHaveValue("");
  await form.getByRole("button", { name: "Use reviewed suggestions" }).click();
  await expect(form.getByLabel("Job title", { exact: true })).toHaveValue(
    "React Developer",
  );
  await expect(form.getByLabel("Original job URL (optional)")).toHaveValue("");
  await form
    .getByRole("button", { name: "Add Custom Field", exact: true })
    .click();
  const custom = form.getByRole("region", {
    name: "Custom fields",
    exact: true,
  });
  await custom
    .getByLabel("Field name", { exact: true })
    .fill("Employer question");
  await custom
    .getByLabel("Field value", { exact: true })
    .fill("Availability to discuss");
  await expect(
    form
      .getByText("Needs review / no supporting qualification established", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await form.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(form).not.toBeVisible();
  await page
    .getByRole("button", { name: "My Added Jobs", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "React Developer", exact: true }),
  ).toBeVisible();
  expect(stored?.url).toBe("");
  expect(stored?.postedAt).toBe("");
  expect(stored?.customFields?.[0].name).toBe("Employer question");
  await page
    .getByRole("button", { name: "Edit manual job", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit manual job" });
  await edit.getByLabel("Job title", { exact: true }).fill("Angular Developer");
  await edit.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Angular Developer", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("structured profile and optional NYSC remain editable and require a deliberate save", async ({
  page,
}) => {
  await base(page);
  let saved: typeof profile | undefined;
  await page.route("**/api/profile", (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: saved });
    }
    return r.fulfill({ json: profile });
  });
  await page.getByRole("button", { name: "My Profile", exact: true }).click();
  const records = page.getByRole("region", {
    name: "Structured master career profile",
  });
  await records.getByText("Work experience", { exact: false }).first().click();
  await records
    .getByRole("button", { name: "Add employment record", exact: true })
    .click();
  const employer = records.getByLabel("Employer name", { exact: true });
  await employer.nth(1).fill("Another Fictional Studio");
  await records
    .getByLabel("Actual job title", { exact: true })
    .nth(1)
    .fill("Frontend Developer");
  await records
    .getByLabel("Actual responsibilities (one bullet per line)")
    .nth(1)
    .fill("Built TypeScript interfaces.");
  await records
    .getByLabel(
      "I confirm this record describes my actual work, education or learning",
    )
    .nth(1)
    .check();
  await records.getByText("Optional NYSC information", { exact: true }).click();
  await records
    .getByRole("combobox", { name: "NYSC Status", exact: true })
    .selectOption("In progress");
  await expect(
    records.getByLabel("I confirm this is my accurate NYSC information"),
  ).not.toBeChecked();
  expect(saved).toBeUndefined();
  await records
    .getByLabel("I confirm this is my accurate NYSC information")
    .check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect.poll(() => saved?.careerRecords.employment.length).toBe(2);
  expect(saved?.nysc.status).toBe("In progress");
  expect(saved?.careerRecords.employment[0].start).toBe("2023-04");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("entry editing, independent cover letter retry and actual PDF pagination preserve the saved CV", async ({
  page,
}, info) => {
  await base(page);
  let current: ResumeDraft = {
    id: "career-cv-1",
    familyId: "career-cv-1",
    createdAt: new Date().toISOString(),
    target,
    content: profileResume(profile, target),
    profileSnapshot: profile,
    evidence: resumeEvidence(profile),
    method: "Basic layout only · no AI writing",
    warnings: [],
    requirementsToReview: [],
    manualEdits: false,
    coverLetter: "",
    layoutVersion: 2,
  };
  let attempts = 0,
    saveCount = 0;
  await page.route("**/api/resumes", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { drafts: [] } });
    const body = r.request().postDataJSON();
    if (body.action === "save") {
      saveCount++;
      current = {
        ...current,
        id: `career-cv-${saveCount + 1}`,
        content: body.content,
        coverLetter: body.coverLetter,
        options: body.options,
        manualEdits: true,
      };
    }
    return r.fulfill({ json: current });
  });
  await page.route("**/api/resumes/*/writing", (r) => {
    attempts++;
    const b = r.request().postDataJSON();
    expect(b.section).toBe("coverLetter");
    if (attempts === 1)
      return r.fulfill({
        status: 503,
        json: {
          error:
            "Google Gemini temporarily overloaded (HTTP 503). Saved CV retained.",
        },
      });
    expect(b.retry).toBe(true);
    current = {
      ...current,
      id: "letter-success",
      coverLetter:
        "Dear Hiring Team,\n\nMy actual React experience supports this role.\n\nKind regards,\nCareer Fixture",
    };
    return r.fulfill({ json: current });
  });
  await page.route("**/api/resumes/*/preview?*", (r) =>
    new URL(r.request().url()).searchParams.has("meta")
      ? r.fulfill({ json: { pageCount: 2 } })
      : r.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=",
            "base64",
          ),
        }),
  );
  await page.getByRole("button", { name: "CV Builder", exact: true }).click();
  const builder = page.getByRole("region", { name: "CV builder", exact: true });
  await builder.getByLabel("Target role", { exact: true }).fill(target.title);
  await builder
    .getByLabel("Job description", { exact: true })
    .fill(target.description);
  await builder
    .getByRole("radio", { name: "Basic layout only (no AI)", exact: true })
    .check();
  await builder
    .getByRole("button", { name: "Create basic layout", exact: true })
    .click();
  await builder
    .getByText("Edit individual entries and bullets", { exact: true })
    .first()
    .click();
  await builder
    .getByRole("button", { name: "Add bullet", exact: true })
    .first()
    .click();
  await builder
    .getByLabel("Experience / project bullet", { exact: true })
    .last()
    .fill("Tested real React forms.");
  await builder
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  expect(current.content.experience).toContain("Tested real React forms.");
  await builder
    .getByRole("button", { name: "Cover letter", exact: true })
    .click();
  await builder
    .getByRole("button", { name: "Generate cover letter with AI", exact: true })
    .click();
  await expect(builder.getByRole("alert")).toContainText("503");
  expect(current.content.experience).toContain("Tested real React forms.");
  await builder
    .getByRole("button", { name: "Retry cover letter only", exact: true })
    .click();
  await expect(
    builder.getByLabel("Cover letter text", { exact: true }),
  ).toContainText("My actual React experience");
  await builder.getByRole("button", { name: "CV", exact: true }).click();
  if (info.project.name === "mobile")
    await builder.getByRole("button", { name: "Preview", exact: true }).click();
  const pdf = builder.getByRole("region", { name: "Actual saved PDF pages" });
  await expect(pdf.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  await pdf.getByRole("button", { name: "Next PDF page" }).click();
  await expect(
    pdf.getByRole("img", { name: "Saved CV PDF page 2 of 2" }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("pasted security jobs choose the internship CV track and copied bullets stay individually editable", async ({
  page,
}, info) => {
  await base(page);
  const copied = {
    ...profile,
    careerRecords: undefined,
    skills: "React, Angular, TypeScript, Linux, Security Testing Tools",
    experience:
      "Fictional Web Studio — Frontend Developer\n2024 – Present\n● Maintain Angular forms. ● Integrate documented APIs. ● Investigate actual UI issues.",
    projects:
      "Fictional Portal\nReact · TypeScript\n● Build reusable interfaces. ● Test form validation.",
  };
  await page.route("**/api/profile", (r) => r.fulfill({ json: copied }));
  let generated = false;
  await page.route("**/api/resumes", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { drafts: [] } });
    const body = r.request().postDataJSON();
    expect(body.options.track).toBe("cybersecurity");
    generated = true;
    const evidence = resumeEvidence(copied, body.options);
    return r.fulfill({
      json: {
        id: "copied-bullets",
        familyId: "copied-bullets",
        createdAt: new Date().toISOString(),
        target: body.target,
        options: body.options,
        content: profileResume(copied, body.target, evidence, body.options),
        profileSnapshot: copied,
        evidence,
        method: "Basic layout only · no AI writing",
        coverLetter: "",
        warnings: [],
        requirementsToReview: [],
        manualEdits: false,
        layoutVersion: 2,
      },
    });
  });
  await page.route("**/api/resumes/*/preview?*", (r) =>
    r.fulfill({ json: { pageCount: 0 } }),
  );
  await page.reload();
  await page.getByRole("button", { name: "CV Builder", exact: true }).click();
  const builder = page.getByRole("region", { name: "CV builder", exact: true });
  await builder
    .getByLabel("Target role", { exact: true })
    .fill("Security Engineer Internship");
  await expect(builder.getByLabel("CV career track")).toHaveValue(
    "cybersecurity",
  );
  await builder.getByLabel("CV career track").selectOption("development");
  await builder
    .getByLabel("Job description", { exact: true })
    .fill(
      "Supervised Linux and web application security internship for beginners.",
    );
  await expect(builder.getByLabel("CV career track")).toHaveValue(
    "development",
  );
  await builder
    .getByRole("button", { name: "Use this job’s career track", exact: true })
    .click();
  await expect(builder.getByLabel("CV career track")).toHaveValue(
    "cybersecurity",
  );
  await builder
    .getByRole("radio", { name: "Basic layout only (no AI)", exact: true })
    .check();
  await builder
    .getByRole("button", { name: "Create basic layout", exact: true })
    .click();
  await expect(
    builder.getByLabel("Professional summary", { exact: true }),
  ).toHaveValue(/Seeking a cybersecurity internship/);
  await expect(builder.getByLabel("Skills", { exact: true })).toHaveValue(
    /Security foundations: Linux/,
  );
  await expect(
    builder.getByRole("button", {
      name: "Refresh Professional summary for internship (no AI)",
      exact: true,
    }),
  ).toBeVisible();
  await builder
    .getByText("Edit individual entries and bullets", { exact: true })
    .first()
    .click();
  const bulletEditors = builder.getByRole("textbox", {
    name: "Experience / project bullet",
    exact: true,
  });
  await expect(bulletEditors).toHaveCount(3);
  await expect(bulletEditors.nth(0)).toHaveValue("Maintain Angular forms.");
  await expect(bulletEditors.nth(1)).toHaveValue("Integrate documented APIs.");
  await expect(bulletEditors.nth(2)).toHaveValue(
    "Investigate actual UI issues.",
  );
  if (info.project.name === "mobile")
    await builder.getByRole("button", { name: "Preview", exact: true }).click();
  await builder
    .getByText("Editable HTML preview (approximate)", { exact: true })
    .click();
  const preview = builder.getByRole("region", {
    name: "CV preview",
    exact: true,
  });
  await expect(
    preview
      .getByRole("heading", {
        name: "Fictional Web Studio — Frontend Developer",
        exact: true,
      })
      .locator("..")
      .getByRole("listitem"),
  ).toHaveCount(3);
  await expect(
    preview
      .getByRole("heading", { name: "Fictional Portal", exact: true })
      .locator("..")
      .getByRole("listitem"),
  ).toHaveCount(2);
  expect(generated).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
