import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, safeNext, validSession } from "@/lib/auth";
import LoginForm from "./login-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Launchpad" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const password = process.env.APP_PASSWORD;
  if (
    password &&
    validSession((await cookies()).get(SESSION_COOKIE)?.value, password)
  )
    redirect(next);
  return <LoginForm configured={!!password} next={next} />;
}
