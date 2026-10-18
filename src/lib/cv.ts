import { cvFileProblem, MAX_CV_TEXT } from "./cv-limits";
export class CvInputError extends Error {
  constructor(
    message: string,
    public status = 422,
    public code = "UNREADABLE_FILE",
  ) {
    super(message);
    this.name = "CvInputError";
  }
}
export async function extractCv(file: File) {
  const problem = cvFileProblem(file);
  if (problem)
    throw new CvInputError(problem.message, problem.status, problem.code);
  const bytes = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    if (/\.txt$/i.test(file.name)) text = bytes.toString("utf8");
    else if (/\.docx$/i.test(file.name)) {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
        throw new CvInputError(
          "This DOCX is invalid or protected. Open it in Word and save an unprotected DOCX, PDF, or TXT copy.",
        );
      const { extractRawText } = await import("mammoth");
      text = (await extractRawText({ buffer: bytes })).value;
    } else {
      if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
        throw new CvInputError(
          "This file is not a readable PDF. Export your CV as a PDF again, or choose DOCX/TXT.",
        );
      const { getPath } = await import("pdf-parse/worker");
      const { PDFParse } = await import("pdf-parse");
      PDFParse.setWorker(getPath());
      const parser = new PDFParse({
        data: new Uint8Array(bytes),
        isEvalSupported: false,
      });
      try {
        text = (await parser.getText({ pageJoiner: "\n" })).text;
      } finally {
        await parser.destroy();
      }
    }
  } catch (error) {
    if (error instanceof CvInputError) throw error;
    console.error(
      "CV parsing failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    if (error instanceof Error && error.name === "PasswordException")
      throw new CvInputError(
        "This PDF is password-protected. Upload an unlocked copy or a DOCX/TXT version.",
      );
    throw new CvInputError(
      "We couldn’t read this file. Re-export it as a text-based PDF or DOCX, or paste your CV text into the profile form.",
    );
  }
  text = text.replace(/\u0000/g, "").trim();
  if (!text)
    throw new CvInputError(
      "No readable text was found. Scanned PDFs need OCR; choose a text-based PDF, DOCX, or TXT file.",
    );
  if (text.length > MAX_CV_TEXT)
    throw new CvInputError(
      "Your CV contains too much text. Limit it to 50,000 characters.",
    );
  return text;
}
