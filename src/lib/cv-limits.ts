export const MAX_CV_BYTES = 4 * 1024 * 1024;
export const MAX_CV_TEXT = 50000;
export const CV_ACCEPT = ".pdf,.docx,.txt";
export function cvFileProblem(file: { name: string; size: number }) {
  if (file.size === 0)
    return {
      status: 400,
      code: "EMPTY_FILE",
      message: "This file is empty. Choose a PDF, DOCX, or TXT CV.",
    };
  if (file.size > MAX_CV_BYTES)
    return {
      status: 413,
      code: "FILE_TOO_LARGE",
      message:
        "Your CV must be 4 MB or smaller. Export a smaller PDF or upload a DOCX/TXT version.",
    };
  if (!/\.(pdf|docx|txt)$/i.test(file.name))
    return {
      status: 415,
      code: "UNSUPPORTED_FORMAT",
      message:
        "Choose a PDF, DOCX, or TXT file. Convert older .doc files to DOCX or PDF first.",
    };
  return null;
}
