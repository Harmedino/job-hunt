import { test, expect } from "@playwright/test";
async function openProfile(page: import("@playwright/test").Page, ai = false) {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/discover", (r) =>
    r.fulfill({ json: { jobs: [], persisted: false } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "My Profile", exact: true }).click();
}
test("Choose CV opens the real file chooser even without MongoDB and shows unsaved imported text", async ({
  page,
}) => {
  await page.route("**/api/cv", (r) =>
    r.fulfill({
      json: {
        text: "My CV\nReact and TypeScript",
        fields: { name: "Imported Applicant", email: "test@example.org", skills: "React, TypeScript" },
        persisted: false,
        warning: "CV read into the form, but not saved. Connect storage.",
      },
    }),
  );
  await openProfile(page);
  await page.getByLabel("Full name").fill("My edited name");
  const region = page.getByRole("region", { name: "CV upload" });
  const chooserEvent = page.waitForEvent("filechooser");
  await region.getByRole("button", { name: "Choose CV" }).click();
  const chooser = await chooserEvent;
  await chooser.setFiles({
    name: "resume.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("DOCX fixture handled by mocked extraction endpoint"),
  });
  await expect(region.getByRole("alert")).toContainText("not saved");
  await expect(
    page.getByLabel("Existing CV text · review extracted content"),
  ).toHaveValue("My CV\nReact and TypeScript");
  await expect(page.getByLabel("Full name")).toHaveValue("My edited name");
  await expect(page.getByLabel("Email address")).toHaveValue("test@example.org");
  await expect(page.getByLabel("Skills (comma separated)")).toHaveValue("React, TypeScript");
  await expect(region.getByRole("button", { name: "Choose CV" })).toBeEnabled();
});
test("configured AI can be checked and provider billing errors remain visible", async ({ page }) => {
  await page.route("**/api/ai/check", (r) => r.fulfill({ status: 502, json: { error: "OpenAI usage or rate limit reached. Check API billing and limits, then retry." } }));
  await openProfile(page, true);
  await page.getByRole("button", { name: "Test AI connection" }).click();
  await expect(page.getByText("OpenAI usage or rate limit reached. Check API billing and limits, then retry.", { exact: true })).toBeVisible();
});
test("profile still loads when discovery is unavailable", async ({ page }) => {
  await page.route("**/api/status", (r) => r.fulfill({ json: { database: true, ai: false, scheduler: false, protected: false } }));
  await page.route("**/api/discover", (r) => r.fulfill({ status: 503, json: { error: "Job feed unavailable" } }));
  await page.route("**/api/profile", (r) => r.fulfill({ json: { name: "Saved Applicant", email: "saved@example.org", skills: "React" } }));
  await page.route("**/api/applications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/notifications", (r) => r.fulfill({ status: 503, json: { error: "Notifications unavailable" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "My Profile", exact: true }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Saved Applicant");
  await expect(page.getByLabel("Skills (comma separated)")).toHaveValue("React");
});
test("an already-uploaded CV can populate empty profile fields", async ({ page }) => {
  await openProfile(page);
  const cv = "Test Applicant\ntest@example.org\nSkills\nReact, TypeScript";
  await page.getByLabel("Existing CV text · review extracted content").fill(cv);
  await page.route("**/api/profile/import", async (r) => {
    expect(r.request().postDataJSON()).toEqual({ text: cv });
    await r.fulfill({ json: { text: cv, fields: { name: "Test Applicant", email: "test@example.org", skills: "React, TypeScript" }, persisted: true } });
  });
  await page.getByRole("button", { name: "Fill profile from saved CV" }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Test Applicant");
  await expect(page.getByLabel("Skills (comma separated)")).toHaveValue("React, TypeScript");
});
test("host payload errors are readable and selecting the same file can retry", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/cv", (r) =>
    ++calls === 1
      ? r.fulfill({
          status: 413,
          contentType: "text/plain",
          body: "FUNCTION_PAYLOAD_TOO_LARGE",
        })
      : r.fulfill({ json: { text: "React", persisted: true } }),
  );
  await openProfile(page);
  const input = page.getByLabel("Upload your CV");
  const file = {
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("React"),
  };
  await input.setInputFiles(file);
  const region = page.getByRole("region", { name: "CV upload" });
  await expect(region.getByRole("alert")).toContainText("4 MB");
  await input.setInputFiles(file);
  await expect(region.getByRole("status")).toContainText("saved");
  expect(calls).toBe(2);
});
