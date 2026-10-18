import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_SECONDS,
  createSession,
  validSession,
  safeNext,
  sameOrigin,
} from "../src/lib/auth";
import { proxy } from "../src/proxy";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
const password = randomBytes(32).toString("base64url");
const oldPassword = process.env.APP_PASSWORD;
const oldNode = process.env.NODE_ENV;
after(() => {
  for (const [key, value] of [
    ["APP_PASSWORD", oldPassword],
    ["NODE_ENV", oldNode],
  ]) {
    if (value === undefined) Reflect.deleteProperty(process.env, key!);
    else Reflect.set(process.env, key!, value);
  }
});
function body(value: unknown, origin = "https://workspace.example") {
  return new Request("https://workspace.example/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(value),
  });
}
test("signed sessions reject forgery, expiry, and password rotation", () => {
  const token = createSession(password, 1000);
  assert.equal(validSession(token, password, 1001), true);
  assert.equal(validSession(token + "x", password, 1001), false);
  assert.equal(validSession(token, password + "new", 1001), false);
  assert.equal(validSession(token, password, 1000 + SESSION_SECONDS), false);
  assert.equal(validSession("not-a-token", password), false);
  assert.notEqual(createSession(password, 1000), token);
});
test("sign-in return URLs stay inside the workspace", () => {
  for (const value of [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/login",
    "/api/profile",
  ])
    assert.equal(safeNext(value), "/");
  assert.equal(safeNext("/?tab=profile"), "/?tab=profile");
});
test("production authentication uses a login page and keeps private APIs blocked", async () => {
  Object.assign(process.env, {
    NODE_ENV: "production",
    APP_PASSWORD: password,
  });
  const page = proxy(new NextRequest("https://workspace.example/"));
  assert.equal(page.status, 303);
  assert.equal(
    new URL(page.headers.get("location")!, "https://workspace.example")
      .pathname,
    "/login",
  );
  assert.equal(page.headers.get("www-authenticate"), null);
  const denied = proxy(
    new NextRequest("https://workspace.example/api/profile"),
  );
  assert.equal(denied.status, 401);
  const wrong = await login(body({ password: "incorrect" }));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);
  assert.equal(
    (await login(body({ password }, "https://evil.example"))).status,
    403,
  );
  const response = await login(body({ password, next: "//evil.example" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, next: "/" });
  const cookie = response.cookies.get(SESSION_COOKIE)!;
  assert.ok(cookie.httpOnly);
  assert.ok(cookie.secure);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
  assert.equal(validSession(cookie.value, password), true);
  const authorized = proxy(
    new NextRequest("https://workspace.example/api/profile", {
      headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` },
    }),
  );
  assert.equal(authorized.headers.get("x-middleware-next"), "1");
  assert.equal(
    proxy(
      new NextRequest("https://workspace.example/api/profile", {
        method: "PUT",
        headers: {
          cookie: `${SESSION_COOKIE}=${cookie.value}`,
          Origin: "https://evil.example",
        },
      }),
    ).status,
    403,
  );
  assert.equal(
    (
      await logout(
        new Request("https://workspace.example/api/auth/logout", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        }),
      )
    ).status,
    403,
  );
  const cleared = await logout(
    new Request("https://workspace.example/api/auth/logout", {
      method: "POST",
    }),
  );
  assert.equal(cleared.cookies.get(SESSION_COOKIE)?.maxAge, 0);
  delete process.env.APP_PASSWORD;
  assert.equal(
    proxy(new NextRequest("https://workspace.example/api/profile")).status,
    503,
  );
  assert.equal((await login(body({ password }))).status, 503);
});

test("origin checks use the external host and protocol behind a hosting proxy", () => {
  const request = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      Host: "workspace.example",
      "x-forwarded-proto": "https",
      Origin: "https://workspace.example",
    },
  });
  assert.equal(sameOrigin(request), true);
  assert.equal(
    sameOrigin(
      new Request(request, {
        headers: {
          Host: "workspace.example",
          "x-forwarded-proto": "https",
          Origin: "https://evil.example",
        },
      }),
    ),
    false,
  );
});

test("login redirects retain the public deployment hostname", () => {
  process.env.APP_PASSWORD = password;
  const response = proxy(
    new NextRequest("http://localhost:3000/", {
      headers: { Host: "workspace.example", "x-forwarded-proto": "https" },
    }),
  );
  assert.equal(
    new URL(response.headers.get("location")!).origin,
    "https://workspace.example",
  );
});
