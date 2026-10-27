import { jobIdentity } from "./job-identity";
import { plainText, relevant } from "./matching";
import type { JobFeed, RawJob } from "./discovery-feed";
import {
  configuredBoards,
  registryBoards,
  uniqueBoards,
  type BoardPlatform,
  type PublicBoard,
} from "./public-board-registry";
type Row = Record<string, unknown>;
const obj = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const rows = (v: unknown): Row[] => {
  if (!Array.isArray(v)) throw new Error("Invalid response");
  return v.map(obj);
};
const names = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((x) => str(x) || str(obj(x).name))
        .filter(Boolean)
        .join(", ")
    : str(v);
export type BoardCheck = {
  board: PublicBoard;
  checkedAt: string;
  status: "verified" | "error";
  fetched: number;
  complete: boolean;
  retryUntil?: number;
  error?: string;
};
export type BoardResult = { jobs: RawJob[]; check: BoardCheck };
const cache = new Map<
  string,
  { until: number; promise: Promise<BoardResult> }
>();
const pending = new Map<string, Promise<JobFeed>>();
const publicHosts = new Set([
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.eu.lever.co",
  "api.ashbyhq.com",
  "api.smartrecruiters.com",
]);
async function json(url: string, signal: AbortSignal): Promise<unknown> {
  if (!publicHosts.has(new URL(url).hostname))
    throw new Error("Invalid public API host");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      redirect: "error",
      cache: "force-cache",
      next: { revalidate: 3600 },
      headers: {
        Accept: "application/json",
        "User-Agent": "PersonalJobFinder/1.0 (public job listings)",
      },
    });
    if (response.ok) return response.json();
    // Respect long rate-limit windows; never hammer the provider.
    const wait = Number(response.headers.get("retry-after"));
    if (
      !attempt &&
      (response.status >= 500 ||
        (response.status === 429 &&
          Number.isFinite(wait) &&
          wait > 0 &&
          wait <= 1))
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, response.status === 429 ? wait * 1000 : 150),
      );
      signal.throwIfAborted();
      continue;
    }
    const failure=new Error(response.status === 429 ? 'HTTP 429 (rate limited; retry later)' : `HTTP ${response.status}`) as Error & {retryUntil?:number};
    if(response.status===429){const header=response.headers.get('retry-after');const seconds=header ? Number(header) : NaN;const until=Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(header || '');failure.retryUntil=Math.min(Date.now()+86400000,Number.isFinite(until)&&until>Date.now()?until:Date.now()+3600000);}
    throw failure;
  }
  throw new Error("Request failed");
}
function normalized(board: PublicBoard, j: Row, metadata: Row = {}): RawJob {
  const base: RawJob = {
    title: "",
    company: board.company,
    source: board.platform,
    requisitionId: str(j.id) || str(j.jobId) || (typeof j.id === "number" ? String(j.id) : undefined),
    boardKey: `${board.platform}:${board.region || "global"}:${board.token.toLowerCase()}`,
    employmentType: str(j.employmentType) || str(obj(j.categories).commitment),
    location: "Remote — location unspecified",
    description: "",
    salary: "",
    url: "",
    date: "",
    remote: false,
  };
  if (board.platform === "Greenhouse")
    return {
      ...base,
      title: str(j.title),
      company: str(j.company_name) || board.company,
      location: str(obj(j.location).name),
      description: plainText(
        str(j.content).replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
      ),
      url: str(j.absolute_url),
      date: str(j.first_published),
      remote: /\bremote\b|work from (?:home|anywhere)/i.test(
        `${str(j.title)} ${str(obj(j.location).name)} ${plainText(str(j.content))}`,
      ),
    };
  if (board.platform === "Lever") {
    const c = obj(j.categories);
    return {
      ...base,
      title: str(j.text),
      location: names(c.allLocations) || str(c.location),
      description: plainText(
        [
          str(j.descriptionPlain) || str(j.description),
          ...(Array.isArray(j.lists)
            ? j.lists.map((l) => str(obj(l).text) + " " + str(obj(l).content))
            : []),
          str(j.additionalPlain) || str(j.additional),
        ].join(" "),
      ),
      date:
        typeof j.createdAt === "number" &&
        Number.isFinite(j.createdAt) &&
        j.createdAt > 0
          ? new Date(j.createdAt).toISOString()
          : "",
      url: str(j.hostedUrl),
      remote: j.workplaceType === "remote",
    };
  }
  if (board.platform === "Ashby")
    return {
      ...base,
      title: str(j.title),
      company: str(metadata.organizationName) || board.company,
      location: [
        str(j.location),
        ...(Array.isArray(j.secondaryLocations)
          ? j.secondaryLocations.map((l) => str(obj(l).location))
          : []),
      ]
        .filter(Boolean)
        .join(", "),
      description: plainText(str(j.descriptionPlain) || str(j.descriptionHtml)),
      date: str(j.publishedAt),
      url: str(j.jobUrl),
      remote:
        (j.isRemote === true || j.workplaceType === "Remote") &&
        !/hybrid|on.?site/i.test(str(j.workplaceType)),
    };
  const loc = obj(j.location);
  const sections = obj(obj(j.jobAd).sections);
  return {
    ...base,
    title: str(j.name),
    company: str(obj(j.company).name) || board.company,
    location:
      [
        str(loc.city),
        str(loc.region),
        {
          ng: "Nigeria",
          za: "South Africa",
          us: "United States",
          gb: "United Kingdom",
        }[str(loc.country).toLowerCase()] || str(loc.country),
      ]
        .filter(Boolean)
        .join(", ") || "Remote — location unspecified",
    description: plainText(
      Object.values(sections)
        .map((s) => str(obj(s).text))
        .join(" "),
    ),
    date: str(j.releasedDate),
    remote: loc.remote === true || loc.remote === "true",
    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(board.token)}/${encodeURIComponent(str(j.id))}`,
  };
}
async function fetchBoard(
  board: PublicBoard,
  signal: AbortSignal,
): Promise<BoardResult> {
  const key = encodeURIComponent(board.token);
  const jobs: RawJob[] = [];
  let complete = true;
  let validPage = false;
  let error: string | undefined;
  let retryUntil:number|undefined;
  try {
    for (let page = 0; page < 10; page++) {
      signal.throwIfAborted();
      const endpoint =
        board.platform === "Greenhouse"
          ? `https://boards-api.greenhouse.io/v1/boards/${key}/jobs?content=true`
          : board.platform === "Lever"
            ? `https://${board.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${key}?mode=json&limit=100&skip=${page * 100}`
            : board.platform === "Ashby"
              ? `https://api.ashbyhq.com/posting-api/job-board/${key}`
              : `https://api.smartrecruiters.com/v1/companies/${key}/postings?limit=100&offset=${page * 100}`;
      const data = await json(endpoint, signal);
      const d = obj(data);
      const entries = rows(
        board.platform === "Lever"
          ? data
          : board.platform === "SmartRecruiters"
            ? d.content
            : d.jobs,
      );
      if (
        board.platform === "SmartRecruiters" &&
        typeof d.totalFound !== "number"
      )
        throw new Error("Invalid response");
      validPage = true;
      for (const entry of entries) {
        if (entry.isListed === false) continue;
        let detail = entry;
        // Summary postings omit descriptions and can omit country restrictions.
        if (
          board.platform === "SmartRecruiters" &&
          relevant(str(entry.name)) &&
          (obj(entry.location).remote === true ||
            obj(entry.location).remote === "true")
        ) {
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(str(entry.id))) {
            complete = false;
            continue;
          }
          try {
            detail = obj(
              await json(
                `https://api.smartrecruiters.com/v1/companies/${key}/postings/${encodeURIComponent(str(entry.id))}`,
                signal,
              ),
            );
          } catch {
            complete = false;
            continue;
          } // Never accept an unenriched listing with hidden restrictions.
        }
        jobs.push(normalized(board, detail, d));
      }
      if (
        board.platform === "Greenhouse" ||
        board.platform === "Ashby" ||
        entries.length < 100 ||
        (board.platform === "SmartRecruiters" &&
          (page + 1) * 100 >= Number(d.totalFound))
      )
        break;
      if (page === 9) complete = false;
    }
  } catch (e) {
    complete = false;
    retryUntil=(e as {retryUntil?:number})?.retryUntil;
    error =
      e instanceof Error && /^HTTP \d{3}|^Invalid response$/.test(e.message)
        ? e.message
        : "Request failed or timed out";
    if (!validPage) throw Object.assign(new Error(error),{retryUntil:(e as {retryUntil?:number})?.retryUntil});
  }
  const seen = new Set<string>();
  return {
    jobs: jobs.filter((j) => {
      const identity=`${j.url}|${j.requisitionId || ""}|${j.location}`;
      if (!j.url || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }),
    check: {
      board,
      checkedAt: new Date().toISOString(),
      status: "verified",
      fetched: jobs.length,
      complete,
      ...(error ? { error } : {}),
      ...(retryUntil ? {retryUntil} : {}),
    },
  };
}
export function readPublicBoard(
  board: PublicBoard,
  signal: AbortSignal = AbortSignal.timeout(35000),
  useCache = true,
): Promise<BoardResult> {
  const key = `${board.platform}:${board.region || "global"}:${board.token.toLowerCase()}`;
  const current = cache.get(key);
  if (useCache && current && current.until > Date.now()) return current.promise;
  const promise = fetchBoard(board, signal);
  if (useCache) {
    if (cache.size >= 250) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + 15 * 60000, promise });
    void promise.then(result=>{if(result.check.retryUntil && cache.get(key)?.promise===promise)cache.set(key,{until:result.check.retryUntil,promise});},()=>{});
    void promise.catch((error:Error & {retryUntil?:number}) => {
      if (cache.get(key)?.promise === promise)
        cache.set(key, { until: error.retryUntil || Date.now() + 60000, promise });
    });
  }
  return promise;
}
export async function readPublicBoards(
  platform: BoardPlatform,
): Promise<JobFeed> {
  const custom = configuredBoards(platform); // Validate overrides before making any request.
  const key = `${platform}:${JSON.stringify(custom)}`;
  if (pending.has(key)) return pending.get(key)!;
  const run = (async (): Promise<JobFeed> => {
    const all = uniqueBoards([
      ...custom,
      ...(await registryBoards()).filter((b) => b.platform === platform),
    ]);
    // Rotate the automatic inventory each hour; custom boards take precedence.
    const offset = all.length
      ? (Math.floor(Date.now() / 3600000) * 37) % all.length
      : 0;
    const chosen = uniqueBoards([
      ...custom.slice(0, 10),
      ...all.slice(offset),
      ...all.slice(0, offset),
    ]).slice(0, 50);
    const signal = AbortSignal.timeout(40000);
    const checks: BoardCheck[] = [];
    const completedBoards: {key:string;urls:string[];ids:string[]}[] = [];
    const jobs: RawJob[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, chosen.length) }, async () => {
        while (next < chosen.length && !signal.aborted) {
          const board = chosen[next++];
          try {
            const result = await readPublicBoard(board, signal);
            checks.push(result.check);
          if (result.check.complete) completedBoards.push({key:`${board.platform}:${board.region || "global"}:${board.token.toLowerCase()}`, urls:result.jobs.map(j=>j.url),ids:result.jobs.flatMap(j=>{try{return [jobIdentity(j)];}catch{return [];}})});
            jobs.push(
              ...result.jobs.map((j) => ({
                ...j,
                lastVerifiedAt: result.check.checkedAt,
              })),
            );
          } catch (e) {
            checks.push({
              board,
              status: "error",
              fetched: 0,
              complete: false,
              checkedAt: new Date().toISOString(),
              error:
                e instanceof Error &&
                /^HTTP \d{3}|^Invalid response$/.test(e.message)
                  ? e.message
                  : "Request failed or timed out",
            });
          }
        }
      }),
    );
    if (process.env.MONGODB_URI && checks.length) {
      try {
        const { db } = await import("./db");
        const database = await db();
        for (const complete of completedBoards) {
          await database.collection("jobs").updateMany({boardKey:complete.key,id:{$nin:complete.ids},closedAt:{$exists:false}},{$set:{closedAt:new Date().toISOString()}});
        }
        await database.collection("public_board_registry").bulkWrite(
          checks.map((check) => ({
            updateOne: {
              filter: {
                key: `${check.board.platform}:${check.board.region || "global"}:${check.board.token.toLowerCase()}`,
              },
              update: {
                $set: {
                  ...check,
                  ...(check.status === "verified"
                    ? { lastVerifiedAt: check.checkedAt }
                    : {}),
                },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
      } catch {
        console.error(
          "Public board registry verification could not be persisted",
        );
      }
    }
    const verified = checks.filter((c) => c.status === "verified");
    const boards = {
      total: all.length,
      checked: checks.length,
      verified: verified.length,
      failed: checks.length - verified.length,
      unvisited: all.length - checks.length,
    };
    if (!verified.length)
      return {
        jobs: [],
        partial: true,
        boards,
        sourceError:
          "No public company board could be reached. Check source access and retry.",
      };
    return { jobs, partial: true, boards, completedBoards }; // A registry is never the entire platform inventory.
  })();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }
}

export function clearPublicBoardCache() {
  cache.clear();
  pending.clear();
}
