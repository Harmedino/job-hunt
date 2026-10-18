import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/cron") return NextResponse.next();
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production")
      return new NextResponse(
        "Set APP_PASSWORD to protect your personal data before running in production.",
        { status: 503 },
      );
    return NextResponse.next();
  }
  const auth = request.headers.get("authorization");
  let supplied = "";
  try {
    if (auth?.startsWith("Basic "))
      supplied = atob(auth.slice(6)).split(":").slice(1).join(":");
  } catch {}
  if (supplied !== password)
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate":
          'Basic realm="Personal Job Finder", charset="UTF-8"',
      },
    });
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      return new NextResponse("Invalid origin", { status: 403 });
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
