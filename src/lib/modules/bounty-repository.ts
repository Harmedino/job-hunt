import { github } from "./bounties";
import { githubIssue, ModuleError, object } from "./validation";
import type { Bounty, TrackedBounty } from "./types";
import { get, put, OWNER } from "./store";
import { db } from "../db";
import { createHash } from "node:crypto";
type Reader = (path: string) => Promise<unknown>;
export async function inspectBountyRepository(
  bounty: Bounty,
  read: Reader = (path) => github(path, 2000),
): Promise<NonNullable<Bounty["repositoryEvidence"]>> {
  const evidence: NonNullable<Bounty["repositoryEvidence"]> = {
    checkedAt: new Date().toISOString(),
    scope: "Issue metadata only; repository files not inspected.",
    files: [],
    rootFiles: [],
    warnings: [],
  };
  if (!bounty.issueUrl) {
    evidence.warnings.push(
      "Link an original public GitHub issue to inspect repository evidence.",
    );
    return evidence;
  }
  const deadline = Date.now() + 15000;
  const issue = githubIssue(bounty.issueUrl),
    root =
      "/repos/" + issue.repository.split("/").map(encodeURIComponent).join("/");
  try {
    const repo = object(await read(root));
    if (repo.private !== false)
      throw new ModuleError(
        "Public repository status was not confirmed; no code was inspected.",
      );
    evidence.branch =
      typeof repo.default_branch === "string" ? repo.default_branch : undefined;
    const entries = await read(root + "/contents");
    if (!Array.isArray(entries))
      throw new ModuleError("Repository directory listing unavailable.");
    evidence.rootFiles = entries
      .slice(0, 100)
      .map((row) => String(object(row).path || ""));
    const named = [
      ...bounty.description.matchAll(
        /(?:^|[\s`(])((?:src|app|lib|test|tests|packages)\/[\w./-]+\.(?:tsx?|jsx?|json|md|css))/g,
      ),
    ].map((m) => m[1]);
    const candidates = [
      ...evidence.rootFiles.filter((path) =>
        /^(?:CONTRIBUTING(?:\.md)?|package\.json|README\.md)$/i.test(path),
      ),
      ...named,
    ]
      .filter(
        (path) =>
          !path.includes("..") &&
          !path.startsWith("/") &&
          !/\.env|secret|credential/i.test(path),
      )
      .slice(0, 4);
    for (const path of [...new Set(candidates)]) {
      if (Date.now() > deadline) {
        evidence.warnings.push("Repository inspection time budget reached.");
        break;
      }
      try {
        const file = object(
          await read(
            root +
              "/contents/" +
              path.split("/").map(encodeURIComponent).join("/"),
          ),
        );
        if (
          file.type !== "file" ||
          file.encoding !== "base64" ||
          typeof file.content !== "string" ||
          Number(file.size) > 80000
        )
          continue;
        const url =
          typeof file.html_url === "string" &&
          file.html_url.startsWith("https://github.com/")
            ? file.html_url
            : "";
        evidence.files.push({
          path,
          url,
          excerpt: Buffer.from(file.content, "base64")
            .toString("utf8")
            .slice(0, 9000),
        });
      } catch {
        evidence.warnings.push(`Could not inspect ${path}.`);
      }
    }
    const testDirectory = evidence.rootFiles.find((path) =>
      /^(?:test|tests|__tests__)$/i.test(path),
    );
    if (testDirectory && Date.now() < deadline) {
      try {
        const tests = await read(
          root + "/contents/" + encodeURIComponent(testDirectory),
        );
        if (Array.isArray(tests))
          evidence.rootFiles.push(
            ...tests.slice(0, 30).map((row) => String(object(row).path || "")),
          );
      } catch {
        evidence.warnings.push(
          "Test directory was identified but not inspected.",
        );
      }
    }
    evidence.scope = evidence.files.length
      ? `Inspected ${evidence.files.length} bounded public file excerpts and the root directory. This is not a complete code or test review.`
      : "Root directory observed; no repository code excerpts were retrieved.";
  } catch (error) {
    evidence.warnings.push(
      error instanceof ModuleError
        ? error.message
        : "Repository access failed. No code inspection is claimed.",
    );
  }
  return evidence;
}
export async function inspectIssueActivity(
  bounty: Bounty,
  read: Reader = github,
) {
  if (!bounty.issueUrl) return bounty;
  const issue = githubIssue(bounty.issueUrl),
    root =
      "/repos/" + issue.repository.split("/").map(encodeURIComponent).join("/");
  let linked: Bounty["linkedPullRequests"] | undefined,
    response: string | undefined;
  const checks = await Promise.allSettled([
    read(`${root}/issues/${issue.number}/timeline?per_page=30`),
    read(`${root}/issues/${issue.number}/comments?per_page=30`),
  ]);
  if (checks[0].status === "fulfilled" && Array.isArray(checks[0].value)) {
    linked = checks[0].value
      .flatMap((row) => {
        const event = object(row),
          source =
            event.source && typeof event.source === "object"
              ? object(event.source)
              : {},
          item =
            source.issue && typeof source.issue === "object"
              ? object(source.issue)
              : {};
        return item.pull_request && typeof item.html_url === "string"
          ? [
              {
                url: item.html_url,
                state:
                  typeof item.pull_request === "object" &&
                  object(item.pull_request).merged_at
                    ? "merged"
                    : String(item.state || "unknown"),
                title: String(item.title || ""),
              },
            ]
          : [];
      })
      .filter(
        (pr, i, all) => all.findIndex((other) => other.url === pr.url) === i,
      );
  }
  if (checks[1].status === "fulfilled" && Array.isArray(checks[1].value)) {
    response = checks[1].value
      .filter((row) =>
        ["OWNER", "MEMBER", "COLLABORATOR"].includes(
          String(object(row).author_association),
        ),
      )
      .map((row) => String(object(row).created_at || ""))
      .filter((date) => Number.isFinite(Date.parse(date)))
      .sort()
      .at(-1);
  }
  return {
    ...bounty,
    ...(linked ? { linkedPullRequests: linked } : {}),
    ...(response ? { maintainerResponseAt: response } : {}),
  };
}
export async function syncTrackedPullRequest(
  tracked: TrackedBounty,
  read: Reader = github,
) {
  if (!tracked.submissionUrl) return tracked;
  const bounty = await get<Bounty>("bounties", tracked.bountyId);
  const url = new URL(tracked.submissionUrl),
    match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
  if (
    url.hostname !== "github.com" ||
    !match ||
    `${match[1]}/${match[2]}`.toLowerCase() !== bounty.repository.toLowerCase()
  )
    throw new ModuleError(
      "Use a public pull request targeting this bounty repository.",
    );
  const root =
    "/repos/" + [match[1], match[2]].map(encodeURIComponent).join("/");
  const repo = object(await read(root));
  if (repo.private !== false)
    throw new ModuleError("Public repository status was not confirmed.");
  const pull = object(await read(`${root}/pulls/${match[3]}`));
  let reviewStatus = pull.merged_at
    ? "Merged"
    : pull.state === "closed"
      ? "Closed without merge"
      : pull.draft
        ? "Draft PR"
        : "Open PR";
  if (!pull.merged_at && pull.state === "open") {
    try {
      const reviews = await read(
        `${root}/pulls/${match[3]}/reviews?per_page=30`,
      );
      if (Array.isArray(reviews)) {
        const byReviewer = new Map<string, string>();
        for (const row of reviews) {
          const review = object(row),
            user =
              review.user && typeof review.user === "object"
                ? object(review.user)
                : {};
          if (
            user.login &&
            ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(
              String(review.state),
            )
          )
            byReviewer.set(String(user.login), String(review.state));
        }
        if ([...byReviewer.values()].includes("CHANGES_REQUESTED"))
          reviewStatus = "Changes requested";
        else if ([...byReviewer.values()].includes("APPROVED"))
          reviewStatus = "Approved review observed";
      }
    } catch {
      /* Open state remains observed; no review outcome is invented. */
    }
  }
  const updated = {
    ...tracked,
    reviewStatus,
    prSourceUpdatedAt: String(pull.updated_at || ""),
    prCheckedAt: new Date().toISOString(),
    ...(pull.merged_at &&
    !["Paid", "Rejected", "Cancelled", "Closed"].includes(tracked.status)
      ? { status: "Merged" as const }
      : {}),
  };
  await put("tracked", updated);
  if (
    tracked.prSourceUpdatedAt !== updated.prSourceUpdatedAt ||
    tracked.reviewStatus !== reviewStatus
  ) {
    const id =
      "bounty-pr:" +
      createHash("sha256")
        .update(
          JSON.stringify([
            tracked.bountyId,
            tracked.submissionUrl,
            updated.prSourceUpdatedAt,
            reviewStatus,
          ]),
        )
        .digest("hex");
    await (await db()).collection("notifications").updateOne(
      { id },
      {
        $setOnInsert: {
          id,
          owner: OWNER,
          title: `PR status: ${reviewStatus} · ${bounty.title}. Merge does not establish payment.`,
          createdAt: updated.prCheckedAt,
          read: false,
        },
      },
      { upsert: true },
    );
  }
  return updated;
}
