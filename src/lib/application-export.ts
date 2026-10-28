import type { Application } from "./types";
import { applicationStatusLabel } from "./application-updates";
import { resumeContactFields, resumeSections } from "./resume-types";
const scalar = (value: unknown) =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  typeof value === "number"
    ? value
    : undefined;
function pick(value: unknown, keys: string[]) {
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    keys.filter((k) => scalar(obj[k]) !== undefined).map((k) => [k, obj[k]]),
  );
}
export function applicationExport(app: Application) {
  const snapshot = app.documentSnapshot,
    cv = snapshot?.cv;
  return {
    ...pick(app, [
      "id",
      "origin",
      "createdAt",
      "updatedAt",
      "submittedAt",
      "applicationDate",
      "followUpDate",
      "interviewDate",
      "saved",
      "unsavedAt",
      "notes",
      "followUp",
      "interviewInfo",
      "employerResponse",
      "nextAction",
      "cvDraftId",
    ]),
    status: applicationStatusLabel(app.status),
    customFields: (app.customFields || []).map((f) =>
      pick(f, ["id", "name", "value", "confirmed"]),
    ),
    originalFiles: (app.originalFiles || []).map((f) =>
      pick(f, [
        "id",
        "kind",
        "name",
        "mime",
        "size",
        "sha256",
        "createdAt",
        "source",
        "supersedes",
        "correctionReason",
      ]),
    ),
    originalFileIds: app.originalFileIds,
    job: pick(app.job, [
      "id",
      "title",
      "company",
      "url",
      "source",
      "location",
      "salary",
      "description",
      "postedAt",
      "closedAt",
      "expiresAt",
      "eligibility",
      "eligibilityReason",
    ]),
    statusHistory: (app.statusHistory || []).map((item) =>
      pick(item, ["status", "at"]),
    ),
    submittedDocuments: snapshot
      ? {
          ...pick(snapshot, [
            "capturedAt",
            "cvLabel",
            "coverLetter",
            "coverLetterUsed",
          ]),
          files: (snapshot.files || []).map((f) =>
            pick(f, [
              "id",
              "kind",
              "name",
              "mime",
              "size",
              "sha256",
              "createdAt",
              "source",
            ]),
          ),
          cv: cv
            ? {
                ...pick(cv, [
                  "id",
                  "createdAt",
                  "method",
                  "template",
                  "layoutVersion",
                ]),
                content: pick(cv.content, [
                  ...resumeContactFields,
                  ...Object.keys(resumeSections),
                ]),
                target: pick(cv.target, ["title", "company", "url"]),
                sectionOrder: cv.sectionOrder,
              }
            : null,
        }
      : null,
  };
}
const csvCell = (value: unknown) => {
  let text = value === undefined || value === null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function applicationsCsv(apps: Application[]) {
  const keys = [
    "id",
    "company",
    "role",
    "url",
    "location",
    "salary",
    "status",
    "origin",
    "applicationDate",
    "createdAt",
    "updatedAt",
    "submittedAt",
    "followUpDate",
    "interviewDate",
    "nextAction",
    "employerResponse",
    "notes",
    "followUp",
    "interviewInfo",
    "submittedCvId",
    "submittedCvReference",
    "coverLetterUsed",
  ];
  return (
    "\uFEFF" +
    [
      keys.map(csvCell).join(","),
      ...apps.map((app) => {
        const row = {
          ...app,
          company: app.job.company,
          role: app.job.title,
          url: app.job.url,
          location: app.job.location,
          salary: app.job.salary,
          status: applicationStatusLabel(app.status),
          submittedCvId: app.documentSnapshot?.cv?.id || "",
          submittedCvReference: app.documentSnapshot?.cvLabel || "",
          coverLetterUsed: app.documentSnapshot?.coverLetterUsed || "unknown",
        };
        return keys
          .map((k) => csvCell((row as Record<string, unknown>)[k]))
          .join(",");
      }),
    ].join("\r\n")
  );
}
