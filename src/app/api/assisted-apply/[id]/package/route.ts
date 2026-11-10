import {
  assistedHeaders,
  assistedError,
  loadAttempt,
} from "@/lib/assisted-store";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await loadAttempt((await params).id);
    return Response.json(
      { package: a.package, sha256: a.packageHash },
      { headers: assistedHeaders },
    );
  } catch (e) {
    return assistedError(e);
  }
}
