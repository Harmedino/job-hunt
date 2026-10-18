import { createHash } from "node:crypto";
export type ResearchSource = {
  id: string;
  name: string;
  platform: string;
  url: string;
  provenanceUrl: string;
  publisherId?: string;
  status:
    | "Not checked"
    | "Publisher-linked"
    | "Website accessible"
    | "Community exists"
    | "Check failed";
  note: string;
  checkedAt?: string;
};
export const publishers = [
  { id: "remotive", name: "Remotive", url: "https://remotive.com" },
  {
    id: "weworkremotely",
    name: "We Work Remotely",
    url: "https://weworkremotely.com",
  },
  { id: "remoteok", name: "Remote OK", url: "https://remoteok.com" },
  { id: "himalayas", name: "Himalayas", url: "https://himalayas.app" },
  {
    id: "workingnomads",
    name: "Working Nomads",
    url: "https://www.workingnomads.com",
  },
];
const communities = [
  { slug: "remotejobs", name: "r/remotejobs" },
  { slug: "remotejs", name: "r/remotejs" },
  { slug: "cybersecurity", name: "r/cybersecurity · hiring discussions" },
];
export const candidateSources: ResearchSource[] = [
  ...publishers.map((p) => ({
    id: p.id,
    name: p.name,
    platform: "Publisher website",
    url: p.url,
    provenanceUrl: p.url,
    status: "Not checked" as const,
    note: "Worldwide remote-job publisher to investigate. Individual postings can still restrict applicant location. Social accounts will be discovered from links on this website; no account has been assumed.",
  })),
  ...communities.map((c) => ({
    id: c.slug,
    name: c.name,
    platform: "Reddit",
    url: `https://www.reddit.com/r/${c.slug}/`,
    provenanceUrl: `https://www.reddit.com/r/${c.slug}/about.json`,
    status: "Not checked" as const,
    note: "Candidate community. Individual posts are unverified; check the employer, fully remote arrangement, and applicant-location eligibility. Cybersecurity is a discussion forum, not a jobs-only feed.",
  })),
];
export function publisherSocialLinks(
  html: string,
  base: string,
): { platform: string; url: string }[] {
  const results = new Map<string, { platform: string; url: string }>();
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    let url: URL;
    try {
      url = new URL(match[1].replace(/&amp;/g, "&"), base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      continue;
    let host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "twitter.com") host = "x.com";
    if (host === "m.facebook.com") host = "facebook.com";
    const platform = (
      {
        "x.com": "X",
        "facebook.com": "Facebook",
        "whatsapp.com": "WhatsApp",
      } as Record<string, string>
    )[host];
    if (!platform) continue;
    const path = url.pathname.replace(/\/+$/, "");
    if (
      !path ||
      /^\/(?:intent|share|sharer|sharer\.php|dialog|plugins|search|home|hashtag|i|login|recover|policies|l\.php)(?:\/|$|\?)/i.test(
        path,
      )
    )
      continue;
    if (platform === "X" && !/^\/[A-Za-z0-9_]{1,15}$/.test(path)) continue;
    if (platform === "WhatsApp" && !/^\/channel\/[A-Za-z0-9_-]+$/.test(path))
      continue;
    url.hostname = host;
    url.pathname = path;
    url.hash = "";
    url.search = "";
    results.set(url.href, { platform, url: url.href });
  }
  return [...results.values()].slice(0, 12);
}
async function publisherHtml(initial: string) {
  let target = new URL(initial);
  const root = target.hostname.replace(/^www\./, "");
  for (let hop = 0; hop < 3; hop++) {
    const r = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "PersonalJobFinder/1.0 (public source directory)",
      },
      cache: "no-store",
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = new URL(r.headers.get("location") || "", target);
      if (
        next.protocol !== "https:" ||
        next.username ||
        next.password ||
        next.port ||
        ![root, `www.${root}`].includes(next.hostname)
      )
        throw new Error("Publisher redirects outside its known domain.");
      target = next;
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!r.headers.get("content-type")?.toLowerCase().includes("text/html"))
      throw new Error("Publisher did not return an HTML page.");
    const reader = r.body?.getReader();
    if (!reader) throw new Error("Empty response");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 2_000_000)
          throw new Error("Publisher page exceeds the research limit.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return { html: Buffer.concat(chunks).toString("utf8"), url: target.href };
  }
  throw new Error("Publisher redirect limit reached.");
}
export async function researchSources() {
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(
    candidateSources.map(async (candidate): Promise<ResearchSource[]> => {
      try {
        if (candidate.platform === "Reddit") {
          const r = await fetch(candidate.provenanceUrl, {
            signal: AbortSignal.timeout(12000),
            headers: {
              "User-Agent": "PersonalJobFinder/1.0 (public community metadata)",
            },
            cache: "no-store",
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const body = await r.json();
          if (
            body.kind !== "t5" ||
            String(body.data?.display_name).toLowerCase() !== candidate.id ||
            body.data?.subreddit_type !== "public"
          )
            throw new Error("Public community could not be confirmed.");
          return [
            {
              ...candidate,
              status: "Community exists",
              checkedAt,
              note: "Public community metadata confirmed. This does not verify recent hiring activity or individual jobs. Automated post collection is not connected; permitted API access is required.",
            },
          ];
        }
        const page = await publisherHtml(candidate.url);
        const links = publisherSocialLinks(page.html, page.url);
        const source = {
          ...candidate,
          status: "Website accessible" as const,
          checkedAt,
          note: links.length
            ? "Website accessible; the social links below were found on its own page. Individual jobs still require employer verification."
            : "Website accessible, but no supported public social account or WhatsApp channel link was found on its homepage.",
        };
        return [
          source,
          ...links.map((link) => ({
            id: createHash("sha256")
              .update(candidate.id + "|" + link.url)
              .digest("hex")
              .slice(0, 24),
            name: `${candidate.name} · ${link.platform}`,
            platform: link.platform,
            url: link.url,
            provenanceUrl: page.url,
            publisherId: candidate.id,
            status: "Publisher-linked" as const,
            checkedAt,
            note: "This exact account/channel URL was linked by the publisher website. Social page accessibility, current hiring activity, and individual jobs have not been verified. Automated monitoring is not connected.",
          })),
        ];
      } catch (error) {
        return [
          {
            ...candidate,
            status: "Check failed",
            checkedAt,
            note: `Could not confirm this source: ${error instanceof Error ? error.message : "request failed"}. No social account was guessed or enabled.`,
          },
        ];
      }
    }),
  );
  return { sources: results.flat(), checkedAt };
}
