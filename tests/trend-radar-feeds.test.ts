import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRadarFeed,
  reportedHeavyDefeats,
} from "../src/lib/trend-radar/feed-parser";
const now = Date.parse("2026-11-11T12:00:00Z");
const feed = {
  name: "Fixture public Atom",
  category: "Football" as const,
  url: "https://www.reddit.com/r/soccer/.rss",
  community: true,
};
test("public Atom discussions retain source evidence without claiming established facts", () => {
  const xml =
    '<feed><entry><title>Example team 0-4 Other team</title><link rel="alternate" href="https://www.reddit.com/r/soccer/comments/test"/><published>2026-11-11T10:00:00Z</published><content type="html">Community opinion only</content></entry></feed>';
  const rows = parseRadarFeed(xml, feed, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sources[0].kind, "community");
  assert.match(rows[0].why, /Unverified community/);
  assert.equal(reportedHeavyDefeats(rows).length, 0);
  assert.equal(
    reportedHeavyDefeats([
      { ...rows[0], sources: [{ ...rows[0].sources[0], kind: "report" }] },
    ]).length,
    1,
  );
});
test("unsafe, stale, undated and future source items are not promoted", () => {
  for (const [link, date] of [
    ["javascript:alert(1)", "2026-11-11T10:00:00Z"],
    ["https://user:pass@example.com", "2026-11-11T10:00:00Z"],
    ["https://example.com", "bad"],
    ["https://example.com", "2026-11-01T10:00:00Z"],
    ["https://example.com", "2026-11-12T10:00:00Z"],
  ])
    assert.equal(
      parseRadarFeed(
        `<rss><channel><item><title>Test</title><link>${link}</link><pubDate>${date}</pubDate></item></channel></rss>`,
        feed,
        now,
      ).length,
      0,
    );
  assert.throws(
    () => parseRadarFeed("<!DOCTYPE feed><feed/>", feed, now),
    /unsupported/,
  );
});
