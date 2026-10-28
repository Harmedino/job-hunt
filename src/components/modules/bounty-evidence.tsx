"use client";
import type { Bounty } from "@/lib/modules/types";
import {
  bountyOpportunity,
  fundingChecklist,
} from "@/lib/modules/bounty-opportunity";
import { Field, Select, fields, LinkOut } from "./shared";
export default function BountyEvidence({
  bounty,
  busy,
  onSave,
}: {
  bounty: Bounty;
  busy: boolean;
  onSave: (body: unknown) => void;
}) {
  const opportunity = bountyOpportunity(bounty),
    evidence = bounty.repositoryEvidence;
  const expected = bounty.description.match(
    /(?:expected (?:behavior|behaviour|result)|acceptance criteria|definition of done)\s*[:\n]\s*([^\n]{1,700})/i,
  )?.[1];
  return (
    <>
      <section aria-label="Payment evidence checklist">
        <h3>Payment evidence checklist</h3>
        {bounty.paymentReview?.checkedAt&&<p>Payout evidence reviewed {new Date(bounty.paymentReview.checkedAt).toLocaleString("en-NG",{timeZone:"Africa/Lagos"})} WAT. Recheck current provider and sponsor conditions.</p>}
        <p>
          Check this exact task before starting. Historical payouts do not
          establish current funding, and a merged PR does not establish payment.
        </p>
        <dl className="module-facts">
          {fundingChecklist(bounty).map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                {item.state}
                {item.evidence && (
                  <>
                    {" "}
                    · <LinkOut url={item.evidence}>Evidence</LinkOut>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {bounty.linkedPullRequests?.length ? (
          <details>
            <summary>
              Publicly linked PRs to review ({bounty.linkedPullRequests.length})
            </summary>
            <p>
              These are references from a bounded issue timeline. They may not
              all be competing solutions; other competitors can exist.
            </p>
            {bounty.linkedPullRequests.map((pr) => (
              <p key={pr.url}>
                <LinkOut url={pr.url}>{pr.title || pr.url}</LinkOut> ·{" "}
                {pr.state}
              </p>
            ))}
          </details>
        ) : (
          <p>
            No competing-PR count is established. Absence from a bounded API
            response is not proof of no competition.
          </p>
        )}
      </section>
      <section aria-label="Pre-contribution analysis">
        <h3>Before contributing</h3>
        <p>
          <b>Problem:</b> {bounty.title}
        </p>
        <p>
          <b>Expected result / acceptance excerpt:</b>{" "}
          {expected ||
            "Not established from issue text. Ask the maintainer for testable acceptance criteria."}
        </p>
        <p>
          <b>Technologies mentioned:</b>{" "}
          {bounty.skills.join(", ") || "Not established"}
        </p>
        <p>
          <b>Difficulty:</b> {bounty.difficulty} · {opportunity.reason}
        </p>
        <p>
          <b>Effort:</b>{" "}
          {opportunity.effortLow === undefined
            ? "Unknown; no implementation hours assumed."
            : `${opportunity.effortLow}–${opportunity.effortHigh} hours (AI estimate, uncertain; not a deadline).`}
        </p>
        <p>
          <b>Repository inspection:</b>{" "}
          {evidence?.scope ||
            "Issue metadata only. Repository files have not been inspected."}
        </p>
        {evidence && (
          <>
            <p>
              Checked{" "}
              {new Date(evidence.checkedAt).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
              })}{" "}
              WAT{evidence.branch ? ` · branch ${evidence.branch}` : ""}. Tests
              were not executed.
            </p>
            {evidence.warnings.map((warning) => (
              <p className="module-risk" key={warning}>
                {warning}
              </p>
            ))}
            {evidence.files.map((file) => (
              <details key={file.path}>
                <summary>Inspected excerpt: {file.path}</summary>
                {file.url && <LinkOut url={file.url}>Original file</LinkOut>}
                <pre className="module-pre">{file.excerpt}</pre>
              </details>
            ))}
            <details>
              <summary>Observed root/test directory entries</summary>
              <p>
                {evidence.rootFiles.join(", ") ||
                  "No directory evidence retrieved."}
              </p>
            </details>
          </>
        )}
      </section>
      <section aria-label="Opportunity ranking">
        <h3>Opportunity relevance: {opportunity.score}/100</h3>
        <p>
          This is a comparison of visible evidence and your configured skills,
          not an earnings guarantee.
        </p>
        {opportunity.criteria.map((criterion) => (
          <p key={criterion.label}>
            <b>
              {criterion.label}: {criterion.points}/{criterion.maximum}
            </b>{" "}
            · {criterion.reason}
          </p>
        ))}
      </section>
      <details>
        <summary>Record payment eligibility and acceptance evidence</summary>
        <form
          className="module-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = fields(event.currentTarget);
            onSave({
              ...form,
              bountyId: bounty.id,
              confirmed: form.confirmed === "on",
            });
          }}
        >
          <Select
            label="Nigeria payout support"
            name="nigeria"
            value={bounty.paymentReview?.nigeria || "unknown"}
            options={["unknown", "supported", "restricted"]}
          />
          <Field
            label="Published payout eligibility evidence URL"
            name="eligibilitySourceUrl"
            type="url"
            value={bounty.paymentReview?.eligibilitySourceUrl}
          />
          <Field
            label="Payment methods"
            name="methods"
            value={bounty.paymentReview?.methods}
          />
          <Field
            label="Fees, account requirements and restrictions"
            name="fees"
            value={bounty.paymentReview?.fees}
            multiline
          />
          <Field
            label="Acceptance criteria I checked"
            name="acceptanceCriteria"
            value={bounty.paymentReview?.acceptanceCriteria}
            multiline
          />
          <Field
            label="Historical completed payout evidence (optional)"
            name="historicalPayoutUrl"
            type="url"
            value={bounty.paymentReview?.historicalPayoutUrl}
          />
          <Field
            label="Competing PR count I reviewed (leave blank if unknown)"
            name="competingPrCount"
            type="number"
            value={
              bounty.competingPrCount === undefined
                ? ""
                : String(bounty.competingPrCount)
            }
          />
          <label>
            <input type="checkbox" name="confirmed" /> I checked the cited
            published eligibility and payment evidence.
          </label>
          <button className="secondary" disabled={busy}>
            Save payment review
          </button>
        </form>
      </details>
    </>
  );
}
