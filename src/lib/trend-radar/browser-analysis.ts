/** Optional analysis of an authorized file on the owner's device; no network requests. */
export type AudioSignal = {
  signal: "present" | "not-detected" | "unknown";
  rmsDb: number | null;
  speech: "unknown";
  laughter: "unknown";
  reason: string;
};
export type LocalVideoAnalysis = {
  seconds: number;
  sampledFrames: number;
  sceneChanges: number[];
  visiblePeople: "unknown";
  audio: AudioSignal;
  notes: string[];
};
export type RoleMoment = {
  characterId: string;
  start: number;
  end: number;
  position: string;
  action: string;
};
export function pcmSignal(
  channels: Float32Array[],
  sampleRate: number,
): AudioSignal {
  let sum = 0,
    count = 0;
  for (const channel of channels)
    for (const value of channel) {
      if (Number.isFinite(value)) {
        sum += value * value;
        count++;
      }
    }
  if (!count || sampleRate <= 0)
    return {
      signal: "unknown",
      rmsDb: null,
      speech: "unknown",
      laughter: "unknown",
      reason: "No decodable audio samples.",
    };
  const db = sum ? 10 * Math.log10(sum / count) : -120;
  return {
    signal: db > -60 ? "present" : "not-detected",
    rmsDb: Math.round(Math.max(-120, db) * 10) / 10,
    speech: "unknown",
    laughter: "unknown",
    reason:
      "Decoded audio energy, measured as overall RMS dBFS. This does not identify speech, laughter or music and is not a listening judgment.",
  };
}
export function frameDifference(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
): number {
  if (previous.length !== current.length || !current.length) return 0;
  let delta = 0;
  for (let i = 0; i < current.length; i += 4)
    for (let channel = 0; channel < 3; channel++)
      delta += Math.abs(current[i + channel] - previous[i + channel]);
  return delta / ((current.length / 4) * 3 * 255);
}
export function validateRoleTimeline(
  value: unknown,
  ids: string[],
  maxSeconds = 15,
): RoleMoment[] {
  if (!Array.isArray(value) || value.length > 80)
    throw new Error("Use up to 80 timestamped role entries.");
  return value.map((row) => {
    if (!row || typeof row !== "object") throw new Error("Invalid role entry.");
    const r = row as Record<string, unknown>;
    if (
      typeof r.characterId !== "string" ||
      !ids.includes(r.characterId) ||
      typeof r.start !== "number" ||
      typeof r.end !== "number" ||
      !Number.isFinite(r.start) ||
      !Number.isFinite(r.end) ||
      r.start < 0 ||
      r.end > maxSeconds ||
      r.start >= r.end ||
      typeof r.position !== "string" ||
      r.position.length > 100 ||
      typeof r.action !== "string" ||
      r.action.length > 300
    )
      throw new Error(
        "Map each 0–" +
          maxSeconds +
          "s interval to an existing stable performer ID, with start before end.",
      );
    return {
      characterId: r.characterId,
      start: r.start,
      end: r.end,
      position: r.position.trim(),
      action: r.action.trim(),
    };
  });
}
export async function analyzeAuthorizedVideo(
  file: File,
): Promise<LocalVideoAnalysis> {
  if (
    file.size > 80 * 1024 * 1024 ||
    !/^video\/(mp4|webm|quicktime)$/.test(file.type)
  )
    throw new Error("Choose a supported authorized video up to 80 MB.");
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);
  const notes: string[] = [];
  const event = (name: string) =>
    new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener(name, ok);
        video.removeEventListener("error", bad);
      };
      const ok = () => {
        done();
        resolve();
      };
      const bad = () => {
        done();
        reject(new Error("The browser could not decode this authorized file."));
      };
      const timer = window.setTimeout(bad, 8000);
      video.addEventListener(name, ok, { once: true });
      video.addEventListener("error", bad, { once: true });
    });
  try {
    const loaded = event("loadeddata");
    video.src = url;
    await loaded;
    if (
      !Number.isFinite(video.duration) ||
      video.duration < 1 ||
      video.duration > 15
    )
      throw new Error("Analysis is limited to actual 1–15 second videos.");
    let audio: AudioSignal = {
      signal: "unknown",
      rmsDb: null,
      speech: "unknown",
      laughter: "unknown",
      reason: "Audio decoding unavailable in this browser or container.",
    };
    if (typeof AudioContext !== "undefined") {
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(await file.arrayBuffer());
        if (decoded.duration <= 15.1)
          audio = pcmSignal(
            Array.from({ length: decoded.numberOfChannels }, (_, i) =>
              decoded.getChannelData(i),
            ),
            decoded.sampleRate,
          );
      } catch {
        notes.push(
          "Browser audio decoder could not inspect the audio; track presence and audible dialogue are separate checks.",
        );
      } finally {
        await context.close();
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let previous: Uint8ClampedArray | undefined;
    let sampledFrames = 0;
    const sceneChanges: number[] = [];
    const began = Date.now();
    if (ctx)
      for (let t = 0; t < video.duration && sampledFrames < 20; t += 0.75) {
        if (Date.now() - began > 18000) {
          notes.push("Frame sampling stopped at the local time budget.");
          break;
        }
        if (t > 0) {
          const sought = event("seeked");
          video.currentTime = t;
          await sought;
        }
        ctx.drawImage(video, 0, 0, 32, 18);
        const frame = ctx.getImageData(0, 0, 32, 18).data;
        if (previous && frameDifference(previous, frame) > 0.28)
          sceneChanges.push(Math.round(t * 100) / 100);
        previous = frame;
        sampledFrames++;
      }
    notes.push(
      "Scene changes are sampled pixel-difference hints, not verified scene boundaries. Motion can trigger them; cuts between samples may be missed.",
      "Automatic person identity and speech/laughter models are unavailable in this local inspector. Visible people and speech remain UNKNOWN. Assign stable roles manually.",
    );
    return {
      seconds: video.duration,
      sampledFrames,
      sceneChanges,
      visiblePeople: "unknown",
      audio,
      notes,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
