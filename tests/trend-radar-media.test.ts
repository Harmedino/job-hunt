import test from "node:test";
import assert from "node:assert/strict";
import { inspectMp4Tracks } from "../src/lib/trend-radar/media-inspect";
import { headlineNameMentions } from "../src/lib/trend-radar/core";
function box(name: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(name, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}
function fixture(handler: "soun" | "vide") {
  const hdlr = Buffer.alloc(12);
  hdlr.write(handler, 8, 4, "ascii");
  const file = Buffer.concat([
    box("ftyp", Buffer.from("isom")),
    box("moov", box("trak", box("mdia", box("hdlr", hdlr)))),
  ]);
  return Uint8Array.from(file).buffer;
}
test("conservative MP4 inspector detects actual container audio stream metadata", () => {
  assert.equal(inspectMp4Tracks(fixture("soun")).audioTrack, "present");
  assert.equal(inspectMp4Tracks(fixture("vide")).audioTrack, "absent");
  assert.equal(inspectMp4Tracks(new Uint8Array(20).buffer).audioTrack, "unknown");
});
test("literal headline-name mentions are only candidate phrases, not inferred identities", () => {
  assert.deepEqual(headlineNameMentions("Elon Musk responds to Donald Trump after technology deal"), ["Elon Musk", "Donald Trump"]);
  assert.deepEqual(headlineNameMentions("Manchester United beat Real Madrid"), []);
});
