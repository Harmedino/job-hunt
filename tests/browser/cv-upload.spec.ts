import { test, expect } from "@playwright/test";
async function openProfile(page: import("@playwright/test").Page) {
  await page.route("**/api/status", (r) =>
    r.fulfill({
      json: { database: false, ai: false, scheduler: false, protected: false },
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
        persisted: false,
        warning: "CV read into the form, but not saved. Connect storage.",
      },
    }),
  );
  await openProfile(page);
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
  await expect(region.getByRole("button", { name: "Choose CV" })).toBeEnabled();
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
