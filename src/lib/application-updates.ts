import { statuses } from "./types";
export const applicationStatusLabel = (status: string) =>
  status === "Ready for review"
    ? "Ready to Apply"
    : status === "Preparing"
      ? "Preparing CV"
      : status;
export function validCalendarDate(value: unknown) {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function calendarToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function applicationUpdate(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Invalid application update.");
  const value = body as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id || value.id.length > 100)
    throw new Error("Invalid application ID.");
  const status =
    value.status === "Ready to Apply"
      ? "Ready for review"
      : value.status === "Preparing CV"
        ? "Preparing"
        : value.status;
  if (
    status !== undefined &&
    !(statuses as readonly unknown[]).includes(status)
  )
    throw new Error("Invalid application status.");
  if (status === "Submitted" && value.submissionConfirmed !== true)
    throw new Error(
      "Confirm that you submitted this application on the employer website.",
    );
  const fields: Record<string, string> = {};
  if (typeof status === "string") fields.status = status;
  for (const [key, max] of [
    ["followUp", 2000],
    ["notes", 8000],
    ["interviewInfo", 4000],
    ["employerResponse", 4000],
    ["nextAction", 2000],
  ] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string" || value[key].length > max)
        throw new Error(`Invalid ${key}.`);
      fields[key] = value[key];
    }
  }
  for (const key of [
    "applicationDate",
    "followUpDate",
    "interviewDate",
  ] as const) {
    if (value[key] !== undefined) {
      if (!validCalendarDate(value[key]))
        throw new Error("Use a valid date in YYYY-MM-DD format.");
      fields[key] = value[key] as string;
    }
  }
  if (fields.applicationDate && fields.applicationDate > calendarToday())
    throw new Error("The actual application date cannot be in the future.");
  if (value.saved !== undefined && typeof value.saved !== "boolean")
    throw new Error("Invalid saved-job preference.");
  return { id: value.id, fields, saved: value.saved as boolean | undefined };
}
