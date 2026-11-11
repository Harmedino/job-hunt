/** Fit a provider's native portrait to 9:16 without cropping the head or footwear. */
export async function portraitImage(
  base64: string,
  mime: string,
): Promise<{
  base64: string;
  mime: string;
  sha256: string;
  framingNote: string;
}> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  let blob = new Blob([bytes], { type: mime });
  let framingNote =
    "Provider output is already 9:16. Full-body and identity suitability still require your visual review.";
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width > 16384 ||
      bitmap.height > 16384
    )
      throw new Error("Provider image dimensions are unsupported.");
    if (Math.abs(bitmap.width / bitmap.height - 9 / 16) > 0.005) {
      const canvas = document.createElement("canvas");
      canvas.width = 864;
      canvas.height = 1536;
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw new Error("Image framing is unavailable in this browser.");
      ctx.fillStyle = "#eeeeee";
      ctx.fillRect(0, 0, 864, 1536);
      const scale = Math.min(864 / bitmap.width, 1536 / bitmap.height);
      const w = bitmap.width * scale,
        h = bitmap.height * scale;
      ctx.drawImage(bitmap, (864 - w) / 2, (1536 - h) / 2, w, h);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Could not frame the portrait.")),
          "image/png",
        ),
      );
      framingNote =
        "Fitted to 9:16 with plain margins, preserving the complete provider image without cropping. Check that the person and footwear are visible.";
    }
  } finally {
    bitmap.close();
  }
  const buffer = await blob.arrayBuffer();
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const encoded = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Image could not be read."));
    r.readAsDataURL(blob);
  });
  return { base64: encoded, mime: blob.type, sha256, framingNote };
}
