import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publisherSocialLinks,
  researchSources,
} from "../src/lib/source-directory";
test("publisher links exclude sharing buttons, lookalike domains and private WhatsApp contact routes", () => {
  const links = publisherSocialLinks(
    `<a href="https://twitter.com/publisher_test">X</a><a href="https://x.com/intent/tweet?text=hello">Share</a><a href="https://facebook.com/sharer.php?u=test">Share</a><a href="https://facebook.com/publisher-test">Page</a><a href="https://x.com.evil.test/account">Fake</a><a href="https://wa.me/123">Contact</a><a href="https://chat.whatsapp.com/private">Private</a><a href="https://whatsapp.com/channel/test-public-id">Channel</a>`,
    "https://remotive.com",
  );
  assert.deepEqual(links, [
    { platform: "X", url: "https://x.com/publisher_test" },
    { platform: "Facebook", url: "https://facebook.com/publisher-test" },
    {
      platform: "WhatsApp",
      url: "https://whatsapp.com/channel/test-public-id",
    },
  ]);
});
test("research records failures without fabricating social links", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network unavailable");
  };
  try {
    const result = await researchSources();
    assert.equal(result.sources.length, 9);
    assert.ok(result.sources.every((s) => s.platform === "Reddit" ? s.status === "Not checked" : s.status === "Check failed"));
    assert.ok(
      result.sources.every(
        (s) => !["X", "Facebook", "WhatsApp"].includes(s.platform),
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("publisher provenance is retained and external redirects are rejected", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("reddit.com"))
      return Response.json({
        kind: "t5",
        data: {
          display_name: new URL(url).pathname.split("/")[2],
          subreddit_type: "public",
        },
      });
    if (url.includes("remotive.com"))
      return new Response("", {
        status: 302,
        headers: { location: "https://127.0.0.1/private" },
      });
    return new Response(
      '<a href="https://whatsapp.com/channel/test-public-id">Public channel</a>',
      { headers: { "content-type": "text/html" } },
    );
  };
  try {
    const result = await researchSources();
    const social = result.sources.filter((s) => s.platform === "WhatsApp");
    assert.equal(social.length, 4);
    assert.ok(
      social.every(
        (s) =>
          s.status === "Publisher-linked" &&
          [
            "weworkremotely.com",
            "remoteok.com",
            "himalayas.app",
            "workingnomads.com",
          ].some(
            (host) =>
              new URL(s.provenanceUrl).hostname.replace(/^www\./, "") === host,
          ),
      ),
    );
    assert.equal(
      result.sources.find((s) => s.id === "remotive")?.status,
      "Check failed",
    );
    assert.equal(
      result.sources.filter((s) => s.platform === "Reddit" && s.status === "Not checked").length,
      4,
    );
  } finally {
    globalThis.fetch = original;
  }
});
