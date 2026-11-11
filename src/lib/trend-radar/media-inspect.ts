/**
 * Conservative MP4 container inspection for owner-provided files.
 * Does NOT determine whether an audio track is audible, contains speech,
 * laughter or music. Unknown is not "silent".
 */
export type TrackInspection = {
  audioTrack: "present" | "absent" | "unknown";
  reason: string;
};
function boxType(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1),
    view.getUint8(offset + 2), view.getUint8(offset + 3),
  );
}
export function inspectMp4Tracks(bytes: ArrayBuffer): TrackInspection {
  const view = new DataView(bytes);
  if (view.byteLength < 32)
    return { audioTrack: "unknown", reason: "File too small to inspect." };
  let moovFound = false, handlerFound = false, audioFound = false, malformed = false;
  function walk(start: number, end: number, depth: number) {
    if (depth > 8) { malformed = true; return; }
    let offset = start;
    while (offset + 8 <= end) {
      const initial = view.getUint32(offset);
      const name = boxType(view, offset + 4);
      let header = 8;
      let size = initial;
      if (initial === 1) {
        if (offset + 16 > end) { malformed = true; return; }
        const large = view.getBigUint64(offset + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) { malformed = true; return; }
        size = Number(large);
        header = 16;
      } else if (initial === 0) size = end - offset;
      if (size < header || size > end - offset) { malformed = true; return; }
      const contentStart = offset + header;
      const boxEnd = offset + size;
      if (name === "moov") moovFound = true;
      if (name === "hdlr" && boxEnd >= contentStart + 12) {
        handlerFound = true;
        if (boxType(view, contentStart + 8) === "soun") audioFound = true;
      }
      if (["moov", "trak", "mdia"].includes(name))
        walk(contentStart, boxEnd, depth + 1);
      offset = boxEnd;
    }
    if (offset !== end) malformed = true;
  }
  walk(0, view.byteLength, 0);
  if (malformed || !moovFound || !handlerFound)
    return { audioTrack: "unknown", reason: "MP4 track metadata incomplete, changed or inaccessible." };
  return audioFound
    ? { audioTrack: "present", reason: "An MP4 audio stream entry was found. Audible speech or sound is NOT verified." }
    : { audioTrack: "absent", reason: "No MP4 audio stream entry was found in the inspected container." };
}
export async function inspectOwnedAudioTrack(file: File): Promise<TrackInspection> {
  if (file.type !== "video/mp4" || file.size > 80 * 1024 * 1024)
    return { audioTrack: "unknown", reason: "Only MP4 files up to 80 MB support this conservative track check." };
  try { return inspectMp4Tracks(await file.arrayBuffer()); }
  catch { return { audioTrack: "unknown", reason: "Audio track inspection could not be completed." }; }
}
