import { ensureModuleIndexes } from "../src/lib/modules/store";
import { closeDb } from "../src/lib/db";
async function main() {
  try {
    await ensureModuleIndexes();
    console.log(
      "Workspace indexes ready. Existing collections and records preserved.",
    );
  } finally {
    await closeDb();
  }
}
void main().catch(() => {
  console.error("Workspace migration failed. Check MongoDB configuration.");
  process.exitCode = 1;
});
