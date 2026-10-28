import type { Profile } from "./types";
import type { CustomField } from "./custom-fields";
import { calendarToday, validCalendarDate } from "./application-updates";
export const recordSections = {
  employment: "Work experience",
  projects: "Projects",
  education: "Education",
  contributions: "Open-source contributions",
  training: "Training",
  certifications: "Certifications",
} as const;
export type RecordSection = keyof typeof recordSections;
export const recordTextFields = [
  "name",
  "organization",
  "title",
  "employmentType",
  "start",
  "end",
  "location",
  "description",
  "responsibilities",
  "achievements",
  "technologies",
  "github",
  "url",
  "degree",
] as const;
export type CareerRecord = {
  id: string;
  confirmed: boolean;
  present: boolean;
  track: "both" | "development" | "cybersecurity";
} & Record<(typeof recordTextFields)[number], string>;
export type CareerRecords = Partial<Record<RecordSection, CareerRecord[]>>;
export type NyscInformation = {
  status: "Not specified" | "In progress" | "Completed" | "Exempted";
  confirmed: boolean;
  completionDate: string;
  details: string;
};
export type CvTrack = "development" | "cybersecurity";
export type CvTrackProfile = { summary: string; selectedRecordIds: string[] };
export type CvTrackProfiles = Partial<Record<CvTrack, CvTrackProfile>>;
export const emptyCareerRecord = (id: string): CareerRecord =>
  Object.assign(Object.fromEntries(recordTextFields.map((k) => [k, ""])), {
    id,
    confirmed: false,
    present: false,
    track: "both" as const,
  }) as unknown as CareerRecord;
