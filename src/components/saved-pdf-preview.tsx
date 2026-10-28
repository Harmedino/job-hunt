"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
export default function SavedPdfPreview({
  draftId,
  kind,
  dirty,
  onRefresh,
}: {
  draftId: string;
  kind: "cv" | "letter";
  dirty: boolean;
  onRefresh: () => void;
}) {
  const [page, setPage] = useState(1),
    [count, setCount] = useState(0),
    [message, setMessage] = useState("");
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    void fetch(`/api/resumes/${draftId}/preview?document=${kind}&meta=1`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw new Error(value.error || "PDF preview unavailable.");
        if (current) {
          setCount(value.pageCount);
          setPage(1);
          setMessage("");
        }
      })
      .catch((e) => {
        if (current && !controller.signal.aborted) setMessage(e.message);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [draftId, kind]);
  return (
    <section className="saved-pdf-preview" aria-label="Actual saved PDF pages">
      <h4>Actual saved PDF preview</h4>
      <p>
        This renders the saved downloadable PDF. Version {draftId.slice(0, 8)}.
      </p>
      {dirty && (
        <div className="notice">
          <p>Unsaved text, style or section changes are not in this PDF yet.</p>
          <button type="button" className="secondary" onClick={onRefresh}>
            Save edits and refresh PDF preview
          </button>
        </div>
      )}
      {message ? (
        <div role="status">
          <p>{message}</p>
          <button type="button" className="secondary" onClick={onRefresh}>
            Retry PDF preview
          </button>
        </div>
      ) : (
        count > 0 && (
          <>
            <div className="module-actions">
              <button
                type="button"
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous PDF page
              </button>
              <span>
                Page {page} of {count}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={page === count}
                onClick={() => setPage(page + 1)}
              >
                Next PDF page
              </button>
            </div>
            <div className="saved-pdf-paper">
              <Image
                key={`${draftId}-${kind}-${page}`}
                unoptimized
                src={`/api/resumes/${draftId}/preview?document=${kind}&page=${page}`}
                alt={`Saved ${kind === "cv" ? "CV" : "cover letter"} PDF page ${page} of ${count}`}
                width={1000}
                height={1414}
                onError={() =>
                  setMessage(
                    "This PDF page could not be rendered. Download the saved file or retry the preview.",
                  )
                }
              />
            </div>
            {count > 2 && (
              <p>
                This document has {count} pages. Review whether less relevant
                detail can be condensed; no content was removed to force a page
                limit.
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}
