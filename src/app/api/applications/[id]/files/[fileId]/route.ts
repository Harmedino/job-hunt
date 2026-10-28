import { fileResponse } from "@/lib/application-files";
import { errorResponse } from "@/lib/db";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const { id, fileId } = await params;
    return fileResponse(id, fileId);
  } catch (e) {
    return errorResponse(e);
  }
}
