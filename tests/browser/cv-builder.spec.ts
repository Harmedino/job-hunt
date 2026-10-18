import { test, expect } from "@playwright/test";
import { emptyProfile } from "../../src/lib/types";
import type { ResumeDraft } from "../../src/lib/resume-types";
import { PDFDocument } from "pdf-lib";
const profile = {
  ...emptyProfile,
  name: "CV Builder Test",
  email: "cv@example.org",
  skills: "React, TypeScript",
  experience: "Built accessible interfaces at Example Co.",
  education: "BSc Computer Science",
  projects: "A TypeScript portfolio",
};
const description =
  "Build accessible React and TypeScript interfaces for our fully remote team. Kubernetes is a desirable skill.";
const job = {
  id: "builder-job-fixture",
  title: "Frontend Developer",
  company: "Builder Fixture",
  description,
  url: "https://remotive.com/remote-jobs/builder-fixture",
  location: "Worldwide",
  salary: "",
  source: "Remotive",
  postedAt: new Date().toISOString(),
  discoveredAt: new Date().toISOString(),
  eligibility: "eligible",
  eligibilityReason: "Source lists Worldwide",
  score: 80,
  matchedSkills: ["React"],
};
const first: ResumeDraft = {
  id: "cv-version-1",
  familyId: "cv-version-1",
  createdAt: new Date().toISOString(),
  target: { title: job.title, company: job.company, description, url: "" },
  content: {
    name: profile.name,
    email: profile.email,
    phone: "",
    location: "Nigeria",
    github: "",
    linkedin: "",
    portfolio: "",
    summary: "Relevant skills: React, TypeScript.",
    skills: profile.skills,
    experience: profile.experience,
    projects: profile.projects,
    education: profile.education,
    additional: "",
  },
  profileSnapshot: profile,
  evidence: [
    { section: "skills", text: profile.skills },
    { section: "experience", text: profile.experience },
  ],
  method: "Profile-based CV builder",
  warnings: [],
  requirementsToReview: [],
  manualEdits: false,
};
async function open(
  page: import("@playwright/test").Page,
  applications: unknown[] = [],
  ai = false,
) {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: true, ai, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/profile", (r) => r.fulfill({ json: profile }));
  await page.route("**/api/discover", (r) =>
    r.fulfill({
      json: { jobs: [job], persisted: true, refreshRecommended: false },
    }),
  );
  await page.route("**/api/applications", (r) =>
    r.fulfill({ json: applications }),
  );
  await page.route("**/api/notifications", (r) => r.fulfill({ json: [] }));
  await page.goto("/");
}
test("CV builder creates an editable draft, saves a separate version and downloads a PDF", async ({
  page,
}) => {
  let generated = false,
    saved = false;
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  await page.route("**/api/resumes", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { drafts: [] } });
    const body = r.request().postDataJSON();
    if (body.action === "generate") {
      generated = true;
      expect(body.useAi).toBe(false);
      expect(body.target.description).toBe(description);
      return r.fulfill({ json: first });
    }
    saved = true;
    expect(body.draftId).toBe(first.id);
    expect(body.content.summary).toBe(
      "React and TypeScript skills for accessible interfaces.",
    );
    return r.fulfill({
      json: {
        ...first,
        id: "cv-version-2",
        previousId: first.id,
        content: body.content,
        coverLetter: body.coverLetter,
        template: body.template,
        manualEdits: true,
      },
    });
  });
  await page.route("**/api/resumes/cv-version-2/pdf", (r) =>
    r.fulfill({ contentType: "application/pdf", body: Buffer.from(bytes) }),
  );
  await open(page);
  await page.getByRole("button", { name: "CV Builder", exact: true }).click();
  const builder = page.getByRole("region", { name: "CV builder", exact: true });
  await builder.getByLabel("Target role").fill(job.title);
  await builder.getByLabel("Company", { exact: true }).fill(job.company);
  await builder
    .getByLabel("Job description", { exact: true })
    .fill(description);
  await builder
    .getByRole("button", { name: "Create profile-based CV" })
    .click();
  await expect(
    builder.getByLabel("Professional summary", { exact: true }),
  ).toHaveValue(first.content.summary);
  await builder
    .getByLabel("Professional summary", { exact: true })
    .fill("React and TypeScript skills for accessible interfaces.");
  await expect(
    builder.getByRole("region", { name: "CV preview" }),
  ).toContainText("React and TypeScript skills for accessible interfaces.");
  await builder.getByRole("button", { name: "Save new version" }).click();
  await expect(builder.getByRole("status")).toContainText(
    "New CV version saved",
  );
  const downloadEvent = page.waitForEvent("download");
  await builder.getByRole("button", { name: "Download CV PDF" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("tailored-cv.pdf");
  expect(generated && saved).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("applications open the correct job in CV builder and link an explicit saved version", async ({
  page,
}) => {
  const application = {
    id: "builder-application-fixture",
    job,
    status: "Saved",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    followUp: "",
  };
  const draft = {
    ...first,
    target: { ...first.target, jobId: job.id, applicationId: application.id },
  };
  let attached = false;
  await page.route("**/api/resumes", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { drafts: [] } });
    expect(r.request().postDataJSON().applicationId).toBe(application.id);
    return r.fulfill({ json: draft });
  });
  await page.route("**/api/resumes/cv-version-1/attach", (r) => {
    attached = true;
    return r.fulfill({ json: { ok: true, applicationId: application.id } });
  });
  await open(page, [application]);
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page
    .getByRole("button", { name: "Build tailored CV", exact: true })
    .click();
  const builder = page.getByRole("region", { name: "CV builder", exact: true });
  await expect(
    builder.getByLabel("Job description", { exact: true }),
  ).toHaveValue(description);
  await builder
    .getByRole("button", { name: "Create profile-based CV" })
    .click();
  await builder
    .getByRole("button", { name: "Use this CV for application" })
    .click();
  await expect(builder.getByRole("status")).toContainText(
    "linked to the application",
  );
  expect(attached).toBe(true);
});
test("AI drafting shows evidence gaps and keeps provider errors actionable", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/resumes", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { drafts: [] } });
    expect(r.request().postDataJSON().useAi).toBe(true);
    return ++calls === 1
      ? r.fulfill({
          status: 502,
          json: {
            error:
              "OpenAI usage or rate limit reached. Check API billing and limits, then retry.",
          },
        })
      : r.fulfill({
          json: {
            ...first,
            method: "AI-tailored CV · factual checks completed",
            requirementsToReview: ["Kubernetes is a desirable skill."],
          },
        });
  });
  await open(page, [], true);
  await page.getByRole("button", { name: "CV Builder", exact: true }).click();
  const builder = page.getByRole("region", { name: "CV builder", exact: true });
  await builder.getByLabel("Job to tailor for").selectOption(job.id);
  await builder
    .getByRole("button", { name: "Build tailored CV", exact: true })
    .click();
  await expect(builder.getByRole("alert")).toContainText("Check API billing");
  await builder
    .getByRole("button", { name: "Build tailored CV", exact: true })
    .click();
  await expect(
    builder.getByRole("heading", { name: "Requirements to check" }),
  ).toBeVisible();
  await expect(
    builder.getByText("Kubernetes is a desirable skill.", { exact: true }),
  ).toBeVisible();
  await expect(builder.getByLabel("Skills", { exact: true })).not.toHaveValue(
    /Kubernetes/,
  );
});

