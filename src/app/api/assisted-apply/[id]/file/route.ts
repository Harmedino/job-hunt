import {
  assistedHeaders,
  assistedError,
  AssistedError,
  digest,
  loadAttempt,
} from "@/lib/assisted-store";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await loadAttempt((await params).id),
      kind = new URL(request.url).searchParams.get("kind") || "cv",
      file = a.package.files.find((f) => f.kind === kind);
    if (!file) throw new AssistedError("Approved document not found.", 404);
    const bytes = Buffer.from(file.base64, "base64");
    if (digest(bytes) !== file.sha256)
      throw new AssistedError("File integrity check failed.", 409);
    return new Response(bytes, {
      headers: {
        ...assistedHeaders,
        "Content-Type": file.mime,
        "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
      },
    });
  } catch (e) {
    return assistedError(e);
  }
}
