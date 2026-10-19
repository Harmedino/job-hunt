"use client";
import { useEffect, useState } from "react";
import { jobPlatforms, type JobPlatform } from "@/lib/job-platforms";
type Platform = JobPlatform & { enabled?: boolean };
export default function JobPlatformDirectory() {
  const [platforms, setPlatforms] = useState<Platform[]>(jobPlatforms);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/platforms")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (active && Array.isArray(d.platforms)) setPlatforms(d.platforms);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const automated = platforms.filter((p) => p.access !== "manual");
  const enabled = platforms.filter((p) => p.enabled === true).length;
  const known = platforms.some((p) => p.enabled !== undefined);
  const shown = platforms.filter(
    (p) =>
      (filter === "all" ||
        (filter === "enabled" && p.enabled) ||
        (filter === "setup" && p.access !== "manual" && p.enabled === false) ||
        (filter === "manual" && p.access === "manual")) &&
      `${p.name} ${p.note}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="panel platform-directory" aria-label="Job platforms">
      <div className="section-title">
        <div>
          <h3>Search more platforms</h3>
          <p>
            {platforms.length} platforms · {automated.length} search connectors
            {known ? ` · ${enabled} enabled` : ""}. Browser-only platforms and
            unconfigured connectors are not counted as searched feeds.
          </p>
        </div>
      </div>
      <details>
        <summary>
          Browse all {platforms.length} platforms & connection settings
        </summary>
        <div className="platform-controls">
          <label>
            Find a platform
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Platform name"
            />
          </label>
          <label>
            Access
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All platforms</option>
              <option value="enabled">Enabled search connectors</option>
              <option value="setup">Needs setup</option>
              <option value="manual">Browse directly</option>
            </select>
          </label>
        </div>
        <div className="platform-grid">
          {shown.map((p) => (
            <article key={p.name}>
              <h4>{p.name}</h4>
              <span className="pill">
                {p.access === "manual"
                  ? "Browse directly"
                  : p.enabled === true
                    ? "Search enabled"
                    : p.enabled === false
                      ? p.access === "employer-boards"
                        ? "Choose employer boards"
                        : "API key required"
                      : p.access === "public"
                        ? "Public API / feed"
                        : "Setup required"}
              </span>
              <p>{p.note}</p>
              {p.settings?.length && p.enabled === false ? (
                <small>Server settings: {p.settings.join(", ")}</small>
              ) : null}
              <div className="module-actions">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="secondary"
                >
                  Open {p.name} ↗
                </a>
                {p.access !== "manual" && (
                  <a
                    href={p.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondary"
                  >
                    API / feed details ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
        {!shown.length && <p>No platforms match these filters.</p>}
      </details>
    </section>
  );
}