test("cover letter and style edits persist before PDF and Word downloads", async ({
  page,
}, testInfo) => {
  let current = {
    ...first,
    coverLetter: "Dear Hiring Team,\n\nOriginal profile-based letter.",
    template: "classic" as const,
  } as ResumeDraft;
  let saves = 0;
  const exported: string[] = [];
  await page.route("**/api/resumes", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { drafts: [] } });
    const body = r.request().postDataJSON();
    if (body.action === "save") {
      saves++;
      current = {
        ...current,
        id: "letter-version-2",
        content: body.content,
        coverLetter: body.coverLetter,
        template: body.template,
        manualEdits: true,
      };
    }
    return r.fulfill({ json: current });
  });
  await page.route("**/api/resumes/*/export?*", (r) => {
    const url = new URL(r.request().url());
    expect(url.pathname).toContain("letter-version-2");
    expect(current.coverLetter).toContain("My edited letter");
    expect(current.template).toBe("modern");
    exported.push(
      `${url.searchParams.get("document")}:${url.searchParams.get("format")}`,
    );
    return r.fulfill({
      contentType: "application/octet-stream",
      body: Buffer.from("export fixture"),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "CV Builder", exact: true }).click();
  const builder = page.getByRole("region", { name: "CV builder", exact: true });
  await builder.getByLabel("Job to tailor for").selectOption(job.id);
  await builder
    .getByRole("button", { name: "Create profile-based CV" })
    .click();
  await builder
    .getByRole("button", { name: "Cover letter", exact: true })
    .click();
  await builder
    .getByLabel("Cover letter text", { exact: true })
    .fill(
      "Dear Hiring Team,\n\nMy edited letter about accessible React work.\n\nKind regards,\nCV Builder Test",
    );
  await builder.getByLabel("Document style").selectOption("modern");
  await expect(
    builder.getByRole("region", { name: "Cover letter preview" }),
  ).toContainText("My edited letter");
  let download = page.waitForEvent("download");
  await builder
    .getByRole("button", { name: "Download editable Word (.docx)" })
    .click();
  expect((await download).suggestedFilename()).toBe("cover-letter.docx");
  download = page.waitForEvent("download");
  await builder
    .getByRole("button", { name: "Download cover letter PDF" })
    .click();
  expect((await download).suggestedFilename()).toBe("cover-letter.pdf");
  await builder.getByRole("button", { name: "CV", exact: true }).click();
  await expect(
    builder.getByLabel("Professional summary", { exact: true }),
  ).toHaveValue(first.content.summary);
  download = page.waitForEvent("download");
  await builder
    .getByRole("button", { name: "Download editable Word (.docx)" })
    .click();
  expect((await download).suggestedFilename()).toBe("tailored-cv.docx");
  expect(saves).toBe(1);
  expect(exported).toEqual(["letter:docx", "letter:pdf", "cv:docx"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (testInfo.project.name === "desktop")
    await builder
      .getByRole("region", { name: "CV preview" })
      .screenshot({ path: "/tmp/job-hunt-cv-preview.png" });
});
