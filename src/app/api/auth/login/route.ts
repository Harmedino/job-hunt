import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSession,
  equalPassword,
  safeNext,
  sameOrigin,
  sessionCookieOptions,
} from "@/lib/auth";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Please sign in from this website." },
      { status: 403 },
    );
  const expected = process.env.APP_PASSWORD;
  if (!expected)
    return NextResponse.json(
      {
        error:
          "APP_PASSWORD is missing from this deployment. Set it in Vercel for the correct environment, then redeploy.",
      },
      { status: 503 },
    );
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Enter your workspace password." },
      { status: 400 },
    );
  }
  if (!body || typeof body.password !== "string" || body.password.length > 1024)
    return NextResponse.json(
      { error: "Enter your workspace password." },
      { status: 400 },
    );
  if (!equalPassword(body.password, expected))
    return NextResponse.json(
      {
        error:
          "That password didn’t match. Use the value saved as APP_PASSWORD for this deployment.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const response = NextResponse.json(
    { ok: true, next: safeNext(body.next) },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(
    SESSION_COOKIE,
    createSession(expected),
    sessionCookieOptions(),
  );
  return response;
}
