import { createHash } from "node:crypto";
import { eligibility, plainText, relevant } from "./matching";
import type { Job } from "./types";
type Raw = {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  url: string;
  date: string;
  source: string;
};
export async function discover() {
  const failures: string[] = [];
  const successfulSources: string[] = [];
  const sources = await Promise.allSettled([
    fetch("https://remotive.com/api/remote-jobs", {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "PersonalJobFinder/1.0" },
      cache: "no-store",
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data.jobs)) throw new Error("Invalid response");
      return data.jobs.map((j: Record<string, unknown>): Raw => ({
        title: String(j.title || ""),
        company: String(j.company_name || ""),
        location: String(j.candidate_required_location || ""),
        salary: String(j.salary || ""),
        description: plainText(String(j.description || "")),
        url: String(j.url || ""),
        date: String(j.publication_date || ""),
        source: "Remotive",
      }));
    }),
    fetch("https://www.arbeitnow.com/api/job-board-api", {
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data.data)) throw new Error("Invalid response");
      return data.data
        .filter((j: Record<string, unknown>) => j.remote === true)
        .map((j: Record<string, unknown>): Raw => ({
          title: String(j.title || ""),
          company: String(j.company_name || ""),
          location: String(j.location || ""),
          salary: "",
          description: plainText(String(j.description || "")),
          url: String(j.url || ""),
          date: new Date(Number(j.created_at) * 1000).toISOString(),
          source: "Arbeitnow",
        }));
    }),
  ]);
  const jobs: Job[] = [];
  const seen = new Set<string>();
  sources.forEach((result, i) => {
    if (result.status === "rejected") {
      failures.push(
        `${["Remotive", "Arbeitnow"][i]} unavailable: ${result.reason instanceof Error ? result.reason.message : "request failed"}`,
      );
      return;
    }
    successfulSources.push(["Remotive", "Arbeitnow"][i]);
    for (const j of result.value) {
      if (!relevant(j.title) || !j.company || !/^https:\/\//.test(j.url))
        continue;
      const age = Date.now() - Date.parse(j.date);
      if (!Number.isFinite(age) || age < -86400000 || age > 30 * 86400000)
        continue;
      const eligible = eligibility(j.location, j.description);
      if (!eligible) continue;
      const key = `${j.company.toLowerCase().trim()}|${j.title.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({
        id: createHash("sha256").update(key).digest("hex").slice(0, 24),
        title: j.title,
        company: j.company,
        location: j.location,
        salary: j.salary,
        description: j.description.slice(0, 25000),
        url: j.url,
        postedAt: new Date(j.date).toISOString(),
        source: j.source,
        discoveredAt: new Date().toISOString(),
        ...eligible,
        score: 0,
        matchedSkills: [],
      });
    }
  });
  return {
    successfulSources,
    jobs: jobs.sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
    failures,
    checkedAt: new Date().toISOString(),
  };
}
