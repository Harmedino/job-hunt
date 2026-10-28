import { extractResumeProfile } from "./resume-profile";
/** Imports are proposals only. The owner must approve changes and deliberately save My Profile. */
export async function importResume(text: string) {
  const extracted = await extractResumeProfile(text);
  return {
    text,
    fields: extracted.fields,
    method: extracted.method,
    aiWarning: extracted.warning,
    persisted: false,
    previewOnly: true,
    patchedFields: [],
    warning:
      "Extracted information is ready for review, not saved. Your master profile has not changed; approve proposed updates and save My Profile deliberately.",
    extractionWarning:
      "Text extraction does not preserve the original layout. Review reading order, dates, employers and project grouping, especially for multi-column documents.",
  };
}
