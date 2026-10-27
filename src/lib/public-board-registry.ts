import seeds from "../data/public-board-candidates.json";
import { plainText } from "./matching";
export const boardPlatforms = [
  "Greenhouse",
  "Lever",
  "Ashby",
  "SmartRecruiters",
] as const;
export type BoardPlatform = (typeof boardPlatforms)[number];
export type PublicBoard = {
  platform: BoardPlatform;
  token: string;
  company: string;
  region?: "global" | "eu";
  careersUrl: string;
  evidenceUrl: string;
};
export const boardVariables: Record<BoardPlatform, string> = {
  Greenhouse: "GREENHOUSE_BOARDS",
  Lever: "LEVER_BOARDS",
  Ashby: "ASHBY_BOARDS",
  SmartRecruiters: "SMARTRECRUITERS_BOARDS",
};
export const registrySources = [
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md",
  "https://raw.githubusercontent.com/poteto/hiring-without-whiteboards/main/README.md",
];
export function boardFromUrl(
  value: string,
  company: string,
  evidenceUrl: string,
): PublicBoard | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return;
  const platform: BoardPlatform | undefined = {
    "boards.greenhouse.io": "Greenhouse",
    "job-boards.greenhouse.io": "Greenhouse",
    "jobs.lever.co": "Lever",
    "jobs.eu.lever.co": "Lever",
    "jobs.ashbyhq.com": "Ashby",
    "careers.smartrecruiters.com": "SmartRecruiters",
    "jobs.smartrecruiters.com": "SmartRecruiters",
  }[url.hostname] as BoardPlatform | undefined;
  const token = url.pathname.split("/")[1];
  if (
    !platform ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(token) ||
    /^(embed|v1|v0)$/.test(token)
  )
    return;
  return {
    platform,
    token,
    company: company.trim() || token,
    region: url.hostname === "jobs.eu.lever.co" ? "eu" : "global",
    careersUrl: `${url.origin}/${token}`,
    evidenceUrl,
  };
}
export function extractPublicBoards(
  text: string,
  evidenceUrl: string,
): PublicBoard[] {
  const found: PublicBoard[] = [];
  let company = "";
  // Only harvest actual links; never manufacture slugs from company names.
  const blocks = text.includes("<tr>")
    ? text.split(/<tr\b[^>]*>/i)
    : text.split("\n");
  for (const block of blocks) {
    const heading = block.match(/<td[^>]*>([\s\S]*?)<\/td>/i)?.[1];
    const label = heading
      ? plainText(heading)
      : block.match(/^\s*-\s*\[([^\]]+)\]/)?.[1];
    if (label && !/^[↳↓\s]+$/.test(label))
      company = label.replace(/^[^\p{L}\p{N}]+/u, "");
    for (const match of block.matchAll(
      /https:\/\/(?:[a-z-]+\.)*(?:greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com)\/[a-zA-Z0-9_-]+/g,
    )) {
      const board = boardFromUrl(match[0], company, evidenceUrl);
      if (board) found.push(board);
    }
  }
  return uniqueBoards(found);
}
export function uniqueBoards(boards: PublicBoard[]): PublicBoard[] {
  return [
    ...new Map(
      boards.map((b) => [
        `${b.platform}:${b.region || "global"}:${b.token.toLowerCase()}`,
        b,
      ]),
    ).values(),
  ];
}
export const seedBoards = uniqueBoards(seeds as PublicBoard[]);
let lastKnownBoards = seedBoards;
let refresh: { until: number; promise: Promise<PublicBoard[]> } | undefined;
export async function registryBoards(): Promise<PublicBoard[]> {
  if (refresh && refresh.until > Date.now()) return refresh.promise;
  const promise = (async () => {
    const results = await Promise.allSettled(
      registrySources.map(async (url) => {
        const r = await fetch(url, {
          signal: AbortSignal.timeout(4000),
          redirect: "error",
          cache: "force-cache",
          next: { revalidate: 86400 },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (text.length > 3_000_000)
          throw new Error("Registry document too large");
        return extractPublicBoards(text, url);
      }),
    );
    let retained: PublicBoard[] = [];
    if (process.env.MONGODB_URI) {
      try {
        const { db } = await import("./db");
        const saved = await (
          await db()
        )
          .collection("public_board_registry")
          .find({}, { projection: { board: 1 } })
          .limit(600)
          .toArray();
        retained = saved.flatMap((doc) => {
          const board = doc.board as PublicBoard;
          const parsed =
            board &&
            boardFromUrl(board.careersUrl, board.company, board.evidenceUrl);
          return parsed ? [parsed] : [];
        });
      } catch {
        /* Built-in and discovered candidates remain available without MongoDB. */
      }
    }
    lastKnownBoards = uniqueBoards([
      ...lastKnownBoards,
      ...retained,
      ...results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    ]).slice(0, 600);
    return lastKnownBoards;
  })();
  refresh = { until: Date.now() + 86400000, promise };
  return promise;
}
export function configuredBoards(
  platform: BoardPlatform,
  value = process.env[boardVariables[platform]],
): PublicBoard[] {
  if (!value?.trim()) return [];
  const tokens = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    tokens.length > 200 ||
    tokens.some(
      (t) =>
        !/^(?:eu:)?[a-zA-Z0-9_-]{1,100}$/.test(t) ||
        (t.startsWith("eu:") && platform !== "Lever"),
    )
  )
    throw new Error(
      `Invalid ${boardVariables[platform]}: expected comma-separated board tokens`,
    );
  return uniqueBoards(
    tokens.map((t) => {
      const eu = t.startsWith("eu:");
      const token = eu ? t.slice(3) : t;
      const host =
        platform === "Greenhouse"
          ? "job-boards.greenhouse.io"
          : platform === "Lever"
            ? eu
              ? "jobs.eu.lever.co"
              : "jobs.lever.co"
            : platform === "Ashby"
              ? "jobs.ashbyhq.com"
              : "careers.smartrecruiters.com";
      return {
        platform,
        token,
        company: token,
        region: eu ? "eu" : "global",
        careersUrl: `https://${host}/${token}`,
        evidenceUrl: "operator configuration",
      };
    }),
  );
}
