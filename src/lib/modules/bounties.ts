import { createHash } from "node:crypto";
import type { Bounty, BountyAnalysis, TrackedBounty } from "./types";
import { githubIssue, httpsUrl, ModuleError, object, text } from "./validation";
import { providerJson } from "./http";
import { get, lease, list, put, OWNER } from "./store";
import { db } from "../db";
export function normalizeIssue(
  value: unknown,
  repository?: Record<string, unknown>,
  manual = false,
): Bounty {
  const issue = object(value);
  if (issue.pull_request)
    throw new ModuleError("Pull requests are not bounty issues.");
  const link = githubIssue(issue.html_url);
  const body = typeof issue.body === "string" ? issue.body.slice(0, 18000) : "";
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((v) =>
        typeof v === "string" ? v : String(object(v).name || ""),
      )
    : [];
  const assignees = Array.isArray(issue.assignees)
    ? issue.assignees
        .slice(0, 30)
        .map((v) => String(object(v).login || ""))
        .filter(Boolean)
    : [];
  const language =
    typeof repository?.language === "string" ? repository.language : "Unknown";
  const skills = [
    "React",
    "Next.js",
    "Angular",
    "JavaScript",
    "TypeScript",
    "Node.js",
    "Express",
    "MongoDB",
    "Firebase",
    "HTML",
    "CSS",
    "Tailwind",
    "PHP",
    "Laravel",
  ].filter((skill) =>
    `${issue.title} ${body} ${labels.join(" ")} ${language}`
      .toLowerCase()
      .includes(skill.toLowerCase()),
  );
  return {
    id: `github:${link.repository.toLowerCase()}:${link.number}`,
    title: String(issue.title || "Untitled issue").slice(0, 500),
    description: body,
    source: "GitHub",
    manual,
    url: link.url,
    issueUrl: link.url,
    repository: link.repository,
    organization: link.repository.split("/")[0],
    language,
    skills,
    status:
      issue.state === "closed"
        ? "completed"
        : assignees.length
          ? "claimed"
          : issue.state === "open"
            ? "open"
            : "unknown",
    publishedAt:
      typeof issue.created_at === "string" ? issue.created_at : undefined,
    updatedAt:
      typeof issue.updated_at === "string" ? issue.updated_at : undefined,
    checkedAt: new Date().toISOString(),
    sponsor: "Unknown — issue author is not necessarily a sponsor",
    assignees,
    comments: typeof issue.comments === "number" ? issue.comments : undefined,
    repositoryPushedAt:
      typeof repository?.pushed_at === "string"
        ? repository.pushed_at
        : undefined,
    rewardMention: `${issue.title} ${body}`.match(
      /(?:USD|EUR|GBP|NGN|\$|€|£)\s*[\d,.]+/i,
    )?.[0],
    difficulty: labels.some((l) => /good first issue|easy/i.test(l))
      ? "easy"
      : labels.some((l) => /hard|complex/i.test(l))
        ? "hard"
        : "unknown",
  };
}
export async function github(path: string) {
  const token = process.env.BOUNTY_GITHUB_TOKEN?.trim();
  return providerJson(
    `https://api.github.com${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
    "GitHub",
  );
}
export async function fetchIssue(url: string, manual = false) {
  const issue = githubIssue(url);
  const root = `/repos/${issue.repository.split("/").map(encodeURIComponent).join("/")}`;
  const [value, repository] = await Promise.all([
    github(`${root}/issues/${issue.number}`),
    github(root).catch(() => undefined),
  ]);
  if (repository && object(repository).private)
    throw new ModuleError("Only public bounty repositories are supported.");
  return normalizeIssue(
    value,
    repository ? object(repository) : undefined,
    manual,
  );
}
export function analyzeBounty(bounty: Bounty, skills: string): BountyAnalysis {
  const configured = skills
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const evidence =
    `${bounty.title} ${bounty.description} ${bounty.language} ${bounty.skills.join(" ")}`.toLowerCase();
  const matchedSkills = configured.filter((s) =>
    evidence.includes(s.toLowerCase()),
  );
  const criteria = [
    {
      label: "Skill compatibility",
      points: Math.round(
        40 *
          Math.min(
            1,
            matchedSkills.length / Math.max(1, Math.min(configured.length, 5)),
          ),
      ),
      maximum: 40,
      reason: configured.length
        ? `${matchedSkills.length} configured skills found in task metadata; not proof of ability.`
        : "Add your skills in My Profile.",
    },
    {
      label: "Availability",
      points: bounty.status === "open" ? 15 : 0,
      maximum: 15,
      reason: `Source status: ${bounty.status}. Assignees do not reveal every competitor.`,
    },
    {
      label: "Payment evidence",
      points: bounty.reward ? 20 : 0,
      maximum: 20,
      reason: bounty.reward
        ? "Owner recorded funding evidence. Recheck terms before starting; no payout guarantee."
        : "No funding confirmation. A money mention or label does not verify payment.",
    },
    {
      label: "Issue clarity",
      points:
        bounty.description.length > 500
          ? 10
          : bounty.description.length > 100
            ? 5
            : 0,
      maximum: 10,
      reason: "Description length only; acceptance criteria require review.",
    },
    {
      label: "Repository activity",
      points:
        bounty.repositoryPushedAt &&
        Date.now() - Date.parse(bounty.repositoryPushedAt) < 30 * 86400000
          ? 10
          : 0,
      maximum: 10,
      reason: bounty.repositoryPushedAt
        ? `Repository push: ${bounty.repositoryPushedAt}; maintainer responsiveness unknown.`
        : "No repository activity evidence available.",
    },
    {
      label: "Known assignment",
      points: bounty.assignees.length ? 0 : bounty.status === "open" ? 5 : 0,
      maximum: 5,
      reason: `${bounty.assignees.length} known assignees. Unassigned does not mean no competition.`,
    },
  ];
  return {
    score: criteria.reduce((sum, c) => sum + c.points, 0),
    confidence:
      bounty.checkedAt && bounty.description
        ? "Limited: metadata-based heuristic"
        : "Low: manual or incomplete evidence",
    matchedSkills,
    criteria,
    paymentRisk: bounty.reward
      ? "Owner-verified funding evidence; payout remains conditional. Verify sponsor, current funding and acceptance terms."
      : "HIGH — funding is unverified. Do not rely on the score as payment assurance.",
    eligibility:
      bounty.reward?.eligibility ||
      "Nigeria payout eligibility, fees and geographic restrictions are unverified. Ask the sponsor and payment provider.",
    generatedAt: new Date().toISOString(),
  };
}
export function deduplicateBounties(values: Bounty[]) {
  return [...new Map(values.map((b) => [b.id, b])).values()];
}
export async function persistBounty(bounty: Bounty, skills: string) {
  const existing = await get<Bounty>("bounties", bounty.id).catch((e) => {
    if (e instanceof ModuleError && e.status === 404) return undefined;
    throw e;
  });
  // Source refresh never overwrites user evidence or original manual provenance.
  const value = {
    ...bounty,
    ...(existing?.reward ? { reward: existing.reward } : {}),
    ...(existing?.manual
      ? { manual: true, source: existing.source, url: existing.url }
      : {}),
  };
  value.analysis = analyzeBounty(value, skills);
  await put("bounties", value);
  const database = await db();
  const tracked = await (await import("./store")).collection("tracked");
  const saved = await tracked.findOne({ owner: OWNER, bountyId: value.id });
  const settings = await get<{ highMatch: number }>(
    "settings",
    "preferences",
  ).catch(() => ({ highMatch: 65 }));
  if (
    (!existing && value.analysis.score >= settings.highMatch) ||
    (saved &&
      existing &&
      (existing.status !== value.status ||
        existing.updatedAt !== value.updatedAt))
  ) {
    const noticeId = `bounty:${createHash("sha256").update(`${value.id}:${value.updatedAt}:${value.status}`).digest("hex")}`;
    await database.collection("notifications").updateOne(
      { id: noticeId },
      {
        $setOnInsert: {
          id: noticeId,
          title: `${saved ? "Saved task updated" : "New bounty candidate"}: ${value.title}${value.reward ? "" : " (payment unverified)"}`,
          createdAt: new Date().toISOString(),
          read: false,
        },
      },
      { upsert: true },
    );
  }
  return value;
}
export async function discoverBounties(query: string, skills: string) {
  if (!(await lease("bounty-discovery", 120)))
    throw new ModuleError(
      "Discovery was recently requested. Wait two minutes before refreshing.",
      429,
    );
  let count = 0;
  const failures: string[] = [];
  const queries = [
    `is:public is:issue is:open label:bounty ${query}`,
    `is:public is:issue is:open label:reward ${query}`,
  ];
  const repositories = new Map<string, Record<string, unknown> | undefined>();
  for (const q of queries) {
    try {
      const result = object(
        await github(
          `/search/issues?${new URLSearchParams({ q, sort: "updated", order: "desc", per_page: "30" })}`,
        ),
      );
      const items = Array.isArray(result.items) ? result.items : [];
      const repoNames = [
        ...new Set(items.map((item) => normalizeIssue(item).repository)),
      ]
        .filter((name) => !repositories.has(name))
        .slice(0, 6);
      await Promise.allSettled(
        repoNames.map(async (name) => {
          const metadata = await github(
            `/repos/${name.split("/").map(encodeURIComponent).join("/")}`,
          )
            .then(object)
            .catch(() => undefined);
          repositories.set(name, metadata);
        }),
      );
      for (const item of items) {
        try {
          const initial = normalizeIssue(item);
          const repo = repositories.get(initial.repository);
          if (repo?.private) continue;
          await persistBounty(normalizeIssue(item, repo), skills);
          count++;
        } catch (e) {
          if (!(e instanceof ModuleError)) throw e;
        }
      }
      if (result.incomplete_results)
        failures.push(
          "GitHub search returned partial results. Narrow the query and retry.",
        );
    } catch (e) {
      failures.push(
        e instanceof ModuleError ? e.message : "Discovery storage unavailable.",
      );
      if (e instanceof ModuleError && e.status === 429) {
        await put("sources", {
          id: "github",
          name: "GitHub",
          mode: "Official API",
          message: e.message,
          retryAt: e.retryAt,
          checkedAt: new Date().toISOString(),
        } as { id: string });
        break;
      }
    }
  }
  await put("sources", {
    id: "github",
    name: "GitHub",
    mode: "Official API",
    message:
      failures.join(" ") ||
      `Checked ${count} candidates. Funding requires independent verification.`,
    checkedAt: new Date().toISOString(),
  } as { id: string });
  return { count, failures };
}
export async function importBounty(
  body: Record<string, unknown>,
  skills: string,
) {
  const url = httpsUrl(body.url, true, [
    "github.com",
    "algora.io",
    "www.algora.io",
    "issuehunt.io",
    "oss.issuehunt.io",
  ]);
  let bounty: Bounty;
  if (new URL(url).hostname === "github.com")
    bounty = await fetchIssue(url, true);
  else {
    const issueUrl =
      typeof body.issueUrl === "string" && body.issueUrl
        ? githubIssue(body.issueUrl).url
        : undefined;
    const source = new URL(url).hostname.includes("algora")
      ? "Algora"
      : "IssueHunt";
    if (issueUrl)
      bounty = { ...(await fetchIssue(issueUrl, true)), source, url };
    else
      bounty = {
        id: `manual:${createHash("sha256").update(url).digest("hex")}`,
        title: text(body.title, "task title", 500, true),
        description: text(body.description || "", "description", 18000),
        source,
        manual: true,
        url,
        repository: "Unknown",
        organization: "Unknown",
        language: "Unknown",
        skills: [],
        status: "unknown",
        sponsor: "Unverified",
        assignees: [],
        difficulty: "unknown",
      };
  }
  return persistBounty(bounty, skills);
}
export async function verifySavedBounties(skills: string) {
  const tracked = await list<TrackedBounty>("tracked");
  const result: string[] = [];
  await Promise.allSettled(
    tracked
      .filter(
        (t) => !["Paid", "Closed", "Rejected", "Cancelled"].includes(t.status),
      )
      .slice(0, 8)
      .map(async (item) => {
        try {
          const old = await get<Bounty>("bounties", item.bountyId);
          if (old.issueUrl)
            await persistBounty(
              await fetchIssue(old.issueUrl, old.manual),
              skills,
            );
        } catch (e) {
          result.push(
            e instanceof ModuleError ? e.message : "Saved bounty check failed.",
          );
        }
      }),
  );
  return result;
}

export {
  filterBounties,
  currencyTotals,
  bountyEarnings,
} from "./bounties-client";
