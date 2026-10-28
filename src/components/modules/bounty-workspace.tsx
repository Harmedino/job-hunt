"use client";
import { useEffect, useRef, useMemo, useState } from "react";
import BountyEvidence from "./bounty-evidence";
import {
  groupBountyAdvertisements,
  bountySections,
  bountySection,
  bountyOpportunity,
  bountyIsHandled,
} from "@/lib/modules/bounty-opportunity";
import { BountyDiagnostics } from "./bounty-diagnostics";
import {
  bountyClassification,
  fundingStatus,
  fundingStatuses,
  opportunityReward,
  paymentRisk,
} from "@/lib/modules/bounty-verification";
import { bountyEmptyReason } from "@/lib/modules/bounties-client";
import {
  paymentNgnEstimates,
  bountyEarnings,
  filterBounties,
  hasFundingEvidence,
  type BountyFilters,
} from "@/lib/modules/bounties-client";
import {
  workStatuses,
  type Bounty,
  type TrackedBounty,
} from "@/lib/modules/types";
import {
  Copy,
  Empty,
  Feedback,
  Field,
  fields,
  LinkOut,
  moduleRequest,
  Pages,
  Pretty,
  Section,
  Select,
  useWorkspace,
} from "./shared";
export default function BountyWorkspace({
  openProfile,
}: {
  openProfile: () => void;
}) {
  const w = useWorkspace();
  const [view, setView] = useState("Discover");
  const [filters, setFilters] = useState<BountyFilters>({});
  const [page, setPage] = useState(0);
  const [filterVersion, setFilterVersion] = useState(0);
  const preferencesLoaded = useRef(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const data = w.data;
  useEffect(() => {
    if (!data || preferencesLoaded.current) return;
    preferencesLoaded.current = true;
    const timer = setTimeout(() => {
      if (data.settings.bountyFilters) {
        setFilters(data.settings.bountyFilters);
        setFilterVersion((v) => v + 1);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [data]);
  const selected = data?.bounties.find(
    (b) => b.id === selectedId || b.aliasIds?.includes(selectedId),
  );
  const results = useMemo(
    () =>
      filterBounties(data?.bounties || [], filters, data?.tracked || []).filter(
        (b) => view !== "Ready" || !hasFundingEvidence(b),
      ),
    [data?.bounties, data?.tracked, filters, view],
  );
  const earnings = bountyEarnings(
    data?.bounties || [],
    data?.tracked || [],
    data?.payments || [],
  );
  const track = (b: Bounty, status: string) =>
    w.save("tracked", {
      ...(data?.tracked.find(
        (t) => t.bountyId === b.id || b.aliasIds?.includes(t.bountyId),
      ) || {}),
      bountyId:
        data?.tracked.find(
          (t) => t.bountyId === b.id || b.aliasIds?.includes(t.bountyId),
        )?.bountyId || b.id,
      status,
      archived: false,
    });
  return (
    <div className="module-workspace">
      <div className="module-tabs" aria-label="Bounty views">
        {[
          "Discover",
          "Ready",
          "Saved",
          "Working",
          "Submitted",
          "Payment",
          "Earnings",
          "Tracker",
          "Settings",
        ].map((v) => (
          <button
            className={view === v ? "primary" : "secondary"}
            key={v}
            onClick={() => {
              setView(v);
              if (v === "Ready")
                setFilters((old) => ({
                  ...old,
                  verification: "All paid or potentially paid",
                }));
            }}
          >
            {
              {
                Discover: "Find Paid Tasks",
                Ready: "Ready to Verify",
                Saved: "Saved Opportunities",
                Working: "In Progress",
                Submitted: "Submitted PRs",
                Payment: "Awaiting Payment",
                Earnings: "Earnings History",
                Tracker: "Full Tracker",
                Settings: "Settings",
              }[v]
            }
          </button>
        ))}
      </div>
      <Feedback busy={w.busy} message={w.message} warning={data?.warning} />
      {!data && <Empty>Loading bounty workspace…</Empty>}
      <p className="module-note">
        Matching uses My Profile skills, or the supplied development skill
        defaults when blank. Real source issues. Payment, sponsor and Nigeria
        payout eligibility require evidence. A match score is not a payment
        guarantee.{" "}
        <button className="text-button" onClick={openProfile}>
          Edit matching skills in My Profile
        </button>
      </p>
      {["Discover", "Ready"].includes(view) && (
        <>
          <Section title="Find paid coding opportunities">
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e.currentTarget);
                void w.run(
                  "Checking GitHub",
                  async () => {
                    const result = await moduleRequest<{
                      count: number;
                      failures: string[];
                    }>("bounties/discover", { query: f.query });
                    w.setMessage(
                      result.failures.join(" ") ||
                        `Saved ${result.count} unique source tasks. Advertised rewards remain separate from confirmed funding; review each task before coding.`,
                    );
                  },
                  true,
                );
              }}
            >
              <Field
                label="GitHub search keywords"
                name="query"
                placeholder="React TypeScript or repo:owner/repository"
                value={data?.settings.bountyQuery}
              />
              <button
                className="primary"
                disabled={!!w.busy || !data?.storageAvailable}
              >
                Refresh opportunities
              </button>
            </form>
            <p>
              GitHub uses its official API.{" "}
              {data?.configured.github
                ? "Read-only token configured."
                : "Public access uses GitHub’s lower anonymous rate limit; optionally configure BOUNTY_GITHUB_TOKEN."}
            </p>
            <details>
              <summary>Source connection details</summary>
              {data?.sources.map((s) => (
                <p key={s.id}>
                  <b>{s.name}:</b> {s.message}{" "}
                  {s.checkedAt && (
                    <small>
                      Checked{" "}
                      {new Date(s.checkedAt).toLocaleString("en-NG", {
                        timeZone: "Africa/Lagos",
                        timeZoneName: "short",
                      })}
                    </small>
                  )}
                </p>
              ))}
            </details>
            <details>
              <summary>Provider browsing and current scope</summary>
              <p>
                <LinkOut url="https://opire.dev">Opire</LinkOut> advertises
                coding rewards; its published workflow arranges each sponsor
                payment after approval. A reward is not automatically deposited
                funding.
              </p>
              <p>
                <LinkOut url="https://algora.io">Algora</LinkOut> currently
                emphasizes open-source engineer hiring on its public homepage.
                Confirm a live task-specific coding reward before importing.
              </p>
              <p>
                <LinkOut url="https://issuehunt.io">IssueHunt</LinkOut>{" "}
                currently focuses on security bug-bounty programs. Advanced
                vulnerability research is outside your preferred coding scope;
                import only a suitable task with explicit reward evidence.
              </p>
            </details>
            <details>
              <summary>
                Import an Algora, Opire, IssueHunt or GitHub task URL
              </summary>
              <p>
                Algora, Opire and IssueHunt use manual import until an
                authorized API can be verified. Imports are labeled manually
                submitted. Linking a GitHub issue enables official issue-status
                checks; it does not confirm funding.
              </p>
              <form
                className="module-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void w.run(
                    "Importing task",
                    () =>
                      moduleRequest("bounties/import", {
                        ...fields(e.currentTarget),
                        rewardAdvertised:
                          fields(e.currentTarget).rewardAdvertised === "on",
                        announcementConfirmed:
                          fields(e.currentTarget).announcementConfirmed ===
                          "on",
                      }),
                    true,
                  );
                }}
              >
                <Field
                  label="Original task URL"
                  name="url"
                  required
                  type="url"
                />
                <Field
                  label="Linked GitHub issue URL (optional)"
                  name="issueUrl"
                  type="url"
                />
                <Field
                  label="Task title (required without GitHub issue)"
                  name="title"
                />
                <Field label="Description" name="description" multiline />
                <details>
                  <summary>Optional advertised reward evidence</summary>
                  <p>
                    This records a published reward promise, not secured
                    funding.
                  </p>
                  <label>
                    <input type="checkbox" name="rewardAdvertised" /> An
                    explicit task reward is advertised
                  </label>
                  <Field label="Advertised amount" name="amount" />
                  <Field label="Advertised ISO currency" name="currency" />
                  <Field
                    label="Maintainer or provider advertising it"
                    name="announcedBy"
                  />
                  <Field
                    label="Published reward evidence URL"
                    name="rewardEvidenceUrl"
                    type="url"
                  />
                  <label>
                    <input type="checkbox" name="announcementConfirmed" /> I
                    checked that the maintainer/provider advertises this exact
                    issue reward.
                  </label>
                </details>
                <button
                  className="primary"
                  disabled={!!w.busy || !data?.storageAvailable}
                >
                  Import task
                </button>
              </form>
            </details>
          </Section>
          <Section title="Filter candidates">
            <p>
              The default includes advertised and potentially paid tasks, each
              with its actual evidence label. Verified Funded still requires
              current task-specific authoritative funding proof; it expires
              after seven days. Unpaid work stays hidden unless explicitly
              selected. No payout is guaranteed.
            </p>
            <div
              className="module-actions"
              role="group"
              aria-label="Funding opportunity sections"
            >
              {bountySections.map((section) => (
                <button
                  className={
                    filters.verification === section ? "primary" : "secondary"
                  }
                  key={section}
                  onClick={() => {
                    setFilters((old) => ({ ...old, verification: section }));
                    setPage(0);
                  }}
                >
                  {section} (
                  {groupBountyAdvertisements(data?.bounties || []).filter(
                    (b) =>
                      bountySection(b) === section &&
                      !bountyIsHandled(b, data?.tracked || []),
                  ).length || 0}
                  )
                </button>
              ))}
            </div>
            <label className="module-field">
              <span>Funding verification</span>
              <select
                value={filters.verification || "All paid or potentially paid"}
                onChange={(e) => {
                  setFilters((old) => ({
                    ...old,
                    verification: e.target.value,
                  }));
                  setPage(0);
                }}
              >
                {[
                  "All paid or potentially paid",
                  ...bountySections,
                  ...fundingStatuses.slice(1),
                ].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <details className="bounty-advanced-filters">
              <summary>More filters and sorting</summary>
              <form
                key={filterVersion}
                className="module-form module-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = fields(e.currentTarget);
                  setFilters({
                    verification: filters.verification,
                    keyword: f.keyword,
                    language: f.language,
                    difficulty: f.difficulty,
                    source: f.source,
                    repository: f.repository,
                    status: f.status,
                    skill: f.skill,
                    currency: f.currency.toUpperCase(),
                    ...(f.min ? { min: Number(f.min) } : {}),
                    ...(f.max ? { max: Number(f.max) } : {}),
                    since: f.since,
                    sort: f.sort,
                    showHandled: filters.showHandled,
                    includeUnsuitable: filters.includeUnsuitable,
                    ...(f.maxEffort ? { maxEffort: Number(f.maxEffort) } : {}),
                  });
                  setPage(0);
                }}
              >
                <Field
                  label="Keyword"
                  name="keyword"
                  value={filters.keyword || ""}
                />
                <Field
                  label="Language"
                  name="language"
                  value={filters.language || ""}
                  placeholder="TypeScript"
                />
                <Select
                  label="Difficulty (source label)"
                  name="difficulty"
                  value={filters.difficulty || ""}
                  options={["", "easy", "medium", "hard", "unknown"]}
                />
                <Select
                  label="Platform"
                  name="source"
                  value={filters.source || ""}
                  options={["", "GitHub", "Algora", "Opire", "IssueHunt"]}
                />
                <Field
                  label="Repository"
                  name="repository"
                  value={filters.repository || ""}
                />
                <Select
                  label="Availability"
                  name="status"
                  value={filters.status || ""}
                  options={[
                    "",
                    "open",
                    "claimed",
                    "in progress",
                    "completed",
                    "unknown",
                  ]}
                />
                <Select
                  label="Relevant technology"
                  name="skill"
                  value={filters.skill || ""}
                  options={[
                    "",
                    "React",
                    "Next.js",
                    "Angular",
                    "JavaScript",
                    "TypeScript",
                    "Node.js",
                    "Python",
                    "PHP",
                    "Laravel",
                    "Express",
                    "MongoDB",
                    "Firebase",
                  ]}
                />
                <Field
                  label="Currency for reward filtering"
                  name="currency"
                  value={filters.currency || ""}
                  placeholder="USD"
                />
                <Field
                  label="Minimum confirmed or advertised reward"
                  name="min"
                  value={filters.min === undefined ? "" : String(filters.min)}
                  type="number"
                />
                <Field
                  label="Maximum confirmed or advertised reward"
                  name="max"
                  value={filters.max === undefined ? "" : String(filters.max)}
                  type="number"
                />
                <Field
                  label="Updated or published since"
                  name="since"
                  value={filters.since || ""}
                  type="date"
                />
                <label className="module-field">
                  <span>Sort by</span>
                  <select
                    name="sort"
                    defaultValue={filters.sort || "relevance"}
                  >
                    {[
                      ["relevance", "Best Opportunity"],
                      ["verified_reward", "Highest Verified Reward"],
                      ["effort", "Easiest Estimated Effort"],
                      ["value", "Best Reward per Estimated Hour"],
                      ["competition", "Least Known Competition"],
                      ["newest", "Newest Available"],
                      ["skills", "Strongest Skill Match"],
                      ["reward", "Highest Advertised Reward"],
                      ["payment risk", "Strongest Funding Evidence"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Maximum estimated hours (unknown stays visible)"
                  name="maxEffort"
                  value={
                    filters.maxEffort === undefined
                      ? ""
                      : String(filters.maxEffort)
                  }
                  type="number"
                />
                <button className="secondary">Apply filters</button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setFilters({});
                    setPage(0);
                    setFilterVersion((v) => v + 1);
                  }}
                >
                  Reset filters
                </button>
              </form>
              <div className="module-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={!!filters.showHandled}
                    onChange={(e) =>
                      setFilters((old) => ({
                        ...old,
                        showHandled: e.target.checked,
                      }))
                    }
                  />
                  Show saved or handled tasks
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!!filters.includeUnsuitable}
                    onChange={(e) =>
                      setFilters((old) => ({
                        ...old,
                        includeUnsuitable: e.target.checked,
                      }))
                    }
                  />
                  Include tasks outside my preferred scope
                </label>
                <button
                  className="secondary"
                  disabled={!!w.busy || !data?.storageAvailable}
                  onClick={() =>
                    data &&
                    w.save("settings", {
                      ...data.settings,
                      bountyFilters: filters,
                    })
                  }
                >
                  Save preferred task filters
                </button>
              </div>
              <p>
                Reward-per-hour comparisons use current funding and the upper AI
                effort estimate. They are uncertain comparisons within each
                currency, not promised earnings. Unknown effort or competition
                stays unknown.
              </p>
            </details>
            <small>
              {results.length} displayed ·{" "}
              {(data?.bounties.length || 0) - results.length} excluded by active
              filters. Reward ranges require a currency. Currencies are never
              converted or added together. Effort sorts by AI’s uncertain
              upper-hour estimate when available; unknown effort stays unknown.
              Use the optional AI plan for an estimate.
            </small>
          </Section>
          <div className="module-grid">
            {results.slice(page * 12, page * 12 + 12).map((b) => (
              <article className="module-panel" key={b.id}>
                <div className="module-actions">
                  <span className="pill">
                    {b.source}
                    {b.manual ? " · Manual import" : " · API"}
                  </span>
                  <span className="pill">{b.status}</span>
                </div>
                <h3>{b.title}</h3>
                <p>
                  {b.repository} · {b.language}
                </p>
                <p
                  className={
                    hasFundingEvidence(b) ? "module-good" : "module-risk"
                  }
                >
                  {bountySection(b)}
                  {bountyClassification(b) === "Inactive"
                    ? ` · ${fundingStatus(b)}`
                    : ""}
                </p>
                <p>
                  {opportunityReward(b)
                    ? `${opportunityReward(b)!.currency} ${opportunityReward(b)!.amount} · ${hasFundingEvidence(b) ? "confirmed funding, manually checked" : "advertised; unconfirmed funding"}`
                    : b.rewardMention
                      ? `Advertised ${b.rewardMention} · currency/terms need review`
                      : "Reward not disclosed"}
                </p>
                {!opportunityReward(b) && b.rewardMention && (
                  <small>Unverified mention: {b.rewardMention}</small>
                )}
                {(b.reward?.evidenceUrl ||
                  b.rewardAnnouncement?.evidenceUrl) && (
                  <p>
                    <LinkOut
                      url={
                        b.reward?.evidenceUrl ||
                        b.rewardAnnouncement!.evidenceUrl
                      }
                    >
                      View verification evidence
                    </LinkOut>
                  </p>
                )}
                {b.reward?.payoutEvidenceUrl && (
                  <p>
                    <LinkOut url={b.reward.payoutEvidenceUrl}>
                      Past payout evidence (separate)
                    </LinkOut>
                  </p>
                )}
                <p>{paymentRisk(b)}</p>
                <small>
                  Last issue check:{" "}
                  {b.checkedAt
                    ? new Date(b.checkedAt).toLocaleString("en-NG", {
                        timeZone: "Africa/Lagos",
                        timeZoneName: "short",
                      })
                    : "Not checked"}
                  . Funding check:{" "}
                  {b.reward?.verifiedAt
                    ? new Date(b.reward.verifiedAt).toLocaleString("en-NG", {
                        timeZone: "Africa/Lagos",
                        timeZoneName: "short",
                      })
                    : "Unconfirmed"}
                  .
                </small>
                <p>
                  Estimated completion:{" "}
                  {b.analysis?.ai
                    ? b.analysis.ai.effort
                    : "Unknown; an optional AI plan can suggest an uncertain estimate"}
                </p>
                <p>{b.skills.join(" · ") || "Skills need review"}</p>
                {b.advertisements && b.advertisements.length > 1 && (
                  <details>
                    <summary>
                      {b.advertisements.length} related source advertisements
                    </summary>
                    {b.advertisements.map((ad) => (
                      <p key={ad.url}>
                        <LinkOut url={ad.url}>{ad.source}</LinkOut> · Reward
                        terms remain specific to each sponsor/platform.
                      </p>
                    ))}
                  </details>
                )}
                <p>
                  Opportunity relevance {bountyOpportunity(b).score}/100 ·{" "}
                  {bountyOpportunity(b).reason}
                </p>
                <p>
                  Technical match {b.analysis?.score ?? "Not scored"}/100 ·{" "}
                  {b.difficulty} difficulty
                </p>
                <p>
                  {b.description.slice(0, 180)}
                  {b.description.length > 180 ? "…" : ""}
                </p>
                <div className="module-actions">
                  <button
                    className="primary"
                    onClick={() => setSelectedId(b.id)}
                  >
                    View task
                  </button>
                  <button
                    className="secondary"
                    disabled={!!w.busy}
                    onClick={() => void track(b, "Saved")}
                  >
                    Save bounty
                  </button>
                  <LinkOut url={b.url}>Original task</LinkOut>
                </div>
              </article>
            ))}
          </div>
          {!results.length && (
            <>
              <Empty>
                {bountyEmptyReason(
                  data?.bounties || [],
                  data?.sources || [],
                  filters,
                )}
              </Empty>
              {!!data?.bounties.length && (
                <button
                  className="secondary"
                  onClick={() => {
                    setFilters({
                      verification: "All paid or potentially paid",
                    });
                    setFilterVersion((v) => v + 1);
                    setPage(0);
                  }}
                >
                  Show potentially paid tasks
                </button>
              )}
            </>
          )}
          <BountyDiagnostics
            bounties={data?.bounties || []}
            sources={data?.sources || []}
            displayed={results.length}
          />
          <Pages count={results.length} page={page} setPage={setPage} />
        </>
      )}
      {["Tracker", "Saved", "Working", "Submitted", "Payment"].includes(
        view,
      ) && (
        <Section title="Bounty work tracker">
          <button
            className="secondary"
            disabled={!!w.busy || !data?.storageAvailable}
            onClick={() =>
              void w.run(
                "Verifying saved tasks",
                async () => {
                  const result = await moduleRequest<{ failures: string[] }>(
                    "bounties/verify-saved",
                    {},
                  );
                  w.setMessage(
                    result.failures.join(" ") ||
                      "Saved issue statuses checked (up to 8 per request).",
                  );
                },
                true,
              )
            }
          >
            Verify saved tasks
          </button>
          <p>
            Statuses record your own progress. Applied/Claimed does not claim a
            bounty externally.
          </p>
          {!data?.tracked.length && (
            <Empty>Save a bounty to begin tracking work.</Empty>
          )}
          <label>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived work history
          </label>
          {data?.tracked
            .filter(
              (t) =>
                (showArchived || !t.archived) &&
                (view === "Tracker" ||
                  (view === "Saved" &&
                    [
                      "Saved",
                      "Evaluating",
                      "Funding Verified",
                      "Assignment Requested",
                      "Applied/Claimed",
                    ].includes(t.status)) ||
                  (view === "Working" && t.status === "Working") ||
                  (view === "Submitted" &&
                    ["Submitted", "In Review"].includes(t.status)) ||
                  (view === "Payment" &&
                    ["Accepted", "Merged", "Reward Claimed"].includes(
                      t.status,
                    ))),
            )
            .map((t) => (
              <Tracker
                key={`${t.id}:${t.updatedAt}`}
                tracked={t}
                title={
                  data.bounties.find(
                    (b) =>
                      b.id === t.bountyId || b.aliasIds?.includes(t.bountyId),
                  )?.title || t.bountyId
                }
                busy={!!w.busy}
                onSave={(r) => void w.save("tracked", r)}
                onOpen={() => setSelectedId(t.bountyId)}
                onRemove={() => void w.remove("tracked", t.id)}
              />
            ))}
        </Section>
      )}
      {view === "Earnings" && (
        <>
          <Section title="Potential rewards and received earnings">
            <div className="module-grid">
              <div>
                <h3>Available owner-verified rewards</h3>
                <Pretty value={earnings.available} />
                <p>Conditional potential rewards; not earned income.</p>
              </div>
              <div>
                <h3>Actual received payments</h3>
                {Object.keys(earnings.received).length ? (
                  <Pretty value={earnings.received} />
                ) : (
                  <p>No received payments recorded.</p>
                )}
                <p>
                  Only explicitly confirmed receipts with evidence are included.
                </p>
              </div>
            </div>
            <div className="module-grid">
              <div>
                <h3>Advertised available rewards (not earnings)</h3>
                <Pretty value={earnings.advertised} />
              </div>
              <div>
                <h3>Rewards associated with submitted work (conditional)</h3>
                <Pretty value={earnings.submittedRewards} />
              </div>
              <div>
                <h3>Approved but unpaid (owner recorded)</h3>
                <Pretty value={earnings.approvedUnpaid} />
              </div>
            </div>
            <p>
              {earnings.pendingClaims} pending claims · {earnings.recordedHours}{" "}
              recorded work hours · {earnings.merged} merged PRs ·{" "}
              {earnings.approvedPrs} observed PR approvals
            </p>
            <details>
              <summary>Monthly actual received payments</summary>
              <Pretty value={earnings.monthly} />
            </details>
            <details>
              <summary>Optional estimated NGN equivalents</summary>
              <p>
                These use your dated manual rates from My Profile, not
                historical transaction rates. Native received amounts remain the
                actual earnings record. Different currencies are shown
                separately.
              </p>
              <Pretty
                value={paymentNgnEstimates(
                  data?.payments || [],
                  data?.exchangeRates || [],
                )}
              />
            </details>
            <p>
              {earnings.active} active · {earnings.submitted} submitted ·{" "}
              {earnings.accepted} accepted · {earnings.completed} paid/completed
            </p>
          </Section>
          <Section title="Record an actual payment">
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e.currentTarget);
                void w.save("payments", {
                  ...f,
                  confirmation: f.confirmed === "on" ? "owner-confirmed" : "",
                });
              }}
            >
              <label className="module-field">
                Tracked bounty
                <select name="bountyId" required>
                  <option value="">Choose a bounty</option>
                  {data?.tracked.map((t) => (
                    <option key={t.id} value={t.bountyId}>
                      {data.bounties.find(
                        (b) =>
                          b.id === t.bountyId ||
                          b.aliasIds?.includes(t.bountyId),
                      )?.title || t.id}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Amount received" name="amount" required />
              <Field
                label="ISO currency"
                name="currency"
                required
                value="USD"
              />
              <Field
                label="Date received"
                name="receivedAt"
                type="date"
                required
              />
              <Field
                label="Receipt or transaction evidence URL"
                name="evidenceUrl"
                type="url"
                required
              />
              <Field label="Payment platform" name="platform" />
              <Field
                label="Associated PR URL"
                name="pullRequestUrl"
                type="url"
              />
              <Field label="Payment notes" name="notes" multiline />
              <label>
                <input type="checkbox" name="confirmed" required /> I confirm
                this payment was actually received.
              </label>
              <button
                className="primary"
                disabled={!!w.busy || !data?.storageAvailable}
              >
                Record receipt
              </button>
            </form>
            {!data?.payments.length && (
              <Empty>No confirmed earnings recorded.</Empty>
            )}
            {data?.payments.map((p) => (
              <div key={p.id} className="module-row">
                <span>
                  {p.currency} {p.amount} · {p.receivedAt} ·{" "}
                  {p.voidedAt
                    ? "Voided (excluded from earnings)"
                    : "owner confirmed"}
                </span>
                <LinkOut url={p.evidenceUrl}>Receipt</LinkOut>
                <button
                  className="secondary"
                  disabled={!!p.voidedAt}
                  onClick={() => void w.remove("payments", p.id)}
                >
                  Void receipt (keep audit record)
                </button>
              </div>
            ))}
          </Section>
        </>
      )}
      {view === "Settings" && data && (
        <Section title="Discovery settings">
          <form
            className="module-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = fields(e.currentTarget);
              void w.save("settings", {
                ...data.settings,
                bountyQuery: f.bountyQuery,
                bountyRefresh: f.bountyRefresh === "on",
                refreshHours: Number(f.refreshHours),
                highMatch: Number(f.highMatch),
              });
            }}
          >
            <Field
              label="Scheduled search keywords"
              name="bountyQuery"
              value={data.settings.bountyQuery}
            />
            <Field
              label="Minimum refresh interval (hours, 6–168)"
              name="refreshHours"
              type="number"
              value={String(data.settings.refreshHours)}
            />
            <Field
              label="High-match notification threshold (0–100)"
              name="highMatch"
              type="number"
              value={String(data.settings.highMatch)}
            />
            <label>
              <input
                type="checkbox"
                name="bountyRefresh"
                defaultChecked={data.settings.bountyRefresh}
              />{" "}
              Enable bounty discovery and saved-task checks on the existing
              daily cron
            </label>
            <button
              className="primary"
              disabled={!!w.busy || !data.storageAvailable}
            >
              Save settings
            </button>
          </form>
          <p>
            The deployment runs one daily cron. Intervals are minimum gates; a
            six-hour preference does not create a six-hour hosting schedule. New
            high-match candidates and saved-task changes appear in existing
            notifications.
          </p>
        </Section>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelectedId("")}>
          <section
            className="modal module-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Bounty details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close bounty details"
              onClick={() => setSelectedId("")}
            >
              ×
            </button>
            <h2>{selected.title}</h2>
            <Feedback busy={w.busy} message={w.message} />
            <p>
              {selected.source} ·{" "}
              {selected.manual ? "Manually submitted" : "Official GitHub API"} ·{" "}
              {selected.status}
            </p>
            <p className="module-pre">
              {selected.description || "No description supplied."}
            </p>
            <dl className="module-facts">
              {Object.entries({
                Repository: selected.repository,
                Organization: selected.organization,
                Language: selected.language,
                Skills: selected.skills.join(", ") || "Unknown",
                Sponsor: selected.sponsor,
                Assignees:
                  selected.assignees.join(", ") ||
                  "None known; other competitors unknown",
                Published: selected.publishedAt || "Unknown",
                Updated: selected.updatedAt || "Unknown",
                "Last issue verification":
                  selected.checkedAt || "Not automatically verified",
                Deadline: selected.deadline || "Unconfirmed",
                Reward: opportunityReward(selected)
                  ? `${opportunityReward(selected)!.currency} ${opportunityReward(selected)!.amount} · ${hasFundingEvidence(selected) ? "confirmed funding, manually checked" : "advertised; unconfirmed funding"}`
                  : "Reward not disclosed",
                "Funding verification": fundingStatus(selected),
                "Evidence authority":
                  selected.reward?.authoritativeConfirmation?.authority ||
                  "No authoritative current-funding confirmation",
                "Funding evidence expires":
                  selected.reward?.authoritativeConfirmation?.validUntil ||
                  "Not confirmed",
                Conditions: selected.reward?.conditions || "Unknown",
                Eligibility:
                  selected.reward?.eligibility || "Unverified for Nigeria",
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="module-actions">
              <LinkOut url={selected.url}>Original bounty</LinkOut>
              {selected.issueUrl && (
                <LinkOut url={selected.issueUrl}>GitHub issue</LinkOut>
              )}
              {selected.repository !== "Unknown" && (
                <LinkOut url={`https://github.com/${selected.repository}`}>
                  Repository
                </LinkOut>
              )}
              <button
                className="secondary"
                disabled={!!w.busy}
                onClick={() => void track(selected, "Saved")}
              >
                Save bounty
              </button>
              <button
                className="secondary"
                disabled={!!w.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Have you reviewed the exact-task funding, acceptance criteria and Nigeria payout evidence? This records local progress only; no assignment or payment is guaranteed.",
                    )
                  )
                    void track(selected, "Working");
                }}
              >
                Mark started
              </button>
              <button
                className="primary"
                disabled={!!w.busy}
                onClick={() =>
                  void w.run(
                    "Analyzing task with AI",
                    () =>
                      moduleRequest("bounties/analyze", {
                        id: selected.id,
                        ai: false,
                        inspectRepository: true,
                      }),
                    true,
                  )
                }
              >
                Analyze Task
              </button>
            </div>
            <div className="module-actions">
              <button
                className="secondary"
                disabled={!!w.busy || !data?.configured.ai}
                onClick={() =>
                  void w.run(
                    "Generating an optional AI implementation plan",
                    () =>
                      moduleRequest("bounties/analyze", {
                        id: selected.id,
                        ai: true,
                        inspectRepository: false,
                      }),
                    true,
                  )
                }
              >
                Generate AI implementation plan
              </button>
              <button
                className="secondary"
                disabled={!!w.busy}
                onClick={() => void track(selected, "Assignment Requested")}
              >
                Record assignment requested
              </button>
            </div>
            <BountyEvidence
              bounty={selected}
              busy={!!w.busy}
              onSave={(body) => void w.save("payment-review", body)}
            />
            {selected.analysis && (
              <>
                {selected.analysis.aiWarning && (
                  <p role="status" className="module-risk">
                    {selected.analysis.aiWarning}
                  </p>
                )}
                <p>
                  Basic analysis compares task metadata and your skills.
                  Repository inspection scope is shown separately above; no
                  tests were executed.
                </p>
                <h3>Explainable score: {selected.analysis.score}/100</h3>
                <p>{selected.analysis.confidence}</p>
                <p className="module-risk">{selected.analysis.paymentRisk}</p>
                {selected.analysis.criteria.map((c) => (
                  <p key={c.label}>
                    <b>
                      {c.label}: {c.points}/{c.maximum}.
                    </b>{" "}
                    {c.reason}
                  </p>
                ))}
                {selected.analysis.ai && (
                  <>
                    <h3>AI interpretation · uncertain estimates</h3>
                    <Pretty value={selected.analysis.ai} />
                    <Copy
                      value={JSON.stringify(selected.analysis.ai, null, 2)}
                    />
                  </>
                )}
              </>
            )}
            <details>
              <summary>Record funding evidence you have checked</summary>
              <p>
                This records a manual check of authoritative funding evidence,
                not an automated provider funding guarantee. Funding is separate
                from actual receipt.
              </p>
              <form
                className="module-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = fields(e.currentTarget);
                  void w.save("reward", {
                    ...f,
                    bountyId: selected.id,
                    confirmed: f.confirmed === "on",
                    fundingConfirmed: f.fundingConfirmed === "on",
                  });
                }}
              >
                <Field label="Confirmed reward amount" name="amount" required />
                <Field
                  label="ISO currency"
                  name="currency"
                  value="USD"
                  required
                />
                <Field
                  label="Funding evidence URL"
                  name="evidenceUrl"
                  type="url"
                  required
                />
                <Select
                  label="Funding proof type"
                  name="fundingType"
                  options={["", "escrow", "deposit"]}
                />
                <Field
                  label="Sponsor’s completed payout evidence URL (optional)"
                  name="payoutEvidenceUrl"
                  type="url"
                />
                <Field
                  label="Authoritative funding source (provider or escrow authority)"
                  name="authority"
                  required
                />
                <label>
                  <input type="checkbox" name="fundingConfirmed" required /> I
                  checked an authoritative source confirming current escrow or
                  deposited funds for this exact task and amount. A promise or
                  past payout is insufficient.
                </label>
                <Field
                  label="Verified payment conditions"
                  name="conditions"
                  multiline
                  required
                />
                <Field
                  label="Verified eligibility or explicit uncertainty"
                  name="eligibility"
                  value="Unverified for Nigeria"
                  required
                />
                <Field label="Sponsor" name="sponsor" />
                <Field
                  label="Confirmed deadline (optional)"
                  name="deadline"
                  type="date"
                />
                <label>
                  <input type="checkbox" name="confirmed" required /> I checked
                  the current funding evidence and conditions. Past payout
                  history is optional.
                </label>
                <button className="primary" disabled={!!w.busy}>
                  Save funding evidence
                </button>
              </form>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}
