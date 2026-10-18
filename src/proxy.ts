import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  validSession,
  sameOrigin,
  requestOrigin,
} from "@/lib/auth";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path === "/api/cron" ||
    path === "/login" ||
    path === "/api/auth/login" ||
    path === "/api/auth/logout"
  )
    return NextResponse.next();
  const password = process.env.APP_PASSWORD;
  if (!password && process.env.NODE_ENV !== "production")
    return NextResponse.next();
  const authenticated =
    !!password &&
    validSession(request.cookies.get(SESSION_COOKIE)?.value, password);
  if (!authenticated) {
    if (path.startsWith("/api/"))
      return NextResponse.json(
        {
          error: password
            ? "Please sign in to continue."
            : "Set APP_PASSWORD in this deployment’s environment variables and redeploy.",
          code: password ? "AUTH_REQUIRED" : "AUTH_NOT_CONFIGURED",
        },
        {
          status: password ? 401 : 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    const login = new URL("/login", requestOrigin(request));
    login.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(login, {
      status: 303,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    !sameOrigin(request)
  ) {
    return new NextResponse("Invalid origin", { status: 403 });
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