export function validCareerDate(value: string) {
  if (
    value &&
    (!/^\d{4}/.test(value) ||
      Number(value.slice(0, 4)) < 1900 ||
      Number(value.slice(0, 4)) > 2200)
  )
    return false;
  return (
    value === "" ||
    (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 2200) ||
    /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) ||
    validCalendarDate(value)
  );
}
function dateBound(value: string, end: boolean) {
  if (value.length === 4) return value + (end ? "-12-31" : "-01-01");
  if (value.length === 7) return value + (end ? "-31" : "-01");
  return value;
}
function validateLink(value: string) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
  } catch {
    throw new Error(
      "Use a valid HTTP/HTTPS evidence link without credentials.",
    );
  }
}
export function validateCareerRecords(value: unknown): CareerRecords {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid structured career records.");
  const input = value as Record<string, unknown>,
    result: CareerRecords = {},
    ids = new Set<string>();
  for (const key of Object.keys(recordSections) as RecordSection[]) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key]) || input[key].length > 30)
      throw new Error("Use at most 30 records per career section.");
    result[key] = (input[key] as unknown[]).map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid career record.");
      const r = raw as Record<string, unknown>;
      if (
        typeof r.id !== "string" ||
        !r.id ||
        r.id.length > 100 ||
        ids.has(r.id) ||
        typeof r.confirmed !== "boolean" ||
        typeof r.present !== "boolean" ||
        !["both", "development", "cybersecurity"].includes(String(r.track))
      )
        throw new Error(
          "Career records need unique IDs, a career track and explicit confirmation.",
        );
      ids.add(r.id);
      const record = emptyCareerRecord(r.id);
      record.confirmed = r.confirmed;
      record.present = r.present;
      record.track = r.track as CareerRecord["track"];
      for (const field of recordTextFields) {
        if (
          typeof r[field] !== "string" ||
          r[field].length >
            (["responsibilities", "achievements", "description"].includes(field)
              ? 8000
              : 1500)
        )
          throw new Error(`Invalid career record ${field}.`);
        record[field] = r[field].trim();
      }
      for (const field of ["start", "end"] as const)
        if (!validCareerDate(record[field]))
          throw new Error(
            "Use a known date as YYYY, YYYY-MM or YYYY-MM-DD, or leave it unknown.",
          );
      if (record.present && record.end)
        throw new Error("Choose Present or an end date, not both.");
      if (
        record.start &&
        record.end &&
        dateBound(record.start, false) > dateBound(record.end, true)
      )
        throw new Error("An end date cannot precede the start date.");
      validateLink(record.url);
      validateLink(record.github);
      if (
        record.confirmed &&
        ((key === "employment" && (!record.organization || !record.title)) ||
          (key === "education" && (!record.organization || !record.degree)) ||
          (!["employment", "education"].includes(key) && !record.name))
      )
        throw new Error(
          "Add the real employer/title, institution/degree or record name before confirming it.",
        );
      return record;
    });
  }
  return result;
}
export function validateNysc(value: unknown): NyscInformation {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid NYSC information.");
  const v = value as Record<string, unknown>;
  if (
    !["Not specified", "In progress", "Completed", "Exempted"].includes(
      String(v.status),
    ) ||
    typeof v.confirmed !== "boolean" ||
    typeof v.completionDate !== "string" ||
    !validCalendarDate(v.completionDate) ||
    typeof v.details !== "string" ||
    v.details.length > 2000 ||
    (["Completed", "Exempted"].includes(String(v.status)) &&
      !!v.completionDate &&
      v.completionDate > calendarToday())
  )
    throw new Error(
      "Choose your actual NYSC status and optional known completion date.",
    );
  return {
    status: v.status as NyscInformation["status"],
    confirmed: v.confirmed,
    completionDate: v.completionDate,
    details: v.details.trim(),
  };
}
export function validateCvTracks(value: unknown): CvTrackProfiles {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid CV track profiles.");
  const input = value as Record<string, unknown>,
    result: CvTrackProfiles = {};
  for (const key of ["development", "cybersecurity"] as const) {
    if (input[key] === undefined) continue;
    const v = input[key] as CvTrackProfile;
    if (
      !v ||
      typeof v.summary !== "string" ||
      v.summary.length > 3000 ||
      !Array.isArray(v.selectedRecordIds) ||
      v.selectedRecordIds.length > 180 ||
      v.selectedRecordIds.some(
        (id) => typeof id !== "string" || id.length > 100,
      )
    )
      throw new Error(
        "CV profiles need a concise supplied summary and valid selected record IDs.",
      );
    result[key] = {
      summary: v.summary.trim(),
      selectedRecordIds: [...new Set(v.selectedRecordIds)],
    };
  }
  return result;
}
const lines = (value: string) =>
  value
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
export function formatCareerRecord(
  record: CareerRecord,
  section: RecordSection,
) {
  const heading =
    section === "employment"
      ? [record.organization, record.title].filter(Boolean).join(" — ")
      : section === "education"
        ? [record.degree, record.organization].filter(Boolean).join(" — ")
        : record.name;
  const dates = [record.start, record.present ? "Present" : record.end]
    .filter(Boolean)
    .join(" – ");
  return [
    heading,
    [record.employmentType, dates, record.location].filter(Boolean).join(" · "),
    record.description,
    record.technologies ? `Technologies: ${record.technologies}` : "",
    ...lines(record.responsibilities).map(
      (v) => "• " + v.replace(/^[•*-]\s*/, ""),
    ),
    ...lines(record.achievements).map((v) => "• " + v.replace(/^[•*-]\s*/, "")),
    record.github,
    record.url,
  ]
    .filter(Boolean)
    .join("\n");
}
export function materializeCareerProfile(
  profile: Profile,
  track: CvTrack = "development",
): Profile {
  const out = { ...profile };
  if (
    profile.skillGroups?.length &&
    profile.skillGroups.some((f) => f.confirmed)
  )
    out.skills = profile.skillGroups
      .filter((f) => f.confirmed)
      .map((f) => f.name + ": " + f.value)
      .join("\n");
  const selected = profile.cvTracks?.[track]?.selectedRecordIds;
  for (const key of Object.keys(recordSections) as RecordSection[]) {
    const records = profile.careerRecords?.[key];
    if (
      records === undefined ||
      (records.length && !records.some((r) => r.confirmed))
    )
      continue;
    const field = key === "employment" ? "experience" : key;
    if (["experience", "projects", "education"].includes(field))
      (out as unknown as Record<string, unknown>)[field] = records
        .filter(
          (r) =>
            r.confirmed &&
            (r.track === "both" || r.track === track) &&
            (!selected?.length || selected.includes(r.id)),
        )
        .map((r) => formatCareerRecord(r, key))
        .join("\n\n");
  }
  return out;
}
export function careerAdditionalEvidence(profile: Profile, track: CvTrack) {
  return (Object.keys(recordSections) as RecordSection[]).flatMap((section) =>
    (profile.careerRecords?.[section] || [])
      .filter(
        (r) =>
          r.confirmed &&
          (r.track === "both" || r.track === track) &&
          (!profile.cvTracks?.[track]?.selectedRecordIds.length ||
            profile.cvTracks[track]!.selectedRecordIds.includes(r.id)),
      )
      .map((record) => ({
        record,
        section,
        text: formatCareerRecord(record, section),
        label:
          section === "employment"
            ? [record.organization, record.title].filter(Boolean).join(" — ")
            : section === "education"
              ? [record.degree, record.organization].filter(Boolean).join(" — ")
              : record.name,
      })),
  );
}
export function nyscCvText(profile: Profile, include: boolean) {
  if (!include) return "";
  const n = profile.nysc;
  if (!n || !n.confirmed || n.status === "Not specified")
    throw new Error(
      "Confirm your actual NYSC status in My Profile before including it.",
    );
  return [
    `NYSC Status: ${n.status}`,
    n.completionDate ? `Completion date: ${n.completionDate}` : "",
    n.details,
  ]
    .filter(Boolean)
    .join("\n");
}
export function confirmedCustomEvidence(
  fields: CustomField[] | undefined,
  ids: string[],
) {
  return (fields || [])
    .filter(
      (f) =>
        ids.includes(f.id) &&
        f.confirmed &&
        f.name &&
        f.value &&
        !/\bnysc\b/i.test(f.name),
    )
    .map((f) => `${f.name}: ${f.value}`)
    .join("\n");
}
