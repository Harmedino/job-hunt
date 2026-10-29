/** Repair common PDF/Word list glyphs without guessing breaks from ordinary prose or date dashes. */
export function normalizeResumeBullets(text: string) {
  const source = text.replace(/\r\n?/g, "\n");
  return source.replace(
    /[^\S\n]*(?:[●•▪◦‣⁃][^\S\n]*)+/g,
    (_marker, offset: number) =>
      (offset === 0 || source[offset - 1] === "\n" ? "" : "\n") + "• ",
  );
}
