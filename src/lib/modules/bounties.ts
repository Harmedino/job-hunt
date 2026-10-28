import { skillMention } from "../job-intelligence";
import { groupBountyAdvertisements } from "./bounty-opportunity";
import { createHash } from "node:crypto";
import type { Bounty, BountyAnalysis, TrackedBounty } from "./types";
import { githubIssue, httpsUrl, ModuleError, object, text } from "./validation";
import { providerJson } from "./http";
import { get, lease, list, put, OWNER } from "./store";
import { db } from "../db";
import {
  bountyClassification,
  hasFundingEvidence,
  paymentRisk,
  sourceRewardAnnouncement,
} from "./bounty-verification";
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
    "Python",
  ].filter((skill) =>
    skillMention(
      `${issue.title} ${body} ${labels.join(" ")} ${language}`,
      skill,
    ),
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
    labels,
    bountySignal:
      labels.some((l) => /bounty|reward|paid/i.test(l)) ||
      /\bbount(?:y|ies)\b|cash reward|\/bounty\b/i.test(
        `${issue.title} ${body}`,
      ),
    rewardAnnouncement: sourceRewardAnnouncement(
      String(issue.title || ""),
      body,
      ["OWNER", "MEMBER", "COLLABORATOR"].includes(
        String(issue.author_association),
      ) ||
        (typeof issue.user === "object" &&
          !!issue.user &&
          String(object(issue.user).login).toLowerCase() ===
            link.repository.split("/")[0].toLowerCase()),
      typeof issue.user === "object" && issue.user
        ? String(object(issue.user).login || "Unknown")
        : "Unknown",
      link.url,
    ),
    difficulty: labels.some((l) => /good first issue|easy/i.test(l))
      ? "easy"
      : labels.some((l) => /hard|complex/i.test(l))
        ? "hard"
        : "unknown",
  };
}
export async function github(path: string, timeoutMs = 6000) {
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
    timeoutMs,
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
  const matchedSkills = configured.filter(
    (s) =>
      skillMention(evidence, s) ||
      (s.toLowerCase() === "express.js" && skillMention(evidence, "Express")) ||
      (s.toLowerCase() === "tailwind css" &&
        skillMention(evidence, "Tailwind")),
  );
  const criteria = [
    {
      label: "Skill compatibility",
      points: Math.round(
        60 *
          Math.min(
            1,
            matchedSkills.length / Math.max(1, Math.min(configured.length, 5)),
          ),
      ),
      maximum: 60,
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
    paymentRisk: paymentRisk(bounty),
    eligibility:
      bounty.reward?.eligibility ||
      "Nigeria payout eligibility, fees and geographic restrictions are unverified. Ask the sponsor and payment provider.",
    generatedAt: new Date().toISOString(),
  };
}
export function deduplicateBounties(values: Bounty[]) {
  return groupBountyAdvertisements(values);
}
export async function persistBounty(bounty: Bounty, skills: string) {
  const existing = await get<Bounty>("bounties", bounty.id).catch((e) => {
    if (e instanceof ModuleError && e.status === 404) return undefined;
    throw e;
  });
  // Source refresh never overwrites user evidence or original manual provenance.
  const value = {
    ...existing,
    ...bounty,
    ...(existing?.reward ? { reward: existing.reward } : {}),
    ...(existing?.manual
      ? { manual: true, source: existing.source, url: existing.url }
      : {}),
  };
  value.advertisements = groupBountyAdvertisements([
    ...(existing ? [existing] : []),
    bounty,
  ])[0]?.advertisements;
  value.analysis = analyzeBounty(value, skills);
  if (
    existing?.updatedAt === value.updatedAt &&
    existing?.description === value.description &&
    existing?.status === value.status &&
    JSON.stringify(existing?.reward) === JSON.stringify(value.reward) &&
    existing?.analysis?.ai
  ) {
    value.analysis.ai = existing.analysis.ai;
  }
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
        existing.updatedAt !== value.updatedAt ||
        JSON.stringify(existing.rewardAnnouncement) !==
          JSON.stringify(value.rewardAnnouncement) ||
        existing.maintainerResponseAt !== value.maintainerResponseAt ||
        JSON.stringify(existing.linkedPullRequests) !==
          JSON.stringify(value.linkedPullRequests)))
  ) {
    const changedMergedPr = value.linkedPullRequests?.find(
      (pr) =>
        pr.state === "merged" &&
        pr.url !== saved?.submissionUrl &&
        !existing?.linkedPullRequests?.some(
          (old) => old.url === pr.url && old.state === "merged",
        ),
    );
    const noticeId = `bounty:${createHash("sha256")
      .update(
        JSON.stringify([
          value.id,
          value.updatedAt,
          value.status,
          value.rewardAnnouncement,
          value.maintainerResponseAt,
          value.linkedPullRequests,
        ]),
      )
      .digest("hex")}`;
    await database.collection("notifications").updateOne(
      { id: noticeId },
      {
        $setOnInsert: {
          id: noticeId,
          title: `${changedMergedPr ? "Another linked PR merged — review task availability" : saved ? "Saved task updated" : "New bounty candidate"}: ${value.title}${hasFundingEvidence(value) ? "" : " (payment unverified)"}`,
          createdAt: new Date().toISOString(),
          read: false,
        },
      },
      { upsert: true },
    );
  }
  return value;
}
export function bountyQueries(query: string) {
  const clean = query.replace(/\b(?:is|state|type):\S+/gi, "").trim();
  const qualifiers = clean.match(/(?:repo|org|user|language):[^\s]+/gi) || [];
  const suppliedTerms = clean
    .replace(/(?:repo|org|user|language):[^\s]+/gi, "")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .slice(0, 6);
  const terms = suppliedTerms.length
    ? suppliedTerms
    : qualifiers.length
      ? []
      : ["React", "TypeScript", "Node.js", "Angular", "JavaScript", "Express"];
  return [
    "label:bounty",
    "bounty",
    '"reward"',
    '"paid"',
    '"cash reward"',
    '"/bounty"',
  ].map((signal, i) =>
    `is:public is:issue is:open ${signal} ${qualifiers.join(" ")} ${terms.length ? terms[i % terms.length] : ""}`.trim(),
  );
}
export async function collectBountyCandidates(
  query: string,
  request = github,
  maxRequests = process.env.BOUNTY_GITHUB_TOKEN ? 12 : 8,
) {
  const diagnostics: NonNullable<import("./types").SourceState["diagnostics"]> =
    {
      queries: [],
      raw: 0,
      duplicates: 0,
      saved: 0,
      rejected: 0,
      classifications: {},
      bounded: false,
    };
  const unique = new Map<string, unknown>();
  const failures: string[] = [];
  const queries = bountyQueries(query);
  const exhausted = new Set<string>();
  const start = Date.now();
  let retryAt: string | undefined;
  outer: for (let page = 1; page <= 2; page++) {
    for (const q of queries) {
      if (exhausted.has(q)) continue;
      if (
        diagnostics.queries.length >= maxRequests ||
        Date.now() - start > 22000
      ) {
        diagnostics.bounded = true;
        break outer;
      }
      try {
        const result = object(
          await request(
            `/search/issues?${new URLSearchParams({ q, sort: "updated", order: "desc", per_page: "30", page: String(page) })}`,
          ),
        );
        if (!Array.isArray(result.items))
          throw new ModuleError(
            "GitHub returned an invalid search response.",
            502,
          );
        diagnostics.queries.push({
          query: q,
          page,
          returned: result.items.length,
          success: true,
        });
        diagnostics.raw += result.items.length;
        if (result.items.length < 30) exhausted.add(q);
        if (result.incomplete_results) {
          diagnostics.bounded = true;
          failures.push("GitHub returned partial search results.");
        }
        for (const item of result.items) {
          try {
            const b = normalizeIssue(item);
            if (unique.has(b.id)) diagnostics.duplicates++;
            else unique.set(b.id, item);
          } catch {
            diagnostics.rejected++;
          }
        }
      } catch (error) {
        const message =
          error instanceof ModuleError
            ? error.message
            : "GitHub search unavailable.";
        diagnostics.queries.push({
          query: q,
          page,
          returned: 0,
          success: false,
          error: message,
        });
        failures.push(message);
        if (error instanceof ModuleError && error.status === 429) {
          retryAt = error.retryAt;
          diagnostics.bounded = true;
          break outer;
        }
      }
    }
  }
  return {
    items: [...unique.values()],
    diagnostics,
    failures: [...new Set(failures)],
    retryAt,
  };
}
export async function discoverBounties(query: string, skills: string) {
  if (!(await lease("bounty-discovery", 120)))
    throw new ModuleError(
      "Discovery was recently requested. Wait two minutes before refreshing.",
      429,
    );
  const previous = await get<import("./types").SourceState>(
    "sources",
    "github",
  ).catch(() => undefined);
  if (previous?.retryAt && Date.parse(previous.retryAt) > Date.now())
    throw new ModuleError(
      "GitHub is in its recorded rate-limit cooldown.",
      429,
      previous.retryAt,
    );
  const { items, diagnostics, failures, retryAt } =
    await collectBountyCandidates(query);
  const repositories = new Map<string, Record<string, unknown>>();
  const names = [
    ...new Set(items.map((item) => normalizeIssue(item).repository)),
  ].slice(0, 6);
  await Promise.allSettled(
    names.map(async (name) => {
      try {
        repositories.set(
          name,
          object(
            await github(
              `/repos/${name.split("/").map(encodeURIComponent).join("/")}`,
            ),
          ),
        );
      } catch {
        /* Optional language metadata; preserve the issue. */
      }
    }),
  );
  let commentsChecked = 0;
  for (let offset = 0; offset < items.length; offset += 5) {
    await Promise.all(
      items.slice(offset, offset + 5).map(async (item) => {
        const initial = normalizeIssue(item);
        const repo = repositories.get(initial.repository);
        if (repo?.private) {
          diagnostics.rejected++;
          return;
        }
        let candidate = normalizeIssue(item, repo);
        if (
          !candidate.rewardAnnouncement &&
          candidate.comments &&
          commentsChecked++ < 6
        ) {
          try {
            candidate = await enrichRewardFromComments(candidate);
          } catch {
            /* Preserve an unverified signal; no funding is inferred. */
          }
        }
        const saved = await persistBounty(candidate, skills);
        diagnostics.saved++;
        const classification = bountyClassification(saved);
        diagnostics.classifications[classification] =
          (diagnostics.classifications[classification] || 0) + 1;
      }),
    );
  }
  const success = diagnostics.queries.some((q) => q.success);
  await put("sources", {
    id: "github",
    name: "GitHub",
    mode: "Official API",
    success,
    message: `${diagnostics.raw} raw results; ${diagnostics.duplicates} duplicates; ${diagnostics.saved} unique tasks saved. ${failures.join(" ")}${diagnostics.bounded ? " Bounded or partial search; narrow keywords for more coverage." : ""}`,
    checkedAt: new Date().toISOString(),
    retryAt,
    lastSuccessAt: success ? new Date().toISOString() : previous?.lastSuccessAt,
    diagnostics,
  });
  return { count: diagnostics.saved, failures, diagnostics };
}
export async function importBounty(
  body: Record<string, unknown>,
  skills: string,
) {
  const url = httpsUrl(body.url, true, [
    "github.com",
    "algora.io",
    "www.algora.io",
    "opire.dev",
    "www.opire.dev",
    "issuehunt.io",
    "oss.issuehunt.io",
  ]);
  let bounty: Bounty;
  if (new URL(url).hostname === "github.com") {
    try {
      bounty = await fetchIssue(url, true);
    } catch (error) {
      if (
        !(error instanceof ModuleError) ||
        error.message === "Only public bounty repositories are supported."
      )
        throw error;
      const origin = githubIssue(url);
      bounty = {
        id: `github:${origin.repository.toLowerCase()}:${origin.number}`,
        title: text(body.title, "task title", 500, true),
        description: text(body.description || "", "description", 18000),
        source: "GitHub",
        manual: true,
        url: origin.url,
        issueUrl: origin.url,
        repository: origin.repository,
        organization: origin.repository.split("/")[0],
        language: "Unknown",
        skills: [],
        status: "unknown",
        sponsor: "Unverified",
        assignees: [],
        difficulty: "unknown",
        bountySignal: false,
      };
    }
  } else {
    const issueUrl =
      typeof body.issueUrl === "string" && body.issueUrl
        ? githubIssue(body.issueUrl).url
        : undefined;
    const source = new URL(url).hostname.includes("algora")
      ? "Algora"
      : new URL(url).hostname.includes("opire")
        ? "Opire"
        : "IssueHunt";
    if (issueUrl) {
      try {
        bounty = { ...(await fetchIssue(issueUrl, true)), source, url };
      } catch (error) {
        if (
          !(error instanceof ModuleError) ||
          error.message === "Only public bounty repositories are supported."
        )
          throw error;
        const origin = githubIssue(issueUrl);
        bounty = {
          id: `github:${origin.repository.toLowerCase()}:${origin.number}`,
          title: text(body.title, "task title", 500, true),
          description: text(body.description || "", "description", 18000),
          source,
          manual: true,
          url,
          issueUrl: origin.url,
          repository: origin.repository,
          organization: origin.repository.split("/")[0],
          language: "Unknown",
          skills: [],
          status: "unknown",
          sponsor: "Unverified",
          assignees: [],
          difficulty: "unknown",
          bountySignal: true,
        };
      }
    } else
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
        bountySignal: true,
      };
  }
  if (body.rewardAdvertised === true) {
    if (body.announcementConfirmed !== true)
      throw new ModuleError(
        "Confirm that a maintainer or recognized provider advertised this exact task reward.",
      );
    const advertised = (await import("./validation")).money(
      body.amount,
      body.currency,
    );
    bounty.rewardAnnouncement = {
      reward: advertised,
      announcedBy: text(body.announcedBy, "reward publisher", 300, true),
      evidenceUrl:
        typeof body.rewardEvidenceUrl === "string"
          ? httpsUrl(body.rewardEvidenceUrl, true)
          : url,
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
              await (
                await import("./bounty-repository")
              ).inspectIssueActivity(
                await fetchIssue(old.issueUrl, old.manual),
              ),
              skills,
            );
          if (item.submissionUrl)
            await (
              await import("./bounty-repository")
            ).syncTrackedPullRequest(item);
          if (
            item.status === "Reward Claimed" &&
            item.claimDate &&
            Date.now() - Date.parse(item.claimDate) > 14 * 86400000
          ) {
            const noticeId = `bounty-claim:${item.bountyId}:${item.claimDate}`;
            await (await db()).collection("notifications").updateOne(
              { id: noticeId },
              {
                $setOnInsert: {
                  id: noticeId,
                  title: `Payment claim needs attention: ${old.title}`,
                  createdAt: new Date().toISOString(),
                  read: false,
                },
              },
              { upsert: true },
            );
          }
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

export async function enrichRewardFromComments(
  bounty: Bounty,
  read: (path: string) => Promise<unknown> = (path) => github(path, 2500),
): Promise<Bounty> {
  if (!bounty.issueUrl) return bounty;
  const issue = githubIssue(bounty.issueUrl),
    comments = await read(
      `/repos/${issue.repository.split("/").map(encodeURIComponent).join("/")}/issues/${issue.number}/comments?per_page=30`,
    );
  if (!Array.isArray(comments)) return bounty;
  for (const value of comments) {
    const comment = object(value),
      url = String(comment.html_url || "");
    if (!url.startsWith(issue.url + "#issuecomment-")) continue;
    const user =
      comment.user && typeof comment.user === "object"
        ? object(comment.user)
        : {};
    const announcement = sourceRewardAnnouncement(
      "",
      String(comment.body || ""),
      ["OWNER", "MEMBER", "COLLABORATOR"].includes(
        String(comment.author_association),
      ),
      String(user.login || "Unknown"),
      url,
    );
    if (announcement) return { ...bounty, rewardAnnouncement: announcement };
  }
  return bounty;
}
