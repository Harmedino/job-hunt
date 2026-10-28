"use client";
import type { ResumeDraft, ResumeContent } from "@/lib/resume-types";
export default function ResumeStatementReview({
  draft,
  content,
  onChange,
  reviews,
  onReview,
}: {
  draft: ResumeDraft;
  content: ResumeContent;
  onChange: (content: ResumeContent) => void;
  reviews: NonNullable<ResumeDraft["statementReviews"]>;
  onReview: (reviews: NonNullable<ResumeDraft["statementReviews"]>) => void;
}) {
  if (!draft.statements?.length) return null;
  return (
    <details className="resume-statement-review">
      <summary>Review original evidence and proposed wording</summary>
      <p>
        Automated factual checks are not a guarantee. Approve, reject or edit
        each proposed statement. Your master profile remains unchanged.
      </p>
      {draft.statements
        .filter((s) => s.section !== "coverLetter")
        .map((statement) => {
          const present =
            statement.section !== "coverLetter" &&
            (content[statement.section] || "").includes(statement.text);
          return (
            <article key={statement.id}>
              <h4>
                {statement.section} ·{" "}
                {reviews[statement.id] || "Awaiting your review"}
              </h4>
              <div className="resume-wording-comparison">
                <div>
                  <b>Original evidence</b>
                  {statement.sources.map((id) => (
                    <pre key={id}>{draft.evidence[id]?.text}</pre>
                  ))}
                </div>
                <div>
                  <b>Proposed wording</b>
                  <pre>{statement.text}</pre>
                </div>
              </div>
              <div className="module-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={!present}
                  onClick={() =>
                    onReview({ ...reviews, [statement.id]: "approved" })
                  }
                >
                  Approve statement
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!present}
                  onClick={() => {
                    if (statement.section !== "coverLetter")
                      onChange({
                        ...content,
                        [statement.section]: (content[statement.section] || "")
                          .replace(statement.text, "")
                          .trim(),
                      });
                    onReview({ ...reviews, [statement.id]: "rejected" });
                  }}
                >
                  Reject statement
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    onReview({ ...reviews, [statement.id]: "edited" });
                    document
                      .getElementById("cv-builder-editor")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Edit in CV section
                </button>
              </div>
              {!present && (
                <p>
                  The editor text has changed or this statement was removed.
                  Review the current section before export.
                </p>
              )}
            </article>
          );
        })}
    </details>
  );
}
