import { JOB_WINDOW_MS } from "./job-freshness";
import { jobIdentity } from "./job-identity";
import { classifyLocation, inferExperience, inferJobType } from "./job-intelligence";
import { XMLParser } from "fast-xml-parser";
import { plainText, relevant, fullyRemote } from "./matching";
import type { Job } from "./types";
import type { SourceReport } from "./discovery-types";
import type { RawJob as Raw, JobAdapter } from "./discovery-feed";
import { additionalJobAdapters } from "./extended-job-feeds";
const string = (value: unknown) => (typeof value === "string" ? value : "");
const timestamp = (value: unknown) => {
  const date = new Date(Number(value) * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
};
async function json(url: string, signal = AbortSignal.timeout(15000)) {
  const response = await fetch(url, {
    signal,
    cache: "force-cache",
    next: { revalidate: url.includes("remotive.com/") ? 21600 : 900 },
    headers: { "User-Agent": "PersonalJobFinder/1.0" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
const adapters: JobAdapter[] = [
  {
    name: "We Work Remotely",
    read: async () => {
      const response = await fetch(
        "https://weworkremotely.com/remote-jobs.rss",
        {
          signal: AbortSignal.timeout(15000),
          cache: "force-cache",
          next: { revalidate: 900 },
          headers: { "User-Agent": "PersonalJobFinder/1.0" },
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // RSS text and CDATA are data only; disable entity processing and never render HTML.
      const parsed = new XMLParser({
        processEntities: false,
        ignoreAttributes: true,
      }).parse(await response.text());
      const channel = parsed?.rss?.channel;
      if (!channel) throw new Error("Invalid response");
      const items = channel.item
        ? Array.isArray(channel.item)
          ? channel.item
          : [channel.item]
        : [];
      return {
        jobs: items.map((j: Record<string, unknown>): Raw => {
          const title = string(j.title);
          const separator = title.indexOf(": ");
          return {
            company: separator > 0 ? title.slice(0, separator) : "",
            title: separator > 0 ? title.slice(separator + 2) : title,
            location: string(j.country) || string(j.region),
            salary: "",
            description: plainText(string(j.description)),
            date: string(j.pubDate),
            expiresAt:
              j.expires_at && Number.isFinite(Date.parse(string(j.expires_at)))
                ? new Date(string(j.expires_at)).toISOString()
                : undefined,
            url: string(j.link),
            source: "We Work Remotely",
          };
        }),
      };
    },
  },
  {
    name: "Remotive",
    read: async () => {
      const data = await json("https://remotive.com/api/remote-jobs");
      if (!Array.isArray(data.jobs)) throw new Error("Invalid response");
      return {
        jobs: data.jobs.map((j: Record<string, unknown>): Raw => ({
          title: string(j.title),
          company: string(j.company_name),
          location: string(j.candidate_required_location),
          salary: string(j.salary),
          description: plainText(string(j.description)),
          url: string(j.url),
          date: string(j.publication_date),
          source: "Remotive",
        })),
      };
    },
  },
  {
    name: "Arbeitnow",
    read: async () => {
      const data = await json("https://www.arbeitnow.com/api/job-board-api");
      if (!Array.isArray(data.data)) throw new Error("Invalid response");
      return {
        jobs: data.data.map((j: Record<string, unknown>): Raw => ({
          title: string(j.title),
          company: string(j.company_name),
          location: string(j.location),
          salary: "",
          description: plainText(string(j.description)),
          url: string(j.url),
          date: timestamp(j.created_at),
          remote: j.remote === true,
          source: "Arbeitnow",
        })),
      };
    },
  },
  {
    name: "Remote OK",
    read: async () => {
      const data = await json("https://remoteok.com/api");
      if (!Array.isArray(data)) throw new Error("Invalid response");
      // The first entry contains API terms, not a job. Link to source listings for attribution.
      return {
        jobs: data
          .filter((j) => j && typeof j.position === "string")
          .map((j): Raw => ({
            title: string(j.position),
            company: string(j.company),
            location: string(j.location),
            salary:
              j.salary_min && j.salary_max
                ? `${j.salary_min}–${j.salary_max} ${string(j.salary_currency)}`
                : "",
            description: plainText(string(j.description)),
            url: string(j.url),
            date: string(j.date),
            source: "Remote OK",
          })),
      };
    },
  },
  {
    name: "Himalayas",
    read: async () => {
      // The documented search API targets the desired roles instead of scanning unrelated newest jobs.
      // country=NG filters applicant eligibility; employers still come from around the world.
      const queries = [
        "frontend",
        "React",
        "Angular",
        "Next.js",
        "JavaScript",
        "TypeScript",
        "cybersecurity",
        "SOC analyst",
        "security operations",
        "security internship",
      ];
      const signal = AbortSignal.timeout(30000);
      const pages: Record<string, unknown>[][] = [];
      let successful = 0;
      let nextQuery = 0;
      // Three workers bound upstream traffic. Short pages are not the end of this API:
      // only an empty page is conclusive, and totalCount can lag the live index.
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (nextQuery < queries.length && !signal.aborted) {
            const q = queries[nextQuery++];
            for (let page = 1; page <= 3 && !signal.aborted; page++) {
              try {
                const parameters = new URLSearchParams({
                  q,
                  country: "NG",
                  timezone: "1",
                  sort: "recent",
                  page: String(page),
                });
                const data = await json(
                  `https://himalayas.app/jobs/api/search?${parameters}`,
                  signal,
                );
                if (!Array.isArray(data.jobs)) break;
                successful++;
                if (!data.jobs.length) break;
                pages.push(data.jobs);
              } catch {
                break;
              } // Keep earlier pages if a later page fails or is rate limited.
            }
          }
        }),
      );
      const jobs: Raw[] = [];
      for (const page of pages) {
        jobs.push(
          ...page.map((j: Record<string, unknown>): Raw => {
            const countries = Array.isArray(j.locationRestrictions)
              ? j.locationRestrictions.filter(
                  (s): s is string => typeof s === "string",
                )
              : undefined;
            return {
              title: string(j.title),
              company: string(j.companyName),
              // Himalayas documents an empty country list as worldwide, checked independently of timezones.
              location: countries
                ? countries.length
                  ? countries.join(", ")
                  : "Worldwide"
                : "Remote — location unspecified",
              countries,
              seniority: Array.isArray(j.seniority)
                ? j.seniority.filter((v): v is string => typeof v === "string")
                : typeof j.seniority === "string"
                  ? [j.seniority]
                  : [],
              employmentType: string(j.employmentType),
              timezones: Array.isArray(j.timezoneRestrictions)
                ? j.timezoneRestrictions.filter(
                    (v): v is number => typeof v === "number",
                  )
                : undefined,
              salary:
                j.minSalary && j.maxSalary
                  ? `${j.minSalary}–${j.maxSalary} ${string(j.currency)} ${string(j.salaryPeriod)}`.trim()
                  : "",
              description: plainText(string(j.description)),
              url: string(j.applicationLink),
              date: timestamp(j.pubDate),
              expiresAt: j.expiryDate ? timestamp(j.expiryDate) : undefined,
              source: "Himalayas",
            };
          }),
        );
      }
      if (!successful) throw new Error("Request failed or timed out");
      // Coverage remains bounded; absence from keyword searches does not prove a listing closed.
      return { jobs, partial: true };
    },
  },
  ...additionalJobAdapters,
];
export async function discover() {
  const failures: string[] = [];
  const successfulSources: string[] = [];
  const results = await Promise.allSettled(
    adapters.map((source) =>
      source.requiredEnv?.some((key) => !process.env[key]?.trim())
        ? Promise.resolve(null)
        : source.read(),
    ),
  );
  const jobs: Job[] = [];
  const reports: SourceReport[] = [];
  const seen = new Set<string>();
  results.forEach((result, index) => {
    const source = adapters[index].name;
    const report: SourceReport = {
      source,
      status: "ok",
      fetched: 0,
      accepted: 0,
      eligible: 0,
      review: 0,
      excluded: {
        role: 0,
        remote: 0,
        invalid: 0,
        age: 0,
        location: 0,
        duplicate: 0,
      },
    };
    reports.push(report);
    if (result.status === "rejected") {
      report.status = "error";
      // Never expose raw upstream response bodies or proxy credentials.
      report.error =
        result.reason instanceof Error &&
        /^HTTP \d{3}$|^Invalid response$/.test(result.reason.message)
          ? result.reason.message
          : "Request failed or timed out";
      failures.push(`${source} unavailable: ${report.error}`);
      return;
    }
    if (result.value === null) {
      report.status = "not_configured";
      report.error = `Needs ${adapters[index].requiredEnv?.join(", ")} in server settings.`;
      return;
    }
    if (result.value.boards) report.boards = result.value.boards;
    if (result.value.sourceError) {
      report.status = "error";
      report.error = result.value.sourceError;
      failures.push(`${source} unavailable: ${report.error}`);
      return;
    }
    successfulSources.push(source);
    report.status = result.value.partial ? "partial" : "ok";
    report.fetched = result.value.jobs.length;
    for (const j of result.value.jobs) {
      if (
        j.remote === false ||
        !fullyRemote(j.title, j.location, j.description)
      ) {
        report.excluded.remote++;
        continue;
      }
      if (!relevant(j.title, j.description)) {
        report.excluded.role++;
        continue;
      }
      if (
        j.employmentType === "Volunteer"
      ) {
        report.excluded.role++;
        continue;
      }
      let url: URL;
      try {
        url = new URL(j.url);
      } catch {
        report.excluded.invalid++;
        continue;
      }
      if (
        !j.company ||
        url.protocol !== "https:" ||
        url.username ||
        url.password
      ) {
        report.excluded.invalid++;
        continue;
      }
      const activeBoard =
        !!j.lastVerifiedAt &&
        ["Greenhouse", "Lever", "Ashby", "SmartRecruiters"].includes(source);
      const age = Date.now() - Date.parse(j.date);
      if (
        (!activeBoard &&
          (!Number.isFinite(age) || age < 0 || age > JOB_WINDOW_MS)) ||
        (Number.isFinite(age) && age < 0) ||
        (j.expiresAt && Date.parse(j.expiresAt) < Date.now())
      ) {
        report.excluded.age++;
        continue;
      }
      const eligible = classifyLocation(j.location, `${j.title} ${j.description}`, j.countries, j.timezones);
      if (eligible.eligibility === 'restricted') { report.excluded.location++; continue; }
      if (source === "Himalayas" && j.timezones === undefined) {
        eligible.eligibility = "review";
        eligible.eligibilityReason =
          "Country restrictions were checked, but timezone eligibility needs confirmation on the original posting.";
      }
      const key = jobIdentity(j);
      if (seen.has(key)) {
        report.excluded.duplicate++;
        continue;
      }
      seen.add(key);
      report.accepted++;
      report[eligible.eligibility]++;
      jobs.push({
        id: key,
        applicantCountries:j.countries,
        timezoneRestrictions:j.timezones,
        requisitionId:j.requisitionId,
        boardKey:j.boardKey,
        jobType:inferJobType(j.employmentType || j.title+" "+j.description),
        experienceLevel:inferExperience(j.seniority?.join(" ") || j.title),
        title: j.title,
        company: j.company,
        location: j.location,
        salary: j.salary,
        description: j.description.slice(0, 25000),
        url: j.url,
        postedAt: Number.isFinite(age) ? new Date(j.date).toISOString() : "",
        ...(activeBoard ? { lastVerifiedAt: j.lastVerifiedAt } : {}),
        source,
        discoveredAt: new Date().toISOString(),
        ...eligible,
        score: 0,
        matchedSkills: [],
        ...(j.expiresAt ? { expiresAt: j.expiresAt } : {}),
      });
    }
  });
  return {
    successfulSources,
    sources: reports,
    jobs: jobs.sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
    failures,
    checkedAt: new Date().toISOString(),
  };
}
