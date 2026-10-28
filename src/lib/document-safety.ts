import { inflateRawSync } from "node:zlib";
/** Validate the actual DOCX container and bounded expanded sizes before a document parser sees it. */
export function validateDocxContainer(bytes: Buffer) {
  let end = -1;
  for (
    let at = bytes.length - 22;
    at >= Math.max(0, bytes.length - 65557);
    at--
  )
    if (bytes.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  if (end < 0) throw new Error("The DOCX ZIP directory is missing.");
  const count = bytes.readUInt16LE(end + 10),
    size = bytes.readUInt32LE(end + 12),
    offset = bytes.readUInt32LE(end + 16);
  if (
    !count ||
    count > 2000 ||
    offset + size > end ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    throw new Error("The DOCX container is unsupported or too large.");
  let at = offset,
    total = 0;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50)
      throw new Error("Invalid DOCX ZIP entry.");
    const flags = bytes.readUInt16LE(at + 8),
      method = bytes.readUInt16LE(at + 10),
      compressed = bytes.readUInt32LE(at + 20),
      expanded = bytes.readUInt32LE(at + 24),
      length = bytes.readUInt16LE(at + 28),
      extra = bytes.readUInt16LE(at + 30),
      comment = bytes.readUInt16LE(at + 32),
      local = bytes.readUInt32LE(at + 42),
      name = bytes.subarray(at + 46, at + 46 + length).toString("utf8");
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      expanded > 10 * 1024 * 1024 ||
      name.includes("..") ||
      name.startsWith("/") ||
      /vbaProject|activeX\/|embeddings\//i.test(name) ||
      names.has(name)
    )
      throw new Error(
        "Encrypted, executable, embedded or oversized DOCX content is not supported.",
      );
    names.add(name);
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50)
      throw new Error("Invalid DOCX local entry.");
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    if (start + compressed > offset)
      throw new Error("Invalid DOCX compressed data.");
    const input = bytes.subarray(start, start + compressed),
      data =
        method === 0
          ? input
          : inflateRawSync(input, {
              maxOutputLength: Math.min(
                10 * 1024 * 1024,
                20 * 1024 * 1024 - total,
              ),
            });
    if (data.length !== expanded || (total += data.length) > 20 * 1024 * 1024)
      throw new Error("The DOCX expanded content exceeds safe limits.");
    if (/\.xml$|\.rels$/i.test(name)) {
      const xml = data.toString("utf8");
      if (/<!DOCTYPE|<!ENTITY|macroEnabled|<w:altChunk\b/i.test(xml))
        throw new Error(
          "Active or external document content is not supported.",
        );
      for (const rel of xml.match(/<Relationship\b[^>]*>/gi) || [])
        if (
          /TargetMode\s*=\s*["']External/i.test(rel) &&
          !/Type\s*=\s*["'][^"']*\/hyperlink["']/i.test(rel)
        )
          throw new Error(
            "External document templates and embedded resources are not supported.",
          );
    }
    at += 46 + length + extra + comment;
    if (at > offset + size) throw new Error("Invalid DOCX directory size.");
  }
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml"))
    throw new Error("The file is not a Word DOCX document.");
}
