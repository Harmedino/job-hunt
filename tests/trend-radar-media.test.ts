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
  assert.equal(
    inspectMp4Tracks(new Uint8Array(20).buffer).audioTrack,
    "unknown",
  );
});
test("literal headline-name mentions are only candidate phrases, not inferred identities", () => {
  assert.deepEqual(
    headlineNameMentions(
      "Elon Musk responds to Donald Trump after technology deal",
    ),
    ["Elon Musk", "Donald Trump"],
  );
  assert.deepEqual(
    headlineNameMentions("Manchester United beat Real Madrid"),
    [],
  );
});

test("audio analysis measures actual samples without claiming speech or laughter", async () => {
  const { pcmSignal, frameDifference, validateRoleTimeline } = await import(
    "../src/lib/trend-radar/browser-analysis"
  );
  assert.equal(
    pcmSignal([new Float32Array(100)], 48000).signal,
    "not-detected",
  );
  const audible = pcmSignal([new Float32Array(100).fill(0.1)], 48000);
  assert.equal(audible.signal, "present");
  assert.equal(audible.speech, "unknown");
  assert.equal(audible.laughter, "unknown");
  assert.equal(
    frameDifference(
      new Uint8ClampedArray([0, 0, 0, 255]),
      new Uint8ClampedArray([255, 255, 255, 255]),
    ),
    1,
  );
  const crossed = [
    {
      characterId: "performer-A",
      start: 0,
      end: 4,
      position: "left",
      action: "starts dance",
    },
    {
      characterId: "performer-A",
      start: 4,
      end: 10,
      position: "right",
      action: "crosses behind performer B",
    },
  ];
  assert.deepEqual(validateRoleTimeline(crossed, ["performer-A"]), crossed);
  assert.throws(
    () => validateRoleTimeline(crossed, ["performer-B"]),
    /stable performer/,
  );
  assert.throws(
    () => validateRoleTimeline([{ ...crossed[0], end: 16 }], ["performer-A"]),
    /0–15/,
  );
});
