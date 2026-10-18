import { db } from "@/lib/db";
import { CvInputError, extractCv } from "@/lib/cv";
import { MAX_CV_BYTES } from "@/lib/cv-limits";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    if (
      Number(request.headers.get("content-length")) >
      MAX_CV_BYTES + 128 * 1024
    )
      return Response.json(
        { error: "Your CV must be 4 MB or smaller.", code: "FILE_TOO_LARGE" },
        { status: 413 },
      );
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json(
        {
          error: "Choose a CV file and try uploading again.",
          code: "INVALID_UPLOAD",
        },
        { status: 400 },
      );
    }
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json(
        { error: "Choose a PDF, DOCX, or TXT CV first.", code: "MISSING_FILE" },
        { status: 400 },
      );
    const text = await extractCv(file);
    if (!process.env.MONGODB_URI)
      return Response.json(
        {
          text,
          persisted: false,
          storage: "missing",
          warning:
            "CV read into the form, but not saved. Set MONGODB_URI in your Vercel project’s environment variables and redeploy to enable saving. Keep this page open until you save your profile.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    try {
      await (
        await db()
      )
        .collection("profile")
        .updateOne(
          { key: "owner" },
          { $set: { "profile.cvText": text } },
          { upsert: true },
        );
    } catch (error) {
      console.error(
        "CV storage failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
      return Response.json(
        {
          text,
          persisted: false,
          storage: "unreachable",
          warning:
            "CV read into the form, but storage could not be reached. Check your MongoDB connection and Atlas access settings, then save your profile. Keep this page open so you don’t lose the imported text.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { text, persisted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CvInputError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    console.error(
      "CV upload failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      {
        error:
          "The CV upload could not be processed. Please retry with PDF, DOCX, or TXT.",
      },
      { status: 500 },
    );
  }
}
