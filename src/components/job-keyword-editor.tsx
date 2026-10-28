"use client";
import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";
import {
  keywordEvidence,
  suggestJobKeywords,
  type JobKeyword,
} from "@/lib/job-keywords";
type Preset = { id: string; name: string; keywords: JobKeyword[] };
export default function JobKeywordEditor({
  keywords,
  onChange,
  description,
  profile,
  connected = true,
}: {
  keywords: JobKeyword[];
  onChange: (keywords: JobKeyword[]) => void;
  description: string;
  profile?: Profile;
  connected?: boolean;
}) {
  const [presets, setPresets] = useState<Preset[]>([]),
    [name, setName] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!connected) return;
    let active = true;
    void fetch("/api/keyword-presets")
      .then((r) => (r.ok ? r.json() : []))
      .then((v) => {
        if (active && Array.isArray(v)) setPresets(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [connected]);
  const evidence = profile ? keywordEvidence(keywords, profile) : [];
  return (
    <section className="job-keywords" aria-label="Job-specific keywords">
      <h4>Job-specific keywords</h4>
      <p>
        Requirements guide emphasis, not claims. Unsupported keywords remain
        needs-review items; a source mention does not prove proficiency.
      </p>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          const found = suggestJobKeywords(description);
          onChange(
            [
              ...keywords,
              ...found
                .filter(
                  (k) =>
                    !keywords.some(
                      (old) => old.text.toLowerCase() === k.text.toLowerCase(),
                    ),
                )
                .map((k) => ({ ...k, id: crypto.randomUUID() })),
            ].slice(0, 50),
          );
        }}
      >
        Suggest keywords from description
      </button>
      {keywords.map((keyword, i) => (
        <div className="keyword-row" key={keyword.id}>
          <label>
            Keyword {i + 1}
            <input
              maxLength={200}
              value={keyword.text}
              onChange={(e) =>
                onChange(
                  keywords.map((k) =>
                    k.id === keyword.id ? { ...k, text: e.target.value } : k,
                  ),
                )
              }
            />
          </label>
          <label>
            Keyword type
            <select
              value={keyword.kind}
              onChange={(e) =>
                onChange(
                  keywords.map((k) =>
                    k.id === keyword.id
                      ? { ...k, kind: e.target.value as JobKeyword["kind"] }
                      : k,
                  ),
                )
              }
            >
              {["required", "preferred", "custom"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Priority (1–5)
            <input
              type="number"
              min={1}
              max={5}
              value={keyword.priority}
              onChange={(e) =>
                onChange(
                  keywords.map((k) =>
                    k.id === keyword.id
                      ? { ...k, priority: Number(e.target.value) }
                      : k,
                  ),
                )
              }
            />
          </label>
          <p>
            {evidence[i]?.supported
              ? "Mentioned in confirmed profile evidence — review context"
              : "Needs review / no supporting qualification established"}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onChange(keywords.filter((k) => k.id !== keyword.id))
            }
          >
            Remove keyword
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={keywords.length >= 50}
        onClick={() =>
          onChange([
            ...keywords,
            { id: crypto.randomUUID(), text: "", kind: "custom", priority: 3 },
          ])
        }
      >
        Add keyword
      </button>
      <details>
        <summary>Reusable CV keyword presets</summary>
        <p>
          These guide document tailoring. Saved Job Finder searches are managed
          separately.
        </p>
        <label>
          Keyword preset name
          <input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          disabled={!connected || !name.trim() || !keywords.length}
          onClick={async () => {
            try {
              const r = await fetch("/api/keyword-presets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, keywords }),
              });
              const value = await r.json();
              if (!r.ok)
                throw new Error(
                  value.error || "Could not save keyword preset.",
                );
              setPresets([value, ...presets.filter((p) => p.id !== value.id)]);
              setMessage(
                "Keyword preset saved. This has not added any qualification to your profile.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Save keyword preset
        </button>
        {presets.map((p) => (
          <button
            type="button"
            className="secondary"
            key={p.id}
            onClick={() =>
              onChange(
                p.keywords.map((k) => ({ ...k, id: crypto.randomUUID() })),
              )
            }
          >
            Use {p.name}
          </button>
        ))}
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