function Tracker({
  tracked,
  title,
  busy,
  onSave,
  onOpen,
  onRemove,
}: {
  tracked: TrackedBounty;
  title: string;
  busy: boolean;
  onSave: (value: unknown) => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <details className="module-panel">
      <summary>
        {title} · {tracked.status}
      </summary>
      <form
        className="module-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...tracked, ...fields(e.currentTarget) });
        }}
      >
        <Select
          label="Work status"
          name="status"
          value={tracked.status}
          options={workStatuses}
        />
        <Field label="Notes" name="notes" value={tracked.notes} multiline />
        <Field
          label="Branch or fork URL"
          name="branchUrl"
          type="url"
          value={tracked.branchUrl}
        />
        <Field
          label="PR review status"
          name="reviewStatus"
          value={tracked.reviewStatus}
        />
        <Field
          label="Maintainer feedback"
          name="maintainerFeedback"
          value={tracked.maintainerFeedback}
          multiline
        />
        <Field
          label="Recorded effort (hours)"
          name="effortHours"
          type="number"
          value={
            tracked.effortHours === undefined ? "" : String(tracked.effortHours)
          }
        />
        <Select
          label="Payment claim status"
          name="claimStatus"
          value={tracked.claimStatus || "Not claimed"}
          options={[
            "Not claimed",
            "Claim pending",
            "Approved unpaid",
            "Paid",
            "Disputed",
          ]}
        />
        <Field
          label="Claim date"
          name="claimDate"
          type="date"
          value={tracked.claimDate}
        />
        <Field
          label="Approval evidence URL"
          name="approvalEvidenceUrl"
          type="url"
          value={tracked.approvalEvidenceUrl}
        />
        <Field
          label="Approved reward amount (not received earnings)"
          name="approvedAmount"
          value={tracked.approvedReward?.amount}
        />
        <Field
          label="Approved reward currency"
          name="approvedCurrency"
          value={tracked.approvedReward?.currency}
        />
        <Field
          label="Work deadline"
          name="deadline"
          value={tracked.deadline}
          type="date"
        />
        <Field
          label="Submission URL"
          name="submissionUrl"
          value={tracked.submissionUrl}
          type="url"
        />
        <button className="primary" disabled={busy}>
          Update work
        </button>
      </form>
      <div className="module-actions">
        <button className="secondary" onClick={onOpen}>
          View bounty
        </button>
        <button className="secondary" disabled={busy} onClick={onRemove}>
          Archive from active tracker
        </button>
      </div>
    </details>
  );
}
