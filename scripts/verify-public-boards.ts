import { writeFile } from "node:fs/promises";
import { readPublicBoard } from "../src/lib/public-board-feeds";
import { registryBoards } from "../src/lib/public-board-registry";
import { relevant, eligibility, fullyRemote } from "../src/lib/matching";
async function main() {
  const boards = await registryBoards();
  let next = 0;
  const checks: unknown[] = [];
  const examples: unknown[] = [];
  const verifiedCompanies = new Set<string>();
  let verified = 0,
    fetched = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < boards.length) {
        const board = boards[next++];
        try {
          const result = await readPublicBoard(
            board,
            AbortSignal.timeout(30000),
            false,
          );
          checks.push(result.check);
          verified++;
          verifiedCompanies.add(board.company.trim().toLowerCase());
          fetched += result.jobs.length;
          for (const j of result.jobs.filter(
            (j) =>
              j.remote &&
              relevant(j.title, j.description) &&
              fullyRemote(j.title, j.location, j.description),
          )) {
            const location = eligibility(j.location, j.description);
            if (location)
              examples.push({
                ...j,
                ...location,
                lastVerifiedAt: result.check.checkedAt,
              });
          }
        } catch (e) {
          checks.push({
            board,
            status: "error",
            checkedAt: new Date().toISOString(),
            error: e instanceof Error ? e.message : "Request failed",
          });
        }
      }
    }),
  );
  const report = {
    checkedAt: new Date().toISOString(),
    candidates: boards.length,
    verified,
    verifiedCompanies: verifiedCompanies.size,
    fetched,
    checks,
    examples,
  };
  const output = process.argv[2] || "/tmp/public-board-verification.json";
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      candidates: boards.length,
      verified,
      verifiedCompanies: verifiedCompanies.size,
      fetched,
      relevantExamples: examples.length,
      report: output,
    }),
  );
  if (verifiedCompanies.size < 100) process.exitCode = 1;
}
void main();
