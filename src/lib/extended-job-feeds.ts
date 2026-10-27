import { readPublicBoards } from "./public-board-feeds";
import { boardPlatforms } from "./public-board-registry";
import { XMLParser } from "fast-xml-parser";
import { plainText } from "./matching";
import { jobPlatforms } from "./job-platforms";
import type { JobAdapter, JobFeed, RawJob } from "./discovery-feed";
type Row = Record<string, unknown>;
const obj = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const rows = (v: unknown): Row[] => {
  if (!Array.isArray(v)) throw new Error("Invalid response");
  return v.map(obj);
};
const named = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? x : str(obj(x).name)))
        .filter(Boolean)
        .join(", ")
    : str(v);
const epoch = (v: unknown, factor = 1000) => {
  const n = Number(v);
  return Number.isFinite(n) &&
    n > 0 &&
    Number.isFinite(new Date(n * factor).getTime())
    ? new Date(n * factor).toISOString()
    : "";
};
const remoteText = (...v: unknown[]) =>
  /\bremote\b|remotely|work from home|teletrabalho|remoto/i.test(
    v.map(str).join(" "),
  );
const salary = (min: unknown, max: unknown, currency: unknown) =>
  typeof min === "number" && min > 0
    ? `${min}${typeof max === "number" && max > 0 ? `–${max}` : ""} ${str(currency)}`.trim()
    : "";
