import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSocialLead } from "../src/lib/social";
const text =
  "A shared frontend job. Verify the employer and location before applying.";
test("social links are classified and tracking removed without fetching the post", () => {
  const a = parseSocialLead({
    url: "https://twitter.com/team/status/123?s=20#tracking",
    text,
  });
  const b = parseSocialLead({ url: "https://x.com/team/status/123", text });
  assert.equal(a.platform, "X");
  assert.equal(a.url, "https://x.com/team/status/123");
  assert.equal(a.id, b.id);
  for (const [url, platform] of [
    ["https://www.facebook.com/groups/jobs/posts/123", "Facebook"],
    ["https://www.reddit.com/r/jobs/comments/123", "Reddit"],
    ["https://whatsapp.com/channel/example", "WhatsApp"],
  ])
    assert.equal(parseSocialLead({ url, text }).platform, platform);
});
test("untrusted destinations, credential URLs, and incomplete posts are rejected", () => {
  for (const url of [
    "http://x.com/team/status/123",
    "https://x.com.evil.test/post",
    "https://user:password@x.com/team/status/123",
    "https://127.0.0.1/post",
    "https://x.com/",
    "https://x.com:8443/team/status/123",
  ])
    assert.throws(() => parseSocialLead({ url, text }));
  assert.throws(() =>
    parseSocialLead({ url: "https://x.com/team/status/123", text: "Hi" }),
  );
});

test("channel posts use their text for identity and Facebook retains post identifiers", () => {
  const a = parseSocialLead({
    url: "https://whatsapp.com/channel/example",
    text,
  });
  const b = parseSocialLead({
    url: "https://whatsapp.com/channel/example",
    text: text + " A different opening.",
  });
  assert.notEqual(a.id, b.id);
  const fb = parseSocialLead({
    url: "https://www.facebook.com/permalink.php?story_fbid=123&id=456&utm_source=test",
    text,
  });
  assert.equal(
    fb.url,
    "https://facebook.com/permalink.php?id=456&story_fbid=123",
  );
});
