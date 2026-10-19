"use client";
import { useMemo, useState } from "react";
import {
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
  const [selectedId, setSelectedId] = useState("");
  const data = w.data;
  const selected = data?.bounties.find((b) => b.id === selectedId);
  const results = useMemo(
    () => filterBounties(data?.bounties || [], filters),
    [data?.bounties, filters],
  );
  const earnings = bountyEarnings(
    data?.bounties || [],
    data?.tracked || [],
    data?.payments || [],
  );
  const track = (b: Bounty, status: string) =>
    w.save("tracked", {
      ...(data?.tracked.find((t) => t.bountyId === b.id) || {}),
      bountyId: b.id,
      status,
    });
  return (
    <div className="module-workspace">
      <div className="module-tabs" aria-label="Bounty views">
        {["Discover", "Tracker", "Earnings", "Settings"].map((v) => (
          <button
            className={view === v ? "primary" : "secondary"}
            key={v}
            onClick={() => setView(v)}
          >
            {v}
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
      {view === "Discover" && (
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
                        `Checked ${result.count} source tasks. Only tasks with recorded funding evidence appear by default; unverified tasks are hidden.`,
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
            {data?.sources.map((s) => (
              <p key={s.id}>
                <b>{s.name}:</b> {s.message}{" "}
                {s.checkedAt && (
                  <small>
                    Checked {new Date(s.checkedAt).toLocaleString()}
                  </small>
                )}
              </p>
            ))}
            <details>
              <summary>Import an Algora, IssueHunt or GitHub task URL</summary>
              <p>
                Algora and IssueHunt use manual import until an authorized API
                can be verified. Imports are labeled manually submitted. Linking
                a GitHub issue enables official issue-status checks; it does not
                confirm funding.
              </p>
              <form
                className="module-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void w.run(
                    "Importing task",
                    () =>
                      moduleRequest("bounties/import", fields(e.currentTarget)),
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
              Showing tasks with funding and past payout evidence you have checked. Open the
              evidence and confirm the reward and acceptance terms before working.
              This is not an independent escrow check or a payout guarantee.
            </p>
            <label>
              <input
                type="checkbox"
                checked={!!filters.includeUnverified}
                onChange={(e) => {
                  setFilters((old) => ({ ...old, includeUnverified: e.target.checked }));
                  setPage(0);
                }}
              />{" "}
              Include unverified tasks for review
            </label>
            <form
              className="module-form module-filters"
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e.currentTarget);
                setFilters({
                  includeUnverified: filters.includeUnverified,
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
                });
                setPage(0);
              }}
            >
              <Field label="Keyword" name="keyword" />
              <Field
                label="Language"
                name="language"
                placeholder="TypeScript"
              />
              <Select
                label="Difficulty (source label)"
                name="difficulty"
                options={["", "easy", "medium", "hard", "unknown"]}
              />
              <Select
                label="Platform"
                name="source"
                options={["", "GitHub", "Algora", "IssueHunt"]}
              />
              <Field label="Repository" name="repository" />
              <Select
                label="Availability"
                name="status"
                options={[
                  "",
                  "open",
                  "claimed",
                  "in progress",
                  "completed",
                  "unknown",
                ]}
              />
              <Field label="Relevant skill" name="skill" />
              <Field
                label="Currency for reward filtering"
                name="currency"
                placeholder="USD"
              />
              <Field label="Minimum verified reward" name="min" type="number" />
              <Field label="Maximum verified reward" name="max" type="number" />
              <Field
                label="Updated or published since"
                name="since"
                type="date"
              />
              <Select
                label="Sort by"
                name="sort"
                options={["newest", "reward", "match", "effort"]}
              />
              <button className="secondary">Apply filters</button>
            </form>
            <small>
              Reward ranges require a currency. Currencies are never converted
              or added together. Effort sorts by AI’s uncertain lower-hour
              estimate when available, then source difficulty. Use Analyze Task
              to request an estimate.
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
                <p className={hasFundingEvidence(b) ? "module-good" : "module-risk"}>
                  {hasFundingEvidence(b) && b.reward
                    ? `${b.reward.currency} ${b.reward.amount} · owner-verified evidence`
                    : "Funding unverified"}
                </p>
                {hasFundingEvidence(b) && b.reward && (
                  <p>
                    <LinkOut url={b.reward.evidenceUrl}>View funding evidence</LinkOut>{" "}
                    <LinkOut url={b.reward.payoutEvidenceUrl!}>View past payout proof</LinkOut>
                  </p>
                )}
                {!b.reward && b.rewardMention && (
                  <small>Unverified mention: {b.rewardMention}</small>
                )}
                <p>{b.skills.join(" · ") || "Skills need review"}</p>
                <p>
                  Match {b.analysis?.score ?? "Not scored"}/100 · {b.difficulty}{" "}
                  difficulty
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
            <Empty>
              {filters.includeUnverified
                ? "No matching bounty candidates. Refresh the official GitHub search or import a task URL."
                : "No matching tasks with recorded funding evidence and past payout proof. Unverified tasks are hidden. You can include them for review, but a bounty label or promised amount is not proof of funding."}
            </Empty>
          )}
          <Pages count={results.length} page={page} setPage={setPage} />
        </>
      )}
      {view === "Tracker" && (
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
          {data?.tracked.map((t) => (
            <Tracker
              key={`${t.id}:${t.updatedAt}`}
              tracked={t}
              title={
                data.bounties.find((b) => b.id === t.bountyId)?.title ||
                t.bountyId
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
                <Pretty value={earnings.received} />
                <p>
                  Only explicitly confirmed receipts with evidence are included.
                </p>
              </div>
            </div>
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
                      {data.bounties.find((b) => b.id === t.bountyId)?.title ||
                        t.id}
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
                  {p.currency} {p.amount} · {p.receivedAt} · owner confirmed
                </span>
                <LinkOut url={p.evidenceUrl}>Receipt</LinkOut>
                <button
                  className="secondary"
                  onClick={() => void w.remove("payments", p.id)}
                >
                  Remove receipt
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
                Reward: selected.reward
                  ? `${selected.reward.currency} ${selected.reward.amount} · owner-verified, ${selected.reward.verifiedAt}`
                  : "Unverified",
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
                onClick={() => void track(selected, "Working")}
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
                        ai: true,
                      }),
                    true,
                  )
                }
              >
                Analyze Task
              </button>
            </div>
            {selected.analysis && (
              <>
                {selected.analysis.aiWarning && <p role="status" className="module-risk">{selected.analysis.aiWarning}</p>}
                <p>Basic analysis uses task metadata and your skills; no repository code has been inspected.</p>
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
                This is owner verification, not an automated provider funding
                guarantee. Funding is separate from actual receipt.
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
                  label="Sponsor’s completed payout evidence URL"
                  name="payoutEvidenceUrl"
                  type="url"
                  required
                />
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
                  the escrow or deposited funds, past payout proof and conditions.
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
          Remove from tracker
        </button>
      </div>
    </details>
  );
}
