import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const SESSION_COOKIE = "launchpad_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export function equalPassword(supplied: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
function signature(payload: string, password: string) {
  return createHmac("sha256", password)
    .update("launchpad-session-v1|" + payload)
    .digest("base64url");
}
export function createSession(
  password: string,
  now = Math.floor(Date.now() / 1000),
) {
  const payload = `${now + SESSION_SECONDS}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${signature(payload, password)}`;
}
export function validSession(
  token: string | undefined,
  password: string,
  now = Math.floor(Date.now() / 1000),
) {
  if (!token || !password || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, sig] = parts;
  if (
    !/^\d{1,12}$/.test(expires) ||
    !/^[A-Za-z0-9_-]{32}$/.test(nonce) ||
    !/^[A-Za-z0-9_-]{43}$/.test(sig) ||
    Number(expires) <= now
  )
    return false;
  return equalPassword(sig, signature(`${expires}.${nonce}`, password));
}
export function safeNext(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /%2f|%5c/i.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://launchpad.invalid");
    if (
      url.origin !== "https://launchpad.invalid" ||
      url.pathname === "/login" ||
      url.pathname.startsWith("/api/")
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
export function requestOrigin(request: Request) {
  const target = new URL(request.url);
  const host = request.headers.get("host") || target.host;
  const forwarded = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwarded && ["http", "https"].includes(forwarded)
      ? forwarded + ":"
      : target.protocol;
  return new URL(`${protocol}//${host}`).origin;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === requestOrigin(request);
  } catch {
    return false;
  }
}
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
