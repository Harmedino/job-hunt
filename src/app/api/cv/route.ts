import { db, errorResponse } from "@/lib/db";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
      return Response.json({ error: "Upload is too large." }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
      return Response.json(
        { error: "Upload a PDF or text CV smaller than 5 MB." },
        { status: 400 },
      );
    let text = "";
    if (file.name.toLowerCase().endsWith(".txt")) text = await file.text();
    else if (file.name.toLowerCase().endsWith(".pdf")) {
      const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
      text = (await pdf(Buffer.from(await file.arrayBuffer()))).text;
    } else
      return Response.json(
        { error: "Supported formats: PDF and plain text." },
        { status: 400 },
      );
    if (!text.trim())
      return Response.json(
        {
          error:
            "No readable text found. Scanned PDFs need OCR; upload a text-based PDF or .txt file.",
        },
        { status: 400 },
      );
    if (text.length > 50000)
      return Response.json(
        { error: "CV is too long. Limit extracted text to 50,000 characters." },
        { status: 400 },
      );
    await (
      await db()
    )
      .collection("profile")
      .updateOne(
        { key: "owner" },
        { $set: { "profile.cvText": text } },
        { upsert: true },
      );
    return Response.json({ text });
  } catch (e) {
    return errorResponse(e);
  }
}
