import test from "node:test";
import assert from "node:assert/strict";
test("paginated search checks later pages, rejects exact duration and retains partial results on failure", async () => {
  const { collectShortClips } = await import(
    "../src/lib/trend-radar/clip-search"
  );
  const calls: { resource: string; params: Record<string, string> }[] = [];
  const item = (id: string, duration: string) => ({
    id,
    snippet: { title: id, publishedAt: "2026-11-11T12:00:00Z" },
    contentDetails: { duration },
  });
  const provider = async (resource: string, params: Record<string, string>) => {
    calls.push({ resource, params });
    if (resource === "search")
      return params.pageToken
        ? { items: [{ id: { videoId: "SHORT000002" } }] }
        : {
            items: [
              { id: { videoId: "TOOLONG0001" } },
              { id: { videoId: "SHORT000001" } },
            ],
            nextPageToken: "page2",
          };
    return params.id.includes("TOOLONG")
      ? { items: [item("TOOLONG0001", "PT16S"), item("SHORT000001", "PT15S")] }
      : { items: [item("SHORT000002", "PT9S")] };
  };
  const report = await collectShortClips(
    "dancing comedy",
    15,
    3,
    "date",
    provider,
  );
  assert.equal(report.pages, 2);
  assert.equal(report.checked, 3);
  assert.equal(report.rejectedByDuration, 1);
  assert.equal(report.clips.length, 2);
  assert.equal(calls[2].params.pageToken, "page2");
  assert.equal(calls[0].params.order, "date");
  let searches = 0;
  const partial = await collectShortClips(
    "dancing comedy",
    15,
    3,
    "relevance",
    async (resource, params) => {
      if (resource === "search" && ++searches === 2)
        throw new Error("YouTube quota exhausted");
      return provider(resource, params);
    },
  );
  assert.equal(partial.clips.length, 1);
  assert.match(partial.error || "", /quota/);
});
