import snapshot from "@/data/public-board-verification.json";
import { registryBoards } from "@/lib/public-board-registry";
import { db } from "@/lib/db";
export async function GET() {
  const candidates = await registryBoards();
  let checks: unknown[] = [];
  let persisted = false;
  if (process.env.MONGODB_URI) {
    try {
      checks = await (
        await db()
      )
        .collection("public_board_registry")
        .find({}, { projection: { _id: 0 } })
        .limit(1000)
        .toArray();
      persisted = true;
    } catch {
      /* A registry list is useful even if storage is temporarily unavailable. */
    }
  }
  return Response.json(
    {
      candidates,
      checks: [...new Map([...snapshot.checks, ...checks].map(value=>{const c=value as {board:{platform:string;region?:string;token:string}};return [`${c.board.platform}:${c.board.region || 'global'}:${c.board.token.toLowerCase()}`,value] as const;})).values()],
      snapshotAt: snapshot.checkedAt,
      persisted,
      note: "Candidate links are discovered from cited public directories. Verification requires a successful official public API response. Checks may be partial or stale; they do not guarantee applicant eligibility.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