async function request(
  url: string,
  init: RequestInit = {},
  cache = true,
): Promise<unknown> {
  const r = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000),
    redirect: "error",
    cache: cache ? "force-cache" : "no-store",
    ...(cache ? { next: { revalidate: 3600 } } : {}),
    headers: {
      "User-Agent": "PersonalJobFinder/1.0",
      Accept: "application/json",
      ...init.headers,
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function job(source: string, value: Partial<RawJob>): RawJob {
  return {
    source,
    title: "",
    company: "",
    description: "",
    location: "Remote — location unspecified",
    salary: "",
    url: "",
    date: "",
    remote: false,
    ...value,
  };
}
const feed = (jobs: RawJob[]): JobFeed => ({ jobs, partial: true }); // All new searches are bounded, not complete source inventories.
export function normalizeExtra(source: string, value: unknown): RawJob {
  const j = obj(value);
  const body = plainText(str(j.description) || str(j.contents) || str(j.text));
  switch (source) {
    case "Jobicy":
      return job(source, {
        title: str(j.jobTitle),
        company: str(j.companyName),
        description: plainText(str(j.jobDescription) || str(j.jobExcerpt)),
        location: str(j.jobGeo) || "Remote — location unspecified",
        salary: salary(j.salaryMin, j.salaryMax, j.salaryCurrency),
        url: str(j.url),
        date: str(j.pubDate),
        remote: true,
        seniority: str(j.jobLevel) ? [str(j.jobLevel)] : undefined,
      });
    case "The Muse": {
      const location = named(j.locations);
      return job(source, {
        title: str(j.name),
        company: str(obj(j.company).name),
        description: body,
        location,
        url: str(obj(j.refs).landing_page),
        date: str(j.publication_date),
        remote: remoteText(j.name, location, body),
        seniority: Array.isArray(j.levels)
          ? j.levels.map((v) => str(obj(v).name))
          : undefined,
      });
    }
    case "Get on Board": {
      const a = obj(j.attributes);
      const employer = obj(j.employer);
      const description = plainText(
        [a.description, a.functions, a.benefits, a.desirable]
          .map(str)
          .join(" "),
      );
      const location =
        named(a.remote_zones) ||
        str(a.country) ||
        str(a.location) ||
        "Remote — location unspecified";
      return job(source, {
        title: str(a.title),
        company: str(employer.name),
        description,
        location,
        date:
          typeof a.published_at === "number"
            ? epoch(a.published_at)
            : str(a.published_at),
        url: str(a.public_url),
        remote:
          a.remote_modality === "fully_remote" ||
          (a.remote === true &&
            !/hybrid|on[ -]?site/i.test(str(a.remote_modality))),
        salary: salary(
          a.min_salary,
          a.max_salary,
          str(a.currency) || str(a.salary_currency),
        ),
      });
    }
    case "Findwork":
      return job(source, {
        title: str(j.role),
        company: str(j.company_name),
        description: plainText(str(j.text)),
        location: str(j.location) || "Remote — location unspecified",
        date: str(j.date_posted),
        url: str(j.url),
        remote: j.remote === true,
      });
    case "Adzuna":
      return job(source, {
        title: str(j.title),
        company: str(obj(j.company).display_name),
        description: body,
        location: str(obj(j.location).display_name),
        date: str(j.created),
        url: str(j.redirect_url),
        remote: remoteText(j.title, body, obj(j.location).display_name),
        salary:
          j.salary_is_predicted === "1"
            ? ""
            : salary(j.salary_min, j.salary_max, ""),
      });
    case "Jooble":
      return job(source, {
        title: str(j.title),
        company: str(j.company),
        description: plainText(str(j.snippet)),
        location: str(j.location),
        date: str(j.published) || str(j.datePosted),
        url: str(j.link),
        remote: remoteText(j.title, j.location, j.snippet),
        salary: str(j.salary),
      });
    case "Reed": {
      const date = str(j.date);
      const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return job(source, {
        title: str(j.jobTitle),
        company: str(j.employerName),
        description: plainText(str(j.jobDescription)),
        location: str(j.locationName),
        date: m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00Z` : "",
        url: str(j.jobUrl),
        remote: remoteText(j.jobTitle, j.locationName, j.jobDescription),
        salary: salary(j.minimumSalary, j.maximumSalary, j.currency),
      });
    }
    case "USAJOBS": {
      const d = obj(j.MatchedObjectDescriptor);
      const details = obj(obj(d.UserArea).Details);
      const summary = str(d.QualificationSummary);
      return job(source, {
        title: str(d.PositionTitle),
        company: str(d.OrganizationName),
        description: plainText(
          [details.JobSummary, summary, details.Requirements]
            .map(str)
            .join(" "),
        ),
        location: str(d.PositionLocationDisplay),
        date: str(d.PublicationStartDate),
        expiresAt: str(d.ApplicationCloseDate) || undefined,
        url: str(d.PositionURI),
        remote:
          details.RemoteIndicator === true ||
          /^(true|yes)$/i.test(str(details.RemoteIndicator)),
      });
    }
    case "Web3.career":
      return job(source, {
        title: str(j.title),
        company: str(j.company),
        description: plainText(str(j.description)),
        location: str(j.location),
        date: str(j.date),
        url: str(j.url),
        remote: j.is_remote === true || remoteText(j.location, j.title),
      });
    case "ITJobs Portugal":
      return job(source, {
        title: str(j.title),
        company: str(obj(j.company).name),
        description: plainText(str(j.body)),
        location: named(j.locations) || str(j.country),
        date: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str(j.publishedAt))
          ? str(j.publishedAt).replace(" ", "T") + "Z"
          : str(j.publishedAt),
        url:
          typeof j.id === "number" && str(j.slug)
            ? `https://www.itjobs.pt/oferta/${j.id}/${encodeURIComponent(str(j.slug))}`
            : "",
        remote: remoteText(j.title, j.body),
      });
    default:
      throw new Error("Invalid response");
  }
}
function adapter(name: string, read: () => Promise<JobFeed>): JobAdapter {
  return {
    name,
    read,
    requiredEnv: jobPlatforms.find((p) => p.name === name)?.settings,
  };
}
function basic(key: string) {
  return `Basic ${Buffer.from(`${process.env[key]}:`).toString("base64")}`;
}
export const additionalJobAdapters: JobAdapter[] = [
  adapter("Jobicy", async () => {
    const jobs: RawJob[] = [];
    let cursor = "";
    for (let page = 0; page < 3; page++) {
      const params = new URLSearchParams({
        count: "200",
        ...(cursor ? { cursor } : {}),
      });
      try {
        const d = obj(
          await request(`https://jobicy.com/api/v2/remote-jobs?${params}`),
        );
        jobs.push(...rows(d.jobs).map((j) => normalizeExtra("Jobicy", j)));
        cursor = str(d.nextCursor);
        if (!cursor) break;
      } catch (e) {
        if (!jobs.length) throw e;
        break;
      }
    }
    return feed(jobs);
  }),
  adapter("The Muse", async () => {
    const d = obj(
      await request(
        "https://www.themuse.com/api/public/jobs?category=Software%20Engineering&page=0&descending=true",
      ),
    );
    return feed(rows(d.results).map((j) => normalizeExtra("The Muse", j)));
  }),
  adapter("Get on Board", async () => {
    const d = obj(
      await request(
        "https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=100&page=1",
      ),
    );
    const included = Array.isArray(d.included) ? d.included.map(obj) : [];
    const companies = new Map(
      included
        .filter((v) => v.type === "company")
        .map((v) => [str(v.id), obj(v.attributes)]),
    );
    const ids = [
      ...new Set(
        rows(d.data).map((j) =>
          str(obj(obj(obj(j.relationships).company).data).id),
        ),
      ),
    ]
      .filter(
        (value) =>
          /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !companies.has(value),
      )
      .slice(0, 12);
    await Promise.allSettled(
      ids.map(async (companyId) => {
        const response = obj(
          await request(
            `https://www.getonbrd.com/api/v0/companies/${encodeURIComponent(companyId)}`,
          ),
        );
        const company = obj(obj(response.data).attributes);
        if (str(company.name)) companies.set(companyId, company);
      }),
    );
    return feed(
      rows(d.data).map((j) => {
        const relationship = obj(obj(obj(j.relationships).company).data);
        const employer = companies.get(str(relationship.id)) || {};
        return normalizeExtra("Get on Board", { ...j, employer });
      }),
    );
  }),
  adapter("Remotely", async () => {
    const data = await request(
      "https://tryremotely.com/api/v1?limit=100&offset=0",
    );
    const values = Array.isArray(data)
      ? data
      : obj(data).jobs || obj(data).jobListings;
    return feed(
      rows(values).map((j) => {
        const location = named(j.locations) || "Remote — location unspecified";
        return job("Remotely", {
          title: str(j.title),
          company: str(j.companyName),
          description: plainText(str(j.description)),
          location,
          url: str(j.url) || str(j.applicationLink),
          date:
            typeof j.pubDate === "number"
              ? epoch(j.pubDate, j.pubDate > 1e12 ? 1 : 1000)
              : str(j.pubDate),
          expiresAt:
            typeof j.expiryDate === "number"
              ? epoch(j.expiryDate, j.expiryDate > 1e12 ? 1 : 1000)
              : str(j.expiryDate) || undefined,
          remote: /^(?:fully[ -]?)?remote$/i.test(str(j.workModel)),
          seniority: str(j.seniorityLevel)
            ? [str(j.seniorityLevel)]
            : undefined,
        });
      }),
    );
  }),
  adapter("Remote First Jobs", async () => {
    const result = await Promise.allSettled(
      ["react", "cybersecurity"].map(async (category) => {
        const response = await fetch(
          `https://remotefirstjobs.com/rss/jobs/${category}.rss`,
          {
            signal: AbortSignal.timeout(10000),
            redirect: "error",
            cache: "force-cache",
            next: { revalidate: 3600 },
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = new XMLParser({
          processEntities: false,
          ignoreAttributes: true,
        }).parse(await response.text());
        const channel = obj(obj(parsed).rss).channel;
        if (!channel) throw new Error("Invalid response");
        const value = obj(channel).item;
        return (Array.isArray(value) ? value : value ? [value] : []).map(
          (value) => {
            const j = obj(value);
            const title = str(j.title);
            const at = title.match(/^(.*?) (?:at|@) (.+)$/);
            const colon = title.match(/^([^:]+): (.+)$/);
            return job("Remote First Jobs", {
              title: at?.[1] || colon?.[2] || title,
              company: str(j.company) || at?.[2] || colon?.[1] || "",
              description: plainText(str(j.description)),
              date: str(j.pubDate),
              url: str(j.link),
              location: str(j.location) || "Remote — location unspecified",
              remote: true,
            });
          },
        );
      }),
    );
    if (result.every((r) => r.status === "rejected"))
      throw new Error("Request failed or timed out");
    return feed(
      result.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    );
  }),
  adapter("Hacker News Jobs", async () => {
    const ids = await request(
      "https://hacker-news.firebaseio.com/v0/jobstories.json",
    );
    if (!Array.isArray(ids)) throw new Error("Invalid response");
    const result = await Promise.allSettled(
      ids
        .slice(0, 25)
        .filter((v) => Number.isSafeInteger(v) && v > 0)
        .map(async (id) => {
          const j = obj(
            await request(
              `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            ),
          );
          const title = str(j.title);
          const match = title.match(
            /^(.+?)(?:\s*\([^)]*\))?\s+(?:is hiring|hiring|seeks)\s*(.*)$/i,
          );
          const description = plainText(str(j.text));
          const combined = title + " " + description;
          return job("Hacker News Jobs", {
            title: match?.[2] || title,
            company: match?.[1] || "",
            description,
            location: /\bworldwide\b|anywhere in the world/i.test(combined)
              ? "Worldwide"
              : /\bnigeria\b/i.test(combined)
                ? "Nigeria"
                : "Remote — location unspecified",
            date: epoch(j.time),
            url: str(j.url) || `https://news.ycombinator.com/item?id=${id}`,
            remote:
              remoteText(combined) && j.deleted !== true && j.dead !== true,
          });
        }),
    );
    if (result.length && result.every((r) => r.status === "rejected"))
      throw new Error("Request failed or timed out");
    return feed(
      result.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    );
  }),
  adapter("Findwork", async () =>
    feed(
      rows(
        obj(
          await request(
            "https://findwork.dev/api/jobs/?remote=true&order_by=-date",
            {
              headers: {
                Authorization: `Token ${process.env.FINDWORK_API_KEY}`,
              },
            },
            false,
          ),
        ).results,
      ).map((j) => normalizeExtra("Findwork", j)),
    ),
  ),
  adapter("Adzuna", async () => {
    const country = process.env.ADZUNA_COUNTRY || "gb";
    if (!/^[a-z]{2}$/.test(country)) throw new Error("Invalid response");
    const q = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      what: "remote frontend",
      results_per_page: "50",
      sort_by: "date",
      max_days_old: "30",
    });
    return feed(
      rows(
        obj(
          await request(
            `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${q}`,
            {},
            false,
          ),
        ).results,
      ).map((j) => normalizeExtra("Adzuna", j)),
    );
  }),
  adapter("Jooble", async () =>
    feed(
      rows(
        obj(
          await request(
            `https://jooble.org/api/${encodeURIComponent(process.env.JOOBLE_API_KEY!)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                keywords: "remote frontend",
                location: "",
                page: 1,
              }),
            },
            false,
          ),
        ).jobs,
      ).map((j) => normalizeExtra("Jooble", j)),
    ),
  ),
  adapter("Reed", async () =>
    feed(
      rows(
        obj(
          await request(
            "https://www.reed.co.uk/api/1.0/search?keywords=remote%20frontend&resultsToTake=100",
            { headers: { Authorization: basic("REED_API_KEY") } },
            false,
          ),
        ).results,
      ).map((j) => normalizeExtra("Reed", j)),
    ),
  ),
  adapter("USAJOBS", async () => {
    const d = obj(
      await request(
        "https://data.usajobs.gov/api/Search?Keyword=frontend&RemoteIndicator=true&DatePosted=30&ResultsPerPage=100",
        {
          headers: {
            Host: "data.usajobs.gov",
            "User-Agent": process.env.USAJOBS_EMAIL!,
            "Authorization-Key": process.env.USAJOBS_API_KEY!,
          },
        },
        false,
      ),
    );
    return feed(
      rows(obj(d.SearchResult).SearchResultItems).map((j) =>
        normalizeExtra("USAJOBS", j),
      ),
    );
  }),
  adapter("Web3.career", async () => {
    const q = new URLSearchParams({
      token: process.env.WEB3_CAREER_TOKEN!,
      remote: "true",
      tag: "react",
      limit: "100",
    });
    const d = await request(`https://web3.career/api/v1?${q}`, {}, false);
    if (!Array.isArray(d)) throw new Error("Invalid response");
    const jobs = d.find(Array.isArray);
    return feed(rows(jobs).map((j) => normalizeExtra("Web3.career", j)));
  }),
  adapter("ITJobs Portugal", async () =>
    feed(
      rows(
        obj(
          await request(
            "https://api.itjobs.pt/job/search.json",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                api_key: process.env.ITJOBS_API_KEY!,
                q: "react,frontend,remote",
                limit: "100",
              }),
            },
            false,
          ),
        ).results,
      ).map((j) => normalizeExtra("ITJobs Portugal", j)),
    ),
  ),
  ...boardPlatforms.map((name) => ({ name, read: () => readPublicBoards(name) })),
];
