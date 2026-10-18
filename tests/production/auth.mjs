import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { startProduction } from "./server.mjs";
const start = (password) => startProduction({ APP_PASSWORD: password });
const missing = await start("");
try {
  assert.equal(
    (await fetch(missing.url + "/", { redirect: "manual" })).status,
    303,
  );
  assert.match(
    await (await fetch(missing.url + "/login")).text(),
    /Finish setting up your workspace/,
  );
  assert.equal((await fetch(missing.url + "/api/profile")).status, 503);
  console.log(
    "Unconfigured production: setup page is reachable; private API stays locked.",
  );
} finally {
  await missing.stop();
}
const password = randomBytes(32).toString("base64url") + "é";
const server = await start(password);
let browser;
try {
  const denied = await fetch(server.url + "/api/profile");
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("www-authenticate"), null);
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(server.url + "/");
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  await page
    .getByLabel("Workspace password", { exact: true })
    .fill("incorrect-test-password");
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await page.locator(".login-error").waitFor();
  assert.match(await page.locator(".login-error").innerText(), /didn’t match/);
  await page.getByLabel("Workspace password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await page
    .getByRole("heading", { name: "Find your next opportunity." })
    .waitFor();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "launchpad_session",
  );
  assert.ok(cookie?.httpOnly);
  assert.ok(cookie.secure);
  assert.equal(cookie.sameSite, "Lax");
  assert.equal(
    (await context.request.get(server.url + "/api/status")).status(),
    200,
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  assert.equal(
    (await context.request.get(server.url + "/api/profile")).status(),
    401,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  console.log(
    "Configured production: real form login, wrong-password feedback, secure session, dashboard access and logout passed.",
  );
} finally {
  await browser?.close();
  await server.stop();
}
