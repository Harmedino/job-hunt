export type JobPlatform = {
  name: string;
  url: string;
  docs: string;
  access: "public" | "api-key" | "employer-boards" | "manual";
  settings?: string[];
  note: string;
};
export const jobPlatforms: JobPlatform[] = [
  {
    name: "We Work Remotely",
    url: "https://weworkremotely.com/remote-jobs",
    docs: "https://weworkremotely.com/remote-jobs.rss",
    access: "public",
    note: "Official RSS. Location restrictions still apply.",
  },
  {
    name: "Remotive",
    url: "https://remotive.com",
    docs: "https://github.com/remotive-com/remote-jobs-api",
    access: "public",
    note: "Official API; public listings have a 24-hour delay.",
  },
  {
    name: "Arbeitnow",
    url: "https://www.arbeitnow.com",
    docs: "https://www.arbeitnow.com/api/job-board-api",
    access: "public",
    note: "Official API; many listings are restricted to Europe.",
  },
  {
    name: "Remote OK",
    url: "https://remoteok.com",
    docs: "https://remoteok.com/api",
    access: "public",
    note: "Public feed; links retain source attribution.",
  },
  {
    name: "Himalayas",
    url: "https://himalayas.app",
    docs: "https://himalayas.app/api",
    access: "public",
    note: "Official search API; country and timezone restrictions checked.",
  },
  {
    name: "Jobicy",
    url: "https://jobicy.com",
    docs: "https://jobicy.com/jobs-rss-feed",
    access: "public",
    note: "Official API; public listings have a 3-hour delay. Jobicy attribution retained.",
  },
  {
    name: "The Muse",
    url: "https://www.themuse.com",
    docs: "https://www.themuse.com/developers/api/v2",
    access: "public",
    note: "Official public jobs API. Remote and applicant-location restrictions remain checked.",
  },
  {
    name: "Get on Board",
    url: "https://www.getonbrd.com",
    docs: "https://getonbrd.com/api-doc.html",
    access: "public",
    note: "Official public API; many listings restrict applicants to Latin America.",
  },
  {
    name: "Remotely",
    url: "https://tryremotely.com",
    docs: "https://tryremotely.com/api",
    access: "public",
    note: "Official public API; remote does not imply worldwide eligibility.",
  },
  {
    name: "Remote First Jobs",
    url: "https://remotefirstjobs.com",
    docs: "https://remotefirstjobs.com/rss",
    access: "public",
    note: "Official React and cybersecurity RSS feeds; source links retained. No listings are submitted to third-party aggregators.",
  },
  {
    name: "Hacker News Jobs",
    url: "https://news.ycombinator.com/jobs",
    docs: "https://github.com/HackerNews/API",
    access: "public",
    note: "Official Firebase jobs API. Missing employer or publication evidence is never invented.",
  },
  {
    name: "Findwork",
    url: "https://findwork.dev",
    docs: "https://findwork.dev/developers/",
    access: "api-key",
    settings: ["FINDWORK_API_KEY"],
    note: "Official developer API; needs your own authorized token.",
  },
  {
    name: "Adzuna",
    url: "https://www.adzuna.com",
    docs: "https://developer.adzuna.com/docs/search",
    access: "api-key",
    settings: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
    note: "Official API; ADZUNA_COUNTRY chooses the publisher market, not applicant eligibility.",
  },
  {
    name: "Jooble",
    url: "https://jooble.org",
    docs: "https://jooble.org/api/about",
    access: "api-key",
    settings: ["JOOBLE_API_KEY"],
    note: "Official REST API. Use a key authorized for the configured country/domain.",
  },
  {
    name: "Reed",
    url: "https://www.reed.co.uk",
    docs: "https://www.reed.co.uk/developers/jobseeker",
    access: "api-key",
    settings: ["REED_API_KEY"],
    note: "Official Jobseeker API. UK-heavy results may not support Nigeria.",
  },
  {
    name: "USAJOBS",
    url: "https://www.usajobs.gov",
    docs: "https://developer.usajobs.gov/api-reference/get-api-search",
    access: "api-key",
    settings: ["USAJOBS_API_KEY", "USAJOBS_EMAIL"],
    note: "Official API; US citizenship/work authorization restrictions must be checked.",
  },
  {
    name: "Web3.career",
    url: "https://web3.career",
    docs: "https://web3.career/web3-jobs-api",
    access: "api-key",
    settings: ["WEB3_CAREER_TOKEN"],
    note: "Official jobs API; source links retained and remote filters applied.",
  },
  {
    name: "Careerjet",
    url: "https://www.careerjet.com.ng",
    docs: "https://www.careerjet.com/partners/api",
    access: "manual",
    note: "Partner API requires accurate per-request user IP, browser agent and referring page. Browse directly; background requests do not fabricate that context.",
  },
  {
    name: "ITJobs Portugal",
    url: "https://www.itjobs.pt",
    docs: "https://www.itjobs.pt/api/docs/job",
    access: "api-key",
    settings: ["ITJOBS_API_KEY"],
    note: "Official API; Portugal-based roles still need explicit remote/location checks.",
  },
  {
    name: "Greenhouse",
    url: "https://www.greenhouse.com",
    docs: "https://docs.greenhouse.io/job-board",
    access: "employer-boards",

    note: "Public employer boards discovered automatically. Optional GREENHOUSE_BOARDS adds company tokens. No API key required.",
  },
  {
    name: "Lever",
    url: "https://www.lever.co",
    docs: "https://github.com/lever/postings-api",
    access: "employer-boards",

    note: "Public employer boards discovered automatically. Optional LEVER_BOARDS adds tokens (eu:token for EU boards). Undated roles appear under Active public boards.",
  },
  {
    name: "Ashby",
    url: "https://www.ashbyhq.com",
    docs: "https://developers.ashbyhq.com/docs/public-job-posting-api",
    access: "employer-boards",

    note: "Public employer boards discovered automatically. Optional ASHBY_BOARDS adds company tokens. No API key required.",
  },
  {
    name: "SmartRecruiters",
    url: "https://www.smartrecruiters.com",
    docs: "https://developers.smartrecruiters.com/docs/posting-api",
    access: "employer-boards",

    note: "Public company postings discovered automatically, with paginated listings and full job details. Optional SMARTRECRUITERS_BOARDS adds company tokens.",
  },
  ...[
    ["LinkedIn", "https://www.linkedin.com/jobs/"],
    ["Indeed", "https://www.indeed.com/"],
    ["Wellfound", "https://wellfound.com/jobs"],
    ["Y Combinator", "https://www.ycombinator.com/jobs"],
    ["Welcome to the Jungle", "https://www.welcometothejungle.com/en/jobs"],
    ["FlexJobs", "https://www.flexjobs.com/"],
    ["Working Nomads", "https://www.workingnomads.com/jobs"],
    ["Jobberman Nigeria", "https://www.jobberman.com/jobs"],
    ["MyJobMag", "https://www.myjobmag.com/"],
    ["Hot Nigerian Jobs", "https://www.hotnigerianjobs.com/"],
  ].map(([name, url]) => ({
    name,
    url,
    docs: url,
    access: "manual" as const,
    note: "Open and search this platform directly. An authorized automatic search integration is not configured; it is not counted as a searched feed.",
  })),
];
export function platformEnabled(
  platform: JobPlatform,
  env: Record<string, string | undefined> = process.env,
) {
  return (
    platform.access !== "manual" &&
    (!platform.settings || platform.settings.every((key) => !!env[key]?.trim()))
  );
}
