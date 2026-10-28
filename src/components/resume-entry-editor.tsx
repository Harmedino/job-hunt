"use client";
import { useEffect, useState } from "react";
import { resumeEntries, type ResumeEntry } from "@/lib/resume-layout";
import type { ResumeDraft, ResumeSection } from "@/lib/resume-types";
export function serializeEntries(entries: ResumeEntry[]) {
  return entries
    .map((entry) =>
      [
        entry.title,
        ...entry.parts
          .filter((p) => p.text.trim())
          .map((p) => (p.kind === "bullet" ? "• " + p.text : p.text)),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}
export default function ResumeEntryEditor({
  section,
  text,
  draft,
  onChange,
  onUpdateMaster,
}: {
  section: ResumeSection;
  text: string;
  draft: ResumeDraft;
  onChange: (text: string) => void;
  onUpdateMaster?: (recordId: string, proposed: string) => void;
}) {
  const [entries, setEntries] = useState(() => resumeEntries(text));
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setEntries((current) =>
          serializeEntries(current) === text ? current : resumeEntries(text),
        ),
      0,
    );
    return () => clearTimeout(timer);
  }, [text]);
  function emit(next: ResumeEntry[]) {
    setEntries(next);
    onChange(serializeEntries(next));
  }
  function update(index: number, entry: ResumeEntry) {
    emit(entries.map((old, i) => (i === index ? entry : old)));
  }
  return (
    <details className="resume-entry-editor">
      <summary>Edit individual entries and bullets</summary>
      <p>
        These edits create a separate CV version. Keep real names, dates and
        achievements with their original record. Manual changes are not
        automatically AI-verified.
      </p>
      {entries.map((entry, i) => {
        const source = draft.evidence.find(
          (item) =>
            item.section === section &&
            item.label &&
            item.label.trim().toLowerCase() ===
              entry.title.trim().toLowerCase(),
        );
        return (
          <fieldset key={i}>
            <legend>{entry.title || `Entry ${i + 1}`}</legend>
            <label>
              Entry heading
              <input
                value={entry.title}
                onChange={(e) => update(i, { ...entry, title: e.target.value })}
              />
            </label>
            {entry.parts.map((part, j) => (
              <div className="resume-bullet-editor" key={j}>
                <label>
                  {part.kind === "bullet"
                    ? "Experience / project bullet"
                    : part.kind === "meta"
                      ? "Dates / technologies"
                      : "Description"}
                  <textarea
                    rows={2}
                    value={part.text}
                    onChange={(e) =>
                      update(i, {
                        ...entry,
                        parts: entry.parts.map((old, n) =>
                          n === j ? { ...old, text: e.target.value } : old,
                        ),
                      })
                    }
                  />
                </label>
                <div className="module-actions">
                  {[-1, 1].map((delta) => (
                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        j + delta < 0 || j + delta >= entry.parts.length
                      }
                      key={delta}
                      onClick={() => {
                        const parts = [...entry.parts];
                        [parts[j], parts[j + delta]] = [
                          parts[j + delta],
                          parts[j],
                        ];
                        update(i, { ...entry, parts });
                      }}
                    >
                      {delta < 0 ? "Move bullet up" : "Move bullet down"}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      update(i, {
                        ...entry,
                        parts: entry.parts.filter((_, n) => n !== j),
                      })
                    }
                  >
                    Remove bullet / line
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setEntries(
                  entries.map((old, index) =>
                    index === i
                      ? {
                          ...entry,
                          parts: [...entry.parts, { kind: "bullet", text: "" }],
                        }
                      : old,
                  ),
                )
              }
            >
              Add bullet
            </button>
            <div className="module-actions">
              {[-1, 1].map((delta) => (
                <button
                  type="button"
                  className="secondary"
                  disabled={i + delta < 0 || i + delta >= entries.length}
                  key={delta}
                  onClick={() => {
                    const next = [...entries];
                    [next[i], next[i + delta]] = [next[i + delta], next[i]];
                    emit(next);
                  }}
                >
                  {delta < 0 ? "Move entry up" : "Move entry down"}
                </button>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() => emit(entries.filter((_, n) => n !== i))}
              >
                Remove entry
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!source}
                onClick={() => {
                  if (source) {
                    const originals = resumeEntries(source.text);
                    emit(
                      entries.flatMap((old, n) =>
                        n === i ? originals : [old],
                      ),
                    );
                  }
                }}
              >
                Restore original wording
              </button>
              {section === "experience" &&
                source?.recordId &&
                onUpdateMaster && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      onUpdateMaster(
                        source.recordId!,
                        serializeEntries([entry]),
                      )
                    }
                  >
                    Update Master Experience
                  </button>
                )}
            </div>
            {source && (
              <details>
                <summary>Compare with original master record</summary>
                <div className="resume-wording-comparison">
                  <pre>{source.text}</pre>
                  <pre>{serializeEntries([entry])}</pre>
                </div>
              </details>
            )}
          </fieldset>
        );
      })}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          setEntries([
            ...entries,
            { title: "", parts: [{ kind: "bullet", text: "" }] },
          ])
        }
      >
        Add experience / project entry
      </button>
    </details>
  );
}
