import { createHash } from "node:crypto";
export type SocialLead = {
  id: string;
  platform: string;
  url: string;
  text: string;
  createdAt: string;
  status: "Needs verification" | "Archived";
};
export function parseSocialLead(
  body: unknown,
): Omit<SocialLead, "createdAt" | "status"> {
  if (!body || typeof body !== "object")
    throw new Error("Enter a social post link and the job text.");
  const { url, text } = body as Record<string, unknown>;
  if (
    typeof url !== "string" ||
    url.length > 2000 ||
    typeof text !== "string" ||
    text.trim().length < 30 ||
    text.length > 20000
  )
    throw new Error(
      "Add a post link and between 30 and 20,000 characters of job text.",
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid HTTPS post link.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    throw new Error(
      "Use an HTTPS post link without credentials or a custom port.",
    );
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const platform = (
    {
      "x.com": "X",
      "twitter.com": "X",
      "facebook.com": "Facebook",
      "m.facebook.com": "Facebook",
      "fb.com": "Facebook",
      "reddit.com": "Reddit",
      "old.reddit.com": "Reddit",
      "redd.it": "Reddit",
      "whatsapp.com": "WhatsApp",
      "chat.whatsapp.com": "WhatsApp",
    } as Record<string, string>
  )[host];
  if (!platform)
    throw new Error("Supported sources: X, Facebook, Reddit, and WhatsApp.");
  if (parsed.pathname === "/" || !parsed.pathname)
    throw new Error("Use a link to the specific post, channel, or shared job.");
  // Retain the post identity, without click tracking or fragments. Never fetch private/social URLs server-side.
  const identityParams =
    platform === "Facebook"
      ? [...parsed.searchParams].filter(([key]) =>
          ["story_fbid", "fbid", "id", "v"].includes(key),
        )
      : [];
  parsed.search = "";
  for (const [key, value] of identityParams.sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    parsed.searchParams.set(key, value);
  parsed.hash = "";
  parsed.hostname = host === "twitter.com" ? "x.com" : host;
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  const canonical = parsed.href;
  const channelOnly =
    platform === "WhatsApp" &&
    parsed.pathname.split("/").filter(Boolean).length < 3;
  const identity = channelOnly
    ? canonical + "\n" + text.trim().replace(/\s+/g, " ")
    : canonical;
  return {
    id: createHash("sha256").update(identity).digest("hex").slice(0, 24),
    platform,
    url: canonical,
    text: text.trim(),
  };
}
