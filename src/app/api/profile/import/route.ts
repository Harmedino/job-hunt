import { db, errorResponse } from "@/lib/db";
import { MAX_CV_TEXT } from "@/lib/cv-limits";
import { importResume } from "@/lib/import-resume";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || (body.text !== undefined && (typeof body.text !== "string" || body.text.length > MAX_CV_TEXT)))
      return Response.json({ error: "Provide valid CV text (up to 50,000 characters)." }, { status: 400 });
    const text = body.text ?? (await (await db()).collection("profile").findOne({ key: "owner" }))?.profile?.cvText;
    if (!text?.trim()) return Response.json({ error: "Upload your CV first, or paste it into Existing CV text." }, { status: 400 });
    return Response.json(await importResume(text), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
