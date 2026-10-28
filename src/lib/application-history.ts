import type { Application } from "./types";
import { statuses } from "./types";
import { applicationWasApplied } from "./vacancy-groups";
import { calendarToday } from "./application-updates";
export function applicationSaved(app: Application) {
  return (
    app.saved !== false &&
    !applicationWasApplied(app) &&
    app.status !== "Archived"
  );
}
export function applicationStage(app: Application) {
  return app.saved === false && !applicationWasApplied(app)
    ? "Archived"
    : app.status;
}
export function statusHistory(app: Application, next: string, now: string) {
  const history = app.statusHistory?.length
    ? app.statusHistory
    : [{ status: app.status, at: app.createdAt || now }];
  return next === app.status
    ? history
    : [...history, { status: next, at: now }];
}
export function applicationCounts(apps: Application[]) {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      apps.filter((app) => applicationStage(app) === status).length,
    ]),
  );
}
export type ApplicationFilters = {
  stage?: string;
  query?: string;
  year?: string;
  from?: string;
  to?: string;
  sort?: string;
};
export function filterApplications(apps: Application[], f: ApplicationFilters) {
  return apps
    .filter((app) => {
      const date = app.applicationDate || "",
        stage = applicationStage(app);
      return (
        (!f.stage || stage === f.stage) &&
        (!f.year || date.startsWith(f.year + "-")) &&
        (!f.from || date >= f.from) &&
        (!f.to || (!!date && date <= f.to)) &&
        (!f.query ||
          `${app.job.company} ${app.job.title} ${date}`
            .toLowerCase()
            .includes(f.query.toLowerCase()))
      );
    })
    .sort((a, b) =>
      f.sort === "followUp"
        ? (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999")
        : f.sort === "applied"
          ? (b.applicationDate || "").localeCompare(a.applicationDate || "")
          : String(b.updatedAt || b.createdAt).localeCompare(
              String(a.updatedAt || a.createdAt),
            ),
    );
}
export function applicationActions(apps: Application[], now = new Date()) {
  const today = calendarToday(now),
    until = calendarToday(new Date(now.getTime() + 7 * 86400000));
  return apps
    .filter(
      (app) =>
        !["Archived", "Rejected", "Offer"].includes(applicationStage(app)),
    )
    .flatMap((app) =>
      (["followUpDate", "interviewDate"] as const).flatMap((key) => {
        const date = app[key];
        return date && date <= until
          ? [
              {
                app,
                date,
                kind: key === "followUpDate" ? "Follow-up" : "Interview",
                overdue: date < today,
              },
            ]
          : [];
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
export type JobHuntAvailability = {
  mode: "Not set" | "Preparing" | "Actively applying" | "Paused";
  readyFrom: string;
};
export function validateAvailability(value: unknown): JobHuntAvailability {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid job-hunting availability.");
  const v = value as Record<string, unknown>;
  if (
    !["Not set", "Preparing", "Actively applying", "Paused"].includes(
      String(v.mode),
    ) ||
    typeof v.readyFrom !== "string" ||
    !/^$|^\d{4}-\d{2}-\d{2}$/.test(v.readyFrom) ||
    (v.readyFrom &&
      (!Number.isFinite(Date.parse(v.readyFrom)) ||
        new Date(v.readyFrom).toISOString().slice(0, 10) !== v.readyFrom))
  )
    throw new Error(
      "Choose an availability setting and valid optional start date.",
    );
  return {
    mode: v.mode as JobHuntAvailability["mode"],
    readyFrom: v.readyFrom,
  };
}
