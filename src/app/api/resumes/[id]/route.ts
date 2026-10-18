import { loadResume, privateHeaders, resumeError } from "@/lib/resume-store";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(await loadResume((await params).id), {
      headers: privateHeaders,
    });
  } catch (error) {
    return resumeError(error);
  }
}
