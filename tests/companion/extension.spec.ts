import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import {
  applicationTarget,
  verifyForm,
  type AssistedPackage,
} from "../../src/lib/assisted-apply";
import { parseReport } from "../../src/lib/assisted-store";
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const fixtureUrl =
  "https://job-boards.greenhouse.io/launchpadfixture/jobs/12345";
const formHtml = (
  platform = "Greenhouse",
  uploadFails = false,
) => `<!doctype html><html><head><title>Fictional ATS fixture — no real applications</title></head><body><h1>Fictional Developer Application</h1><form id="${platform === "Greenhouse" ? "application-form" : "fixture-form"}" class="${platform === "Lever" ? "application-form" : platform === "Ashby" ? "ashby-application-form" : ""}">
${platform === "Greenhouse" ? '<label for="first_name">First Name *</label><input id="first_name" required><label for="last_name">Last Name *</label><input id="last_name" required>' : `<label for="${platform === "Ashby" ? "_systemfield_name" : "name"}">Full Name *</label><input id="${platform === "Ashby" ? "_systemfield_name" : "name"}" required>`}
<label for="${platform === "Ashby" ? "_systemfield_email" : "email"}">Email *</label><input type="email" id="${platform === "Ashby" ? "_systemfield_email" : "email"}" required>
<label for="${platform === "Ashby" ? "_systemfield_resume" : "resume"}">Resume/CV *</label><input type="file" id="${platform === "Ashby" ? "_systemfield_resume" : "resume"}" required>
<label for="eligibility">Are you authorized to work in the United States? *</label><select id="eligibility" required><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select>
<label for="motivation">Why this role? *</label><textarea id="motivation" required></textarea>
<div class="application-question"><div class="application-label">Would you relocate? *</div><label><input type="radio" name="relocation" value="yes" required>Yes</label><label><input type="radio" name="relocation" value="no">No</label></div>
<div class="application-question"><div class="application-label">Which technologies have you used?</div><label><input type="checkbox" name="technologies" value="react">React</label><label><input type="checkbox" name="technologies" value="angular">Angular</label></div>
<label for="start_date">Your confirmed availability date *</label><input type="date" id="start_date" required>
<label for="legal">I agree to the privacy policy *</label><input id="legal" type="checkbox" required>
<button type="submit">Submit application</button></form><script>window.fixtureSubmissions=0;document.querySelector('form').addEventListener('submit',function(e){e.preventDefault();window.fixtureSubmissions++;});${uploadFails ? "document.querySelector('input[type=file]').addEventListener('change',function(){this.value='';});" : ""}</script></body></html>`;
type Harness = {
  context: BrowserContext;
  popup: Page;
  employer: Page;
  actions: string[];
  extensionId: string;
  pack: AssistedPackage;
  cleanup: () => Promise<void>;
};
async function harness(
  platform = "Greenhouse",
  uploadFails = false,
): Promise<Harness> {
  const url =
    platform === "Lever"
      ? "https://jobs.lever.co/launchpadfixture/11111111-2222-3333-4444-555555555555/apply"
      : platform === "Ashby"
        ? "https://jobs.ashbyhq.com/launchpadfixture/11111111-2222-3333-4444-555555555555/application"
        : fixtureUrl;
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const pack: AssistedPackage = {
    version: 1,
    id: "fixture-attempt",
    applicationId: "fixture-app",
    draftId: "fixture-cv",
    company: "Fictional fixture employer",
    title: "React Developer",
    approvedAt: new Date().toISOString(),
    target: applicationTarget(url),
    facts: {
      firstName: "Test",
      lastName: "Candidate",
      email: "test@example.org",
    },
    answers: [
      {
        id: "answer1",
        question: "Are you authorized to work in the United States?",
        answer: "No",
        vacancyKey: applicationTarget(url).key,
        confirmedAt: new Date().toISOString(),
      },
      {
        id: "legal-answer",
        question: "I agree to the privacy policy",
        answer: "Yes",
        vacancyKey: applicationTarget(url).key,
        confirmedAt: new Date().toISOString(),
      },
    ],
    files: [
      {
        kind: "cv",
        name: "fixture-cv.pdf",
        size: bytes.length,
        mime: "application/pdf",
        sha256: sha(bytes),
        base64: bytes.toString("base64"),
      },
    ],
  };
  pack.answers.push(
    ...[
      {
        id: "relocation-answer",
        question: "Would you relocate?",
        answer: "No",
      },
      {
        id: "tech-answer",
        question: "Which technologies have you used?",
        answer: "React",
      },
      {
        id: "availability-answer",
        question: "Your confirmed availability date",
        answer: "2027-01-15",
      },
    ].map((a) => ({
      ...a,
      vacancyKey: pack.target.key,
      confirmedAt: new Date().toISOString(),
    })),
  );
  const actions: string[] = [];
  let state = "awaiting-user";
  const server = createServer(async (req, res) => {
    if (req.url === "/background.html") {
      res.setHeader("Content-Type", "text/html");
      res.end('<script type="module" src="/background.js"></script>');
      return;
    }
    if (
      [
        "/background.js",
        "/popup.html",
        "/popup.js",
        "/popup.css",
        "/generated/policy.js",
      ].includes(req.url || "")
    ) {
      const resource = req.url!.slice(1);
      res.setHeader(
        "Content-Type",
        resource.endsWith(".html")
          ? "text/html"
          : resource.endsWith(".css")
            ? "text/css"
            : "text/javascript",
      );
      res.end(await readFile("browser-extension/" + resource));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.end(
        JSON.stringify({ package: pack, sha256: sha(JSON.stringify(pack)) }),
      );
      return;
    }
    if (req.url?.endsWith("handoff")) {
      res.end(
        JSON.stringify({ id: pack.id, state, leaseToken: "a".repeat(43) }),
      );
      return;
    }
    actions.push(body.action);
    if (body.action === "verify") {
      try {
        const report = verifyForm(
          pack,
          parseReport(body.report),
          body.manualReviewed,
        );
        state = report.ready ? "verified-ready" : "awaiting-user";
        res.end(
          JSON.stringify({
            state,
            report,
            reportHash: sha(JSON.stringify(report)),
          }),
        );
      } catch (error) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }
    if (body.action === "submit-intent") state = "uncertain-submission";
    if (body.action === "receipt") state = "confirmed-submission";
    res.end(JSON.stringify({ state }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number },
    origin = `http://127.0.0.1:${address.port}`;
  // The managed system Chromium prohibits unpacked extensions. Execute the unmodified
  // shipped scripts with a test-only Chrome API transport; DOM controls remain real.
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const context = await browser.newContext();
  await context.route("https://job-boards.greenhouse.io/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: formHtml(platform, uploadFails),
    }),
  );
  await context.route("https://jobs.lever.co/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: formHtml(platform, uploadFails),
    }),
  );
  await context.route("https://jobs.ashbyhq.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: formHtml(platform, uploadFails),
    }),
  );
  const extensionId = "a".repeat(32),
    background = await context.newPage();
  const tabs = new Map<number, Page>();
  let nextTab = 1;
  await background.exposeFunction("fixtureCreate", async (url: string) => {
    const p = await context.newPage();
    const id = nextTab++;
    tabs.set(id, p);
    await p.addInitScript(
      ({ extensionId }) => {
        const listeners: ((...args: unknown[]) => unknown)[] = [];
        Reflect.set(window, "fixtureListeners", listeners);
        Reflect.set(window, "chrome", {
          runtime: {
            id: extensionId,
            onMessage: {
              addListener: (fn: (...args: unknown[]) => unknown) =>
                listeners.push(fn),
            },
          },
        });
      },
      { extensionId },
    );
    await p.goto(url);
    return { id, url };
  });
  await background.exposeFunction("fixtureGet", (id: number) => {
    const p = tabs.get(id);
    if (!p) throw new Error("Tab closed");
    return { id, url: p.url() };
  });
  await background.exposeFunction("fixtureInject", async (id: number) => {
    await tabs.get(id)!.addScriptTag({ path: "browser-extension/content.js" });
  });
  await background.exposeFunction(
    "fixtureContent",
    async (id: number, message: unknown) =>
      tabs.get(id)!.evaluate(
        ({ message, extensionId }) =>
          new Promise((resolve) => {
            const listeners = Reflect.get(window, "fixtureListeners");
            listeners[0](message, { id: extensionId }, resolve);
          }),
        { message, extensionId },
      ),
  );
  await background.addInitScript(
    ({ extensionId, origin }) => {
      let pair: unknown;
      const listeners: unknown[] = [];
      Reflect.set(window, "fixtureBackgroundListeners", listeners);
      Reflect.set(window, "chrome", {
        runtime: {
          id: extensionId,
          getURL: (p: string) => origin + "/" + p,
          onMessage: { addListener: (fn: unknown) => listeners.push(fn) },
        },
        storage: {
          session: {
            get: async () => ({ pair }),
            set: async (v: { pair: unknown }) => {
              pair = v.pair;
            },
            remove: async () => {
              pair = undefined;
            },
          },
        },
        tabs: {
          create: async (v: { url: string }) =>
            Reflect.get(window, "fixtureCreate")(v.url),
          get: async (id: number) => Reflect.get(window, "fixtureGet")(id),
          update: async () => ({}),
        },
        scripting: {
          executeScript: async (v: { target: { tabId: number } }) =>
            Reflect.get(window, "fixtureInject")(v.target.tabId),
        },
      });
      Reflect.get(window, "chrome").tabs.sendMessage = (
        id: number,
        message: unknown,
      ) => Reflect.get(window, "fixtureContent")(id, message);
    },
    { extensionId, origin },
  );
  await background.goto(origin + "/background.html");
  await expect
    .poll(() =>
      background.evaluate(
        () => Reflect.get(window, "fixtureBackgroundListeners")?.length || 0,
      ),
    )
    .toBe(1);
  const popup = await context.newPage();
  await popup.exposeFunction("fixturePopupSend", (message: unknown) =>
    background.evaluate(
      ({ message, extensionId, origin }) =>
        new Promise((resolve) =>
          Reflect.get(window, "fixtureBackgroundListeners")[0](
            message,
            { id: extensionId, url: origin + "/popup.html" },
            resolve,
          ),
        ),
      { message, extensionId, origin },
    ),
  );
  await popup.addInitScript(
    ({ extensionId }) =>
      Reflect.set(window, "chrome", {
        runtime: {
          id: extensionId,
          sendMessage: (message: unknown) =>
            Reflect.get(window, "fixturePopupSend")(message),
        },
        permissions: {
          request: async (permission: { origins: string[] }) => {
            if (permission.origins.some((pattern) => new URL(pattern).port))
              throw new Error(
                "Chrome host permission patterns cannot restrict ports",
              );
            return true;
          },
        },
      }),
    { extensionId },
  );
  await popup.goto(origin + "/popup.html");
  const code =
    "launchpad1." +
    Buffer.from(
      JSON.stringify({
        origin,
        token: "fictional-one-time-token",
        attemptId: pack.id,
      }),
    ).toString("base64url");
  await popup.getByLabel("One-time handoff from Launchpad").fill(code);
  await popup
    .getByRole("button", { name: "Pair approved application" })
    .click();
  await expect(popup.locator("#job")).toContainText(
    "Fictional fixture employer",
  );
  const newPage = context.waitForEvent("page");
  await popup
    .getByRole("button", { name: "Open employer page", exact: true })
    .click();
  const employer = await newPage;
  await employer.waitForLoadState();
  await employer.locator("form").waitFor();
  return {
    context,
    popup,
    employer,
    actions,
    extensionId,
    pack,
    cleanup: async () => {
      await context.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await browser.close();
    },
  };
}
async function fillAndReview(h: Harness) {
  await h.popup
    .getByRole("button", { name: "Fill approved fields", exact: true })
    .click();
  await expect(h.employer.locator('input[type="email"]')).toHaveValue(
    "test@example.org",
  );
  await expect(h.employer.locator("#eligibility")).toHaveValue("no");
  await expect(h.employer.locator("#legal")).not.toBeChecked();
  await expect(
    h.employer.locator('[name="relocation"][value="no"]'),
  ).toBeChecked();
  await expect(
    h.employer.locator('[name="technologies"][value="react"]'),
  ).toBeChecked();
  await expect(
    h.employer.locator('[name="technologies"][value="angular"]'),
  ).not.toBeChecked();
  await expect(h.employer.locator("#start_date")).toHaveValue("2027-01-15");
  await h.employer
    .locator("#motivation")
    .fill("My actual React project experience matches this role.");
  await h.employer.locator("#legal").check();
  await h.popup
    .getByRole("button", { name: "Read form values", exact: true })
    .click();
  await h.popup.getByRole("checkbox",{name:/I reviewed Why this role/}).check();
  await h.popup.getByRole("checkbox",{name:/I reviewed I agree to the privacy policy/}).check();
  await h.popup
    .getByRole("button", { name: "Verify all entered values", exact: true })
    .click();
  await expect(h.popup.locator("#state")).toHaveText("verified-ready");
}
test("Greenhouse fills actual controls and files, reads selected values, leaves legal acceptance to owner and gates submission", async () => {
  const h = await harness();
  try {
    await fillAndReview(h);
    await expect(h.popup.locator("#fields")).toContainText(
      h.pack.files[0].sha256,
    );
    await h.employer
      .getByRole("button", { name: "Submit application" })
      .click();
    expect(
      await h.employer.evaluate(() =>
        Reflect.get(window, "fixtureSubmissions"),
      ),
    ).toBe(0);
    await h.popup
      .getByRole("button", { name: "Confirm and submit once", exact: true })
      .click();
    await expect(h.popup.getByRole("alert")).toContainText("type SUBMIT");
    expect(h.actions).not.toContain("submit-intent");
    await h.popup.locator("#confirmed").check();
    await h.popup.locator("#confirmation").fill("SUBMIT");
    await h.popup
      .getByRole("button", { name: "Confirm and submit once", exact: true })
      .click();
    await expect(h.popup.locator("#state")).toHaveText("uncertain-submission");
    expect(
      await h.employer.evaluate(() =>
        Reflect.get(window, "fixtureSubmissions"),
      ),
    ).toBe(1);
    await expect(
      h.popup.getByRole("button", {
        name: "Confirm and submit once",
        exact: true,
      }),
    ).toBeDisabled();
    await h.popup
      .getByRole("button", { name: "Check employer confirmation", exact: true })
      .click();
    await expect(h.popup.getByRole("alert")).toContainText(
      "No explicit confirmation",
    );
    await h.employer.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="application_confirmation">Thank you for applying! Your application has been received.</div>',
      );
    });
    await h.popup
      .getByRole("button", { name: "Check employer confirmation", exact: true })
      .click();
    await expect(h.popup.locator("#state")).toHaveText("confirmed-submission");
    expect(h.actions.filter((a) => a === "submit-intent")).toHaveLength(1);
  } finally {
    await h.cleanup();
  }
});
test("changed fields after review prevent any submission intent and require a fresh review", async () => {
  const h = await harness();
  try {
    await fillAndReview(h);
    await h.employer.locator("#email").fill("changed@example.org");
    await h.popup.locator("#confirmed").check();
    await h.popup.locator("#confirmation").fill("SUBMIT");
    await h.popup
      .getByRole("button", { name: "Confirm and submit once", exact: true })
      .click();
    await expect(h.popup.getByRole("alert")).toContainText("form changed");
    expect(h.actions).not.toContain("submit-intent");
    expect(
      await h.employer.evaluate(() =>
        Reflect.get(window, "fixtureSubmissions"),
      ),
    ).toBe(0);
  } finally {
    await h.cleanup();
  }
});
test("failed uploads remain blockers and cannot be certified as ready", async () => {
  const h = await harness("Greenhouse", true);
  try {
    await h.popup
      .getByRole("button", { name: "Fill approved fields", exact: true })
      .click();
    await expect(h.popup.locator("#blockers")).toContainText("Resume/CV");
    await expect(
      h.popup.getByRole("button", {
        name: "Confirm and submit once",
        exact: true,
      }),
    ).toBeDisabled();
    expect(h.actions).not.toContain("submit-intent");
  } finally {
    await h.cleanup();
  }
});
test("login and CAPTCHA stop filling and password values are never included in reports", async () => {
  const h = await harness();
  try {
    await h.employer.evaluate(() => {
      const input = document.createElement("input");
      input.type = "password";
      input.value = "fictional-password-must-not-leave-page";
      document.querySelector("form")!.append(input);
    });
    await h.popup
      .getByRole("button", { name: "Fill approved fields", exact: true })
      .click();
    await expect(h.popup.getByRole("alert")).toContainText("login required");
    await h.popup
      .getByRole("button", { name: "Read form values", exact: true })
      .click();
    await expect(h.popup.locator("#fields")).not.toContainText(
      "fictional-password",
    );
    await h.employer
      .locator("input[type=password]")
      .evaluate((el) => el.remove());
    await h.employer.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.src = "about:blank#recaptcha";
      frame.setAttribute("src", "https://captcha.invalid/recaptcha");
      document.body.append(frame);
    });
    await h.popup
      .getByRole("button", { name: "Fill approved fields", exact: true })
      .click();
    await expect(h.popup.getByRole("alert")).toContainText(
      "Human verification",
    );
  } finally {
    await h.cleanup();
  }
});
for (const platform of ["Lever", "Ashby"])
  test(`${platform} supported single-page fixture maps verified full name, email, dropdown and immutable PDF`, async () => {
    const h = await harness(platform);
    try {
      await fillAndReview(h);
      await expect(
        h.employer.locator(
          platform === "Lever" ? "#name" : "#_systemfield_name",
        ),
      ).toHaveValue("Test Candidate");
      expect(
        await h.employer.evaluate(() =>
          Reflect.get(window, "fixtureSubmissions"),
        ),
      ).toBe(0);
    } finally {
      await h.cleanup();
    }
  });
