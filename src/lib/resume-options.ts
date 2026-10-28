import type { Profile } from "./types";
import { nyscCvText, type CvTrack } from "./career-records";
import { validateKeywords, type JobKeyword } from "./job-keywords";
import { validateCustomFields, type CustomField } from "./custom-fields";
export type ResumeOptions = {
  track: CvTrack;
  includeNysc: boolean;
  includedCustomFields: string[];
  customFields: CustomField[];
  keywords: JobKeyword[];
  selectedRecordIds?: string[];
};
export function validateResumeOptions(
  value: unknown,
  profile?: Profile,
): ResumeOptions {
  if (
    value !== undefined &&
    (!value || typeof value !== "object" || Array.isArray(value))
  )
    throw new Error("Invalid CV options.");
  const v =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (
    v.track !== undefined &&
    !["development", "cybersecurity"].includes(String(v.track))
  )
    throw new Error("Choose Development or Cybersecurity Internship CV.");
  if (v.includeNysc !== undefined && typeof v.includeNysc !== "boolean")
    throw new Error("Choose whether to include NYSC information.");
  const ids = (value: unknown, max: number) => {
    if (
      !Array.isArray(value) ||
      value.length > max ||
      value.some((id) => typeof id !== "string" || !id || id.length > 100)
    )
      throw new Error("Choose valid evidence record IDs.");
    return [...new Set(value as string[])];
  };
  const options: ResumeOptions = {
    track: v.track === "cybersecurity" ? "cybersecurity" : "development",
    includeNysc: v.includeNysc === true,
    includedCustomFields:
      v.includedCustomFields === undefined
        ? []
        : ids(v.includedCustomFields, 25),
    customFields:
      v.customFields === undefined ? [] : validateCustomFields(v.customFields),
    keywords: v.keywords === undefined ? [] : validateKeywords(v.keywords),
    ...(v.selectedRecordIds === undefined
      ? {}
      : { selectedRecordIds: ids(v.selectedRecordIds, 180) }),
  };
  if (profile && options.includeNysc) nyscCvText(profile, true);
  if (
    profile &&
    options.selectedRecordIds?.some(
      (id) =>
        !Object.values(profile.careerRecords || {})
          .flat()
          .some((record) => record.id === id && record.confirmed),
    )
  )
    throw new Error(
      "Some selected career records are unavailable or unconfirmed. Review your master profile.",
    );
  return options;
}
const nyscClaim =
  /(?:\bNYSC\s*(?:status\s*:?\s*)?(?:[:—-]\s*)?(?:completed|exempted|in progress|completion|certificate)\b|\b(?:completed|exempted\s+from)\s+(?:the\s+)?NYSC\b)/i;
export function withoutNyscClaims(value: string) {
  return value
    .split("\n")
    .filter((line) => !nyscClaim.test(line))
    .join("\n");
}
export function validateNyscInContent(
  content: import("./resume-types").ResumeContent | string,
  profile: Profile,
  options: ResumeOptions,
) {
  const text =
    typeof content === "string" ? content : Object.values(content).join("\n");
  if (nyscClaim.test(text)) {
    if (
      !options.includeNysc ||
      !profile.nysc?.confirmed ||
      profile.nysc.status === "Not specified"
    )
      throw new Error(
        "NYSC information requires your confirmed saved status and explicit inclusion for this CV.",
      );
    const claims = [
      ...text.matchAll(
        /NYSC\s*(?:Status\s*:\s*)?[:—-]?\s*(Completed|Exempted|In progress)|\b(Completed|Exempted\s+from)\s+(?:the\s+)?NYSC\b/gi,
      ),
    ];
    for (const claimed of claims) {
      const status =
        claimed[1] ||
        (claimed[2].toLowerCase().startsWith("exempted")
          ? "Exempted"
          : "Completed");
      if (status.toLowerCase() !== profile.nysc.status.toLowerCase())
        throw new Error(
          "The CV NYSC statement differs from your confirmed saved status.",
        );
    }
  }
}
export function validateStatementReviews(
  value: unknown,
): Record<string, "approved" | "rejected" | "edited"> {
  if (value === undefined) return {};
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 60
  )
    throw new Error("Invalid statement review decisions.");
  return Object.fromEntries(
    Object.entries(value).map(([id, status]) => {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,80}$/.test(id) ||
        !["approved", "rejected", "edited"].includes(String(status))
      )
        throw new Error("Invalid statement review decision.");
      return [id, status];
    }),
  ) as Record<string, "approved" | "rejected" | "edited">;
}
