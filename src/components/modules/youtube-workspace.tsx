"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  brunoProfile,
  contentStatuses,
  type AnalyticsSnapshot,
  type ContentEntry,
  type ContentIdea,
  type ContentProfile,
  type Metadata,
  type PromptVersion,
  type YoutubeVideo,
} from "@/lib/modules/types";
import { defaultTopics } from "@/lib/modules/defaults";
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
export default function YoutubeWorkspace() {
  const [initialDate] = useState(() => Date.now());
  const w = useWorkspace();
  const data = w.data;
  const [view, setView] = useState("Research");
  const [profileId, setProfileId] = useState("bruno");
  const [metadataPlatforms, setMetadataPlatforms] = useState("YouTube");
  const [query, setQuery] = useState("AI football");
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [lastSearch, setLastSearch] = useState<Record<string, string>>({});
  const [research, setResearch] = useState<unknown>();
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<ContentIdea[]>([]);
  const [editingIdea, setEditingIdea] = useState<ContentIdea>();
  const [prompt, setPrompt] = useState<PromptVersion>();
  const [metadata, setMetadata] = useState<Metadata>();
  const [plannerView, setPlannerView] = useState("Kanban");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [editingEntry, setEditingEntry] = useState<ContentEntry>();
  const [report, setReport] = useState<AnalyticsSnapshot>();
  const [recommendations, setRecommendations] = useState<unknown>();
  const [ideaPage, setIdeaPage] = useState(0);
  const ideas = data?.ideas.filter((i) => i.profileId === profileId) || [];
  const profile =
    data?.profiles.find((p) => p.id === profileId) || brunoProfile;
  const search = async (input: Record<string, string>) => {
    const result = await moduleRequest<{
      videos: YoutubeVideo[];
      nextPageToken?: string;
    }>("youtube/search", input);
    setVideos(result.videos);
    setNextPageToken(result.nextPageToken || "");
    setLastSearch(input);
  };
  const createEntry = async (idea: ContentIdea) => {
    const saved = await w.save<ContentIdea>("ideas", {
      ...idea,
      approved: true,
      rejected: false,
    });
    if (saved) {
      await w.save("entries", {
        ideaId: saved.id,
        title: saved.title,
        status: "Ideas",
        platform: "YouTube",
        channel: "",
        targetDate: "",
        notes: "",
        references: "",
        promptId: "",
        metadataId: "",
        publishedUrl: "",
        generatedComplete: false,
      });
      setView("Planner");
    }
  };
  return (
    <div className="module-workspace">
      <div className="module-tabs" aria-label="YouTube views">
        {[
          "Research",
          "Ideas",
          "Planner",
          "Analytics",
          "Journal",
          "Profiles & settings",
        ].map((v) => (
          <button
            key={v}
            className={view === v ? "primary" : "secondary"}
            onClick={() => setView(v)}
          >
            {v}
          </button>
        ))}
      </div>
      <Feedback busy={w.busy} message={w.message} warning={data?.warning} />
      {!data && <Empty>Loading YouTube workspace…</Empty>}
      <label className="module-field">
        Content profile
        <select
          value={profileId}
          onChange={(e) => {
            setProfileId(e.target.value);
            setIdeaPage(0);
          }}
        >
          {(data?.profiles || [brunoProfile]).map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {view === "Research" && (
        <>
          <p className="module-note">
            Research candidates from the official YouTube Data API. Public
            counts are source-provided; no custom virality scores. Short
            duration does not establish official Shorts classification. AI
            research reads metadata, not footage.
          </p>
          {!data?.configured.youtube && (
            <p className="module-notice">
              Set YOUTUBE_API_KEY to enable live public searches and reference
              refresh. No example videos are shown as live results.
            </p>
          )}
          <Section title="Discover videos">
            <form
              className="module-form module-filters"
              onSubmit={(e) => {
                e.preventDefault();
                void w.run("Searching YouTube", () =>
                  search(fields(e.currentTarget)),
                );
              }}
            >
              <label className="module-field">
                Keywords
                <input
                  name="query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={200}
                />
              </label>
              <Field label="Channel ID (optional, UC…)" name="channelId" />
              <Field
                label="Published after"
                name="publishedAfter"
                type="date"
              />
              <Field
                label="Published before"
                name="publishedBefore"
                type="date"
              />
              <Select
                label="Duration"
                name="duration"
                options={["", "short", "medium", "long"]}
              />
              <button
                className="primary"
                disabled={!!w.busy || !data?.storageAvailable}
              >
                Search videos
              </button>
            </form>
            <div className="module-actions">
              {(data?.topics.length ? data.topics : defaultTopics)
                .filter((t) => t.profileId === profileId)
                .map((t) => (
                  <button
                    className="secondary"
                    key={t.id}
                    onClick={() => setQuery(t.title)}
                  >
                    {t.title}
                  </button>
                ))}
            </div>
            <small>
              YouTube duration filters: short &lt;4 min; medium 4–20 min; long
              &gt;20 min. Results are candidates, not guaranteed trends.
            </small>
          </Section>
          <div className="module-grid">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                busy={!!w.busy}
                onSave={() =>
                  void w.run(
                    "Saving video reference",
                    () =>
                      moduleRequest("youtube/save-video", { url: video.url }),
                    true,
                  )
                }
              />
            ))}
          </div>
          {!videos.length && (
            <Empty>
              Enter a topic or channel to discover research candidates.
            </Empty>
          )}
          {nextPageToken && (
            <button
              className="secondary"
              disabled={!!w.busy}
              onClick={() =>
                void w.run("Loading more videos", () =>
                  search({ ...lastSearch, pageToken: nextPageToken }),
                )
              }
            >
              Next results page
            </button>
          )}
          <Section title="Saved research references">
            <p>
              References refresh or expire before 30 days. Public statistical
              history is not accumulated. Select saved videos to guide general
              topics for new original ideas.
            </p>
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                void w.run(
                  "Saving reference",
                  () =>
                    moduleRequest(
                      "youtube/save-video",
                      fields(e.currentTarget),
                    ),
                  true,
                );
              }}
            >
              <Field label="YouTube video URL" name="url" required type="url" />
              <button
                className="secondary"
                disabled={!!w.busy || !data?.storageAvailable}
              >
                Save video URL
              </button>
            </form>
            {!data?.videos.length && <Empty>No saved videos.</Empty>}
            {data?.videos.map((v) => (
              <article key={v.id} className="module-panel">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedReferences.includes(v.id)}
                    onChange={(e) =>
                      setSelectedReferences(
                        e.target.checked
                          ? [...selectedReferences, v.id].slice(0, 10)
                          : selectedReferences.filter((i) => i !== v.id),
                      )
                    }
                  />{" "}
                  Use as topic reference
                </label>
                <h3>{v.title}</h3>
                <p>
                  {v.channelTitle} · {v.duration} · public views{" "}
                  {v.views ?? "Unavailable"}
                </p>
                <div className="module-actions">
                  <LinkOut url={v.url}>Watch on YouTube</LinkOut>
                  <button
                    className="secondary"
                    disabled={!!w.busy}
                    onClick={() =>
                      void w.run("Researching metadata", async () =>
                        setResearch(
                          await moduleRequest("youtube/research", { id: v.id }),
                        ),
                      )
                    }
                  >
                    Analyze metadata
                  </button>
                  <button
                    className="secondary"
                    disabled={!!w.busy}
                    onClick={() =>
                      void w.run(
                        "Refreshing reference",
                        () =>
                          moduleRequest("youtube/save-video", { url: v.url }),
                        true,
                      )
                    }
                  >
                    Refresh
                  </button>
                  <button
                    className="secondary"
                    disabled={!!w.busy}
                    onClick={() =>
                      void w.run(
                        "Removing reference",
                        () =>
                          moduleRequest(
                            `youtube/reference?${new URLSearchParams({ id: v.id, kind: "video" })}`,
                            undefined,
                            "DELETE",
                          ),
                        true,
                      )
                    }
                  >
                    Remove reference
                  </button>
                </div>
                <small>
                  Refreshed {new Date(v.fetchedAt).toLocaleString()} · expires{" "}
                  {new Date(v.expiresAt).toLocaleDateString()}
                </small>
              </article>
            ))}
            {research !== undefined && (
              <div>
                <h3>Metadata research · facts and interpretation</h3>
                <Pretty value={research} />
              </div>
            )}
          </Section>
          <Section title="Reference channels">
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                void w.run(
                  "Saving channel",
                  () =>
                    moduleRequest(
                      "youtube/save-channel",
                      fields(e.currentTarget),
                    ),
                  true,
                );
              }}
            >
              <Field
                label="Public YouTube channel ID"
                name="id"
                required
                placeholder="UC…"
              />
              <button
                className="secondary"
                disabled={!!w.busy || !data?.storageAvailable}
              >
                Save channel
              </button>
            </form>
            {data?.channels.map((c) => (
              <article className="module-row" key={c.id}>
                <div>
                  <h3>{c.title}</h3>
                  <p>
                    Public subscribers:{" "}
                    {c.subscribers ?? "Unavailable or hidden"} · views:{" "}
                    {c.views ?? "Unavailable"} · videos:{" "}
                    {c.videoCount ?? "Unavailable"}
                  </p>
                  <small>
                    {c.id} · refreshed {new Date(c.fetchedAt).toLocaleString()}
                  </small>
                </div>
                <LinkOut url={c.url}>Channel</LinkOut>
                <button
                  className="secondary"
                  onClick={() =>
                    void w.run(
                      "Removing channel reference",
                      () =>
                        moduleRequest(
                          `youtube/reference?${new URLSearchParams({ id: c.id, kind: "channel" })}`,
                          undefined,
                          "DELETE",
                        ),
                      true,
                    )
                  }
                >
                  Remove
                </button>
              </article>
            ))}
          </Section>
        </>
      )}
      {view === "Ideas" && (
        <>
          <Section title="Generate original video ideas">
            <p>
              {profile.niche}. Generated concepts are editable drafts; save or
              approve them before planning.
            </p>
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e.currentTarget);
                void w.run("Generating original ideas", async () => {
                  const result = await moduleRequest<{ ideas: ContentIdea[] }>(
                    "ideas/generate",
                    {
                      profileId,
                      topic: f.topic,
                      count: Number(f.count),
                      referenceIds: selectedReferences,
                      pastEntryId: f.pastEntryId,
                      regenerate: true,
                    },
                  );
                  setDrafts(result.ideas);
                });
              }}
            >
              <Field
                label="Topic or creative direction"
                name="topic"
                value={query}
                required
                multiline
              />
              <label className="module-field">
                Own past content to learn from (optional)
                <select name="pastEntryId">
                  <option value="">No past production selected</option>
                  {data?.entries
                    .filter((entry) => !!entry.publishedUrl)
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title}
                      </option>
                    ))}
                </select>
              </label>
              <Select
                label="Number of ideas"
                name="count"
                value="3"
                options={["1", "2", "3", "4", "5"]}
              />
              <p>
                {selectedReferences.length} saved references selected. Original
                broad-topic inspiration only.
              </p>
              <button
                className="primary"
                disabled={!!w.busy || !data?.storageAvailable}
              >
                Generate / regenerate ideas
              </button>
            </form>
          </Section>
          {drafts.length > 0 && (
            <Section title="Unsaved generated concepts">
              {drafts.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  busy={!!w.busy}
                  onEdit={() => setEditingIdea(idea)}
                  onSave={() => void w.save("ideas", idea)}
                  onReject={() =>
                    setDrafts(drafts.filter((i) => i.id !== idea.id))
                  }
                  onPlan={() => void createEntry(idea)}
                />
              ))}
            </Section>
          )}
          <Section title="Saved ideas">
            <label className="module-field">
              Metadata platforms (YouTube, plus optional captions)
              <input
                value={metadataPlatforms}
                onChange={(e) => setMetadataPlatforms(e.target.value)}
                placeholder="YouTube, Instagram, TikTok, Facebook"
                maxLength={300}
              />
            </label>
            {!ideas.length && (
              <Empty>
                No ideas saved for this profile. Generate original concepts or
                write one below.
              </Empty>
            )}
            <button
              className="secondary"
              onClick={() =>
                setEditingIdea({
                  id: crypto.randomUUID(),
                  profileId,
                  title: "",
                  description: "",
                  action: "",
                  hook: "",
                  audience: "",
                  format: "9:16",
                  duration: "",
                  angle: "",
                  requirements: "",
                  approved: false,
                  rejected: false,
                  referenceIds: [],
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              Write an idea
            </button>
            {ideas.slice(ideaPage * 12, ideaPage * 12 + 12).map((idea) => (
              <div key={idea.id}>
                <IdeaCard
                  idea={idea}
                  busy={!!w.busy}
                  onEdit={() => setEditingIdea(idea)}
                  onSave={() =>
                    void w.save("ideas", {
                      ...idea,
                      approved: true,
                      rejected: false,
                    })
                  }
                  onReject={() =>
                    void w.save("ideas", { ...idea, rejected: true })
                  }
                  onPlan={() => void createEntry(idea)}
                />
                <div className="module-actions">
                  <button
                    className="secondary"
                    disabled={!!w.busy || !idea.approved || idea.rejected}
                    onClick={() =>
                      void w.run("Drafting Kling prompt", async () =>
                        setPrompt(
                          await moduleRequest("ideas/prompt", {
                            ideaId: idea.id,
                          }),
                        ),
                      )
                    }
                  >
                    Create Kling prompt
                  </button>
                  <button
                    className="secondary"
                    disabled={!!w.busy || !idea.approved || idea.rejected}
                    onClick={() =>
                      void w.run("Generating metadata", async () =>
                        setMetadata(
                          await moduleRequest("ideas/metadata", {
                            ideaId: idea.id,
                            platforms: metadataPlatforms,
                          }),
                        ),
                      )
                    }
                  >
                    Generate titles & captions
                  </button>
                  <button
                    className="secondary"
                    disabled={!!w.busy}
                    onClick={() => void w.remove("ideas", idea.id)}
                  >
                    Delete idea
                  </button>
                </div>
                <details>
                  <summary>Saved prompts and metadata</summary>
                  {data?.prompts
                    .filter((p) => p.ideaId === idea.id)
                    .map((p) => (
                      <div key={p.id}>
                        <p>
                          Prompt version{" "}
                          {new Date(p.createdAt).toLocaleString()}
                        </p>
                        <Pretty value={p.text} />
                        <Copy value={p.text} />
                        <button
                          className="secondary"
                          onClick={() => setPrompt(p)}
                        >
                          Edit as new version
                        </button>
                      </div>
                    ))}
                  {data?.metadata
                    .filter((m) => m.ideaId === idea.id)
                    .map((m) => (
                      <div key={m.id}>
                        <Pretty
                          value={{
                            titles: m.titles,
                            descriptions: m.descriptions,
                            hashtags: m.hashtags,
                            hooks: m.hooks,
                            pinnedComments: m.pinnedComments,
                            captions: m.captions,
                          }}
                        />
                        <Copy value={JSON.stringify(m, null, 2)} />
                      </div>
                    ))}
                </details>
              </div>
            ))}
            <Pages count={ideas.length} page={ideaPage} setPage={setIdeaPage} />
          </Section>
        </>
      )}
      {view === "Planner" && (
        <>
          <Section title="Content production plan">
            <p>
              Scheduling records your intended publication date. This app does
              not generate or publish videos.
            </p>
            <div className="module-tabs">
              {["Kanban", "Calendar"].map((v) => (
                <button
                  className={plannerView === v ? "primary" : "secondary"}
                  key={v}
                  onClick={() => setPlannerView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            {plannerView === "Kanban" ? (
              <div className="module-kanban">
                {contentStatuses.map((status) => (
                  <section key={status}>
                    <h3>{status}</h3>
                    {data?.entries
                      .filter(
                        (e) =>
                          e.status === status &&
                          data.ideas.find((i) => i.id === e.ideaId)
                            ?.profileId === profileId,
                      )
                      .map((entry) => (
                        <button
                          key={entry.id}
                          className="module-plan-card"
                          onClick={() => setEditingEntry(entry)}
                        >
                          <b>{entry.title}</b>
                          <small>
                            {entry.channel || "Channel not set"} ·{" "}
                            {entry.platform}
                          </small>
                          <small>{entry.targetDate || "No target date"}</small>
                        </button>
                      ))}
                  </section>
                ))}
              </div>
            ) : (
              <>
                <label className="module-field">
                  Calendar month
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </label>
                <div className="module-calendar">
                  {Array.from(
                    {
                      length:
                        new Date(
                          Number(month.slice(0, 4)),
                          Number(month.slice(5, 7)),
                          0,
                        ).getDate() || 0,
                    },
                    (_, i) => {
                      const day = `${month}-${String(i + 1).padStart(2, "0")}`;
                      return (
                        <div className="module-day" key={day}>
                          <b>{i + 1}</b>
                          {data?.entries
                            .filter(
                              (e) =>
                                e.targetDate.slice(0, 10) === day &&
                                data.ideas.find((idea) => idea.id === e.ideaId)
                                  ?.profileId === profileId,
                            )
                            .map((entry) => (
                              <button
                                key={entry.id}
                                className="module-plan-card"
                                onClick={() => setEditingEntry(entry)}
                              >
                                {entry.title}
                                <small>{entry.status}</small>
                              </button>
                            ))}
                        </div>
                      );
                    },
                  )}
                </div>
                <p>
                  Calendar dates use your entered target date. Undated ideas
                  remain visible in Kanban.
                </p>
              </>
            )}
            {!data?.entries.length && (
              <Empty>
                Approve an idea and choose Add to Content Plan to start.
              </Empty>
            )}
          </Section>
        </>
      )}
      {view === "Analytics" && (
        <>
          <Section title="My authorized channel analytics">
            <p>
              Private reports are available only through a connected owner
              account. Competitor retention, CTR, impressions and revenue are
              not inferred. Missing reports stay unavailable.
            </p>
            {data?.configured.oauth ? (
              <Link
                prefetch={false}
                className="primary"
                href="/api/workspace/oauth/start"
              >
                Connect my YouTube channel
              </Link>
            ) : (
              <p className="module-notice">
                Configure YouTube OAuth client ID, client secret, redirect URI
                and the encryption key to connect an owned channel.
              </p>
            )}
            {data?.integrations.map((c) => (
              <div className="module-row" key={c.id}>
                <span>
                  {c.title} · {c.id}
                  <small>
                    Connected {new Date(c.connectedAt).toLocaleString()}
                    {c.lastSyncAt
                      ? ` · Last sync ${new Date(c.lastSyncAt).toLocaleString()}`
                      : ""}
                  </small>
                </span>
                <button
                  className="secondary"
                  disabled={!!w.busy}
                  onClick={() =>
                    void w.run(
                      "Disconnecting Google grant",
                      async () => {
                        const result = await moduleRequest<{ message: string }>(
                          "youtube/disconnect",
                          { id: c.id },
                        );
                        setReport(undefined);
                        setRecommendations(undefined);
                        w.setMessage(result.message);
                      },
                      true,
                    )
                  }
                >
                  Disconnect grant & delete tokens
                </button>
              </div>
            ))}
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e.currentTarget);
                const action =
                  (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                    "value",
                  ) || "analytics";
                void w.run(
                  action === "learn"
                    ? "Reviewing owned-channel results"
                    : "Fetching authorized reports",
                  async () => {
                    if (action === "learn")
                      setRecommendations(
                        await moduleRequest("youtube/learn", f),
                      );
                    else setReport(await moduleRequest("youtube/analytics", f));
                  },
                );
              }}
            >
              <label className="module-field">
                Connected channel
                <select name="channelId" required>
                  <option value="">Choose your connected channel</option>
                  {data?.integrations.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Start date"
                name="startDate"
                type="date"
                required
                value={new Date(initialDate - 28 * 86400000)
                  .toISOString()
                  .slice(0, 10)}
              />
              <Field
                label="End date"
                name="endDate"
                type="date"
                required
                value={new Date(initialDate - 86400000)
                  .toISOString()
                  .slice(0, 10)}
              />
              <Field
                label="Owned video URL for retention (optional)"
                name="videoUrl"
                type="url"
              />
              <label className="module-field">
                Or link a planned published video
                <select name="entryId">
                  <option value="">None selected</option>
                  {data?.entries
                    .filter((e) => e.publishedUrl)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="primary"
                value="analytics"
                disabled={!!w.busy || !data?.integrations.length}
              >
                Load analytics
              </button>
              <button
                className="secondary"
                value="learn"
                disabled={!!w.busy || !data?.integrations.length}
              >
                Suggest next experiments
              </button>
            </form>
          </Section>
          {report && (
            <Section title="Source-provided Analytics API reports">
          <p>Channel totals are current or lifetime values. The selected date range applies to the Analytics reports below.</p>
              <p>
                {report.startDate} to {report.endDate} · retrieved{" "}
                {new Date(report.fetchedAt).toLocaleString()}
              </p>
              {Object.entries(report.reports).map(([name, result]) => (
                <div key={name}>
                  <h3>{name}</h3>
                  {result.unavailable ? (
                    <p>{result.unavailable}</p>
                  ) : result.data?.rows?.length ? (
                    <div className="module-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {result.data.columnHeaders?.map((c) => (
                              <th key={c.name}>{c.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.data.rows.map((row, i) => (
                            <tr key={i}>
                              {row.map((v, j) => (
                                <td key={j}>{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>
                      No data returned for this report. It may be unavailable
                      for this channel, video or date range.
                    </p>
                  )}
                </div>
              ))}
            </Section>
          )}
          {recommendations !== undefined && (
            <Section title="AI recommendations grounded in available reports">
              <Pretty value={recommendations} />
            </Section>
          )}
        </>
      )}
      {view === "Journal" && (
        <Section title="Production learning journal">
          <form
            className="module-form"
            onSubmit={(e) => {
              e.preventDefault();
              void w.save("journal", fields(e.currentTarget));
            }}
          >
            <label className="module-field">
              Related content (optional)
              <select name="entryId">
                <option value="">General note</option>
                {data?.entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <Field label="What worked" name="worked" multiline />
            <Field label="What failed" name="failed" multiline />
            <Field
              label="What I would change / next experiment"
              name="next"
              multiline
              required
            />
            <button
              className="primary"
              disabled={!!w.busy || !data?.storageAvailable}
            >
              Save learning note
            </button>
          </form>
          {data?.journal.map((j) => (
            <article className="module-panel" key={j.id}>
              <small>{new Date(j.createdAt).toLocaleString()}</small>
              <Pretty
                value={{ worked: j.worked, failed: j.failed, next: j.next }}
              />
              <button
                className="secondary"
                onClick={() => void w.remove("journal", j.id)}
              >
                Remove note
              </button>
            </article>
          ))}
        </Section>
      )}
      {view === "Profiles & settings" && (
        <>
          <Section title="Editable content profiles">
            <ProfileForm
              key={profile.id + profile.name}
              profile={profile}
              busy={!!w.busy || !data?.storageAvailable}
              onSave={(value) => void w.save("profiles", value)}
            />
            <details>
              <summary>Add another niche or channel profile</summary>
              <ProfileForm
                profile={{
                  id: "",
                  name: "",
                  niche: "",
                  character: "",
                  preferences: "",
                  referenceTags: "",
                }}
                busy={!!w.busy || !data?.storageAvailable}
                onSave={(value) => void w.save("profiles", value)}
              />
            </details>
            <p>
              Reference tag mappings are optional. Example: @Image1 = your
              supplied Bruno character reference. The app does not upload
              reference images to Kling or generate a video.
            </p>
          </Section>
          <Section title="Saved research topics">
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                void w.save("topics", {
                  ...fields(e.currentTarget),
                  profileId,
                });
              }}
            >
              <Field label="New topic" name="title" required />
              <Field label="Optional channel ID" name="channelId" />
              <button
                className="primary"
                disabled={!!w.busy || !data?.storageAvailable}
              >
                Save topic
              </button>
            </form>
            {data?.topics
              .filter((t) => t.profileId === profileId)
              .map((t) => (
                <details key={t.id}>
                  <summary>{t.title}</summary>
                  <form
                    className="module-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void w.save("topics", {
                        ...t,
                        ...fields(e.currentTarget),
                      });
                    }}
                  >
                    <Field
                      label="Topic title"
                      name="title"
                      value={t.title}
                      required
                    />
                    <Field
                      label="Channel ID"
                      name="channelId"
                      value={t.channelId}
                    />
                    <button className="secondary" disabled={!!w.busy}>
                      Update topic
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void w.remove("topics", t.id)}
                    >
                      Remove topic
                    </button>
                  </form>
                </details>
              ))}
          </Section>
          {data && (
            <Section title="YouTube refresh preferences">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = fields(e.currentTarget);
                  void w.save("settings", {
                    ...data.settings,
                    youtubeRefresh: f.youtubeRefresh === "on",
                  });
                }}
              >
                <label>
                  <input
                    name="youtubeRefresh"
                    type="checkbox"
                    defaultChecked={data.settings.youtubeRefresh}
                  />{" "}
                  Enable saved-reference refresh, topic checks and authorized
                  analytics sync on the existing daily cron
                </label>
                <p>
                  Quota budget and rate limits apply. API data expires before 30
                  days even when refresh fails. Private sync snapshots expire
                  after one day.
                </p>
                <button
                  className="primary"
                  disabled={!!w.busy || !data.storageAvailable}
                >
                  Save refresh preference
                </button>
              </form>
              <p>
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  YouTube Terms of Service ↗
                </a>{" "}
                ·{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Privacy Policy ↗
                </a>{" "}
                ·{" "}
                <a href="/privacy" target="_blank">
                  Workspace privacy & deletion ↗
                </a>
              </p>
            </Section>
          )}
        </>
      )}
      {editingIdea && (
        <div className="modal-backdrop">
          <section
            className="modal module-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Edit content idea"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close idea editor"
              onClick={() => setEditingIdea(undefined)}
            >
              ×
            </button>
            <h2>Edit original idea</h2>
            <Feedback busy={w.busy} message={w.message} />
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = fields(form);
                void w
                  .save("ideas", {
                    ...editingIdea,
                    ...f,
                    approved: f.approved === "on",
                    rejected: false,
                  })
                  .then((saved) => {
                    if (saved) setEditingIdea(undefined);
                  });
              }}
            >
              {(
                [
                  ["Concept title", "title"],
                  ["Description", "description"],
                  ["Main action or story", "action"],
                  ["Opening hook", "hook"],
                  ["Intended audience", "audience"],
                  ["Format", "format"],
                  ["Possible duration", "duration"],
                  ["Original angle", "angle"],
                  ["Production requirements", "requirements"],
                ] as const
              ).map(([label, name]) => (
                <Field
                  key={name}
                  label={label}
                  name={name}
                  value={editingIdea[name]}
                  required
                  multiline={!["title", "format", "duration"].includes(name)}
                />
              ))}
              <label>
                <input
                  type="checkbox"
                  name="approved"
                  defaultChecked={editingIdea.approved}
                />{" "}
                I approve this original concept for production planning.
              </label>
              <button className="primary" disabled={!!w.busy}>
                Save idea
              </button>
            </form>
          </section>
        </div>
      )}
      {prompt && (
        <div className="modal-backdrop">
          <section
            className="modal module-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Kling prompt editor"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close prompt editor"
              onClick={() => setPrompt(undefined)}
            >
              ×
            </button>
            <h2>Kling prompt workspace</h2>
            <p>
              Only supported idea and profile details. Blank sections mean no
              detail was supplied. Review before using a separate
              video-generation tool.
            </p>
            <Feedback busy={w.busy} message={w.message} />
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e.currentTarget);
                const value = {
                  ...prompt,
                  ...f,
                  text: [
                    "subject",
                    "action",
                    "environment",
                    "lighting",
                    "camera",
                  ]
                    .filter((k) => f[k])
                    .map((k) => `${k}: ${f[k]}`)
                    .join("\n\n"),
                };
                void w.save("prompts", value).then((saved) => {
                  if (saved) setPrompt(undefined);
                });
              }}
            >
              {(
                [
                  ["Subject description", "subject"],
                  ["Action", "action"],
                  ["Environment", "environment"],
                  ["Lighting and atmosphere", "lighting"],
                  ["Camera movement", "camera"],
                ] as const
              ).map(([label, name]) => (
                <Field
                  key={name}
                  label={label}
                  name={name}
                  value={prompt[name]}
                  multiline
                />
              ))}
              <button className="primary" disabled={!!w.busy}>
                Save as new prompt version
              </button>
            </form>
            <Copy value={prompt.text} />
            <small>
              Copy uses the generated/saved version above; save edits to copy
              the revised version from history.
            </small>
          </section>
        </div>
      )}
      {metadata && (
        <div className="modal-backdrop">
          <section
            className="modal module-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Publishing metadata"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close metadata editor"
              onClick={() => setMetadata(undefined)}
            >
              ×
            </button>
            <h2>Titles, descriptions and captions</h2>
            <Feedback busy={w.busy} message={w.message} />
            {(
              [
                "titles",
                "descriptions",
                "hashtags",
                "hooks",
                "pinnedComments",
                "captions",
              ] as const
            ).map((name) => (
              <div key={name}>
                <h3>{name}</h3>
                {metadata[name].map((v, i) => (
                  <div key={i}>
                    <p className="module-pre">{v}</p>
                    <Copy value={v} />
                  </div>
                ))}
              </div>
            ))}
            <button
              className="primary"
              disabled={!!w.busy}
              onClick={() =>
                void w.run(
                  "Saving metadata",
                  async () => {
                    await moduleRequest("ideas/save-metadata", {
                      ideaId: metadata.ideaId,
                      metadata,
                    });
                    setMetadata(undefined);
                  },
                  true,
                )
              }
            >
              Save metadata
            </button>
          </section>
        </div>
      )}
      {editingEntry && data && (
        <div className="modal-backdrop">
          <section
            className="modal module-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Edit planned content"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close content editor"
              onClick={() => setEditingEntry(undefined)}
            >
              ×
            </button>
            <h2>Production plan</h2>
            <Feedback busy={w.busy} message={w.message} />
            <form
              className="module-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e.currentTarget);
                void w
                  .save("entries", {
                    ...editingEntry,
                    ...f,
                    generatedComplete: f.generatedComplete === "on",
                  })
                  .then((saved) => {
                    if (saved) setEditingEntry(undefined);
                  });
              }}
            >
              <Field
                label="Content title"
                name="title"
                value={editingEntry.title}
                required
              />
              <Field
                label="Channel"
                name="channel"
                value={editingEntry.channel}
              />
              <Select
                label="Platform"
                name="platform"
                value={editingEntry.platform}
                options={["YouTube", "Instagram", "TikTok", "Facebook"]}
              />
              <Field
                label="Target publication date"
                name="targetDate"
                value={editingEntry.targetDate}
                type="date"
              />
              <Select
                label="Production status"
                name="status"
                value={editingEntry.status}
                options={contentStatuses}
              />
              <Field
                label="Production notes"
                name="notes"
                value={editingEntry.notes}
                multiline
              />
              <Field
                label="Reference links"
                name="references"
                value={editingEntry.references}
                multiline
              />
              <label className="module-field">
                Saved Kling prompt
                <select name="promptId" defaultValue={editingEntry.promptId}>
                  <option value="">None</option>
                  {data.prompts
                    .filter((p) => p.ideaId === editingEntry.ideaId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {new Date(p.createdAt).toLocaleString()}
                      </option>
                    ))}
                </select>
              </label>
              <label className="module-field">
                Saved captions / metadata
                <select
                  name="metadataId"
                  defaultValue={editingEntry.metadataId}
                >
                  <option value="">None</option>
                  {data.metadata
                    .filter((m) => m.ideaId === editingEntry.ideaId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {new Date(m.createdAt).toLocaleString()}
                      </option>
                    ))}
                </select>
              </label>
              <Field
                label="Published video URL"
                name="publishedUrl"
                value={editingEntry.publishedUrl}
                type="url"
              />
              <label>
                <input
                  type="checkbox"
                  name="generatedComplete"
                  defaultChecked={editingEntry.generatedComplete}
                />{" "}
                I completed video generation in my external tool.
              </label>
              <button className="primary" disabled={!!w.busy}>
                Save production plan
              </button>
            </form>
            <button
              className="secondary"
              disabled={!!w.busy}
              onClick={() =>
                void w
                  .remove("entries", editingEntry.id)
                  .then(() => setEditingEntry(undefined))
              }
            >
              Remove from plan
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function VideoCard({
  video,
  busy,
  onSave,
}: {
  video: YoutubeVideo;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <article className="module-panel">
      {video.thumbnail && (
        <a href={video.url} target="_blank" rel="noopener noreferrer">
          <Image
            unoptimized
            width={320}
            height={180}
            className="module-thumbnail"
            src={video.thumbnail}
            alt={`YouTube thumbnail: ${video.title}`}
            loading="lazy"
          />
        </a>
      )}
      <h3>{video.title}</h3>
      <p>
        {video.channelTitle} ·{" "}
        {new Date(video.publishedAt).toLocaleDateString()} · {video.duration}
      </p>
      <p>
        Views {video.views ?? "Unavailable"} · Likes{" "}
        {video.likes ?? "Unavailable"} · Comments{" "}
        {video.comments ?? "Unavailable"}
      </p>
      <p>{video.description.slice(0, 200)}</p>
      <div className="module-actions">
        <LinkOut url={video.url}>YouTube</LinkOut>
        <button className="secondary" disabled={busy} onClick={onSave}>
          Save reference
        </button>
      </div>
    </article>
  );
}
function IdeaCard({
  idea,
  busy,
  onEdit,
  onSave,
  onReject,
  onPlan,
}: {
  idea: ContentIdea;
  busy: boolean;
  onEdit: () => void;
  onSave: () => void;
  onReject: () => void;
  onPlan: () => void;
}) {
  return (
    <article className="module-panel">
      <span className="pill">
        {idea.rejected ? "Rejected" : idea.approved ? "Approved" : "Draft"}
      </span>
      <h3>{idea.title}</h3>
      <p>{idea.description}</p>
      <details>
        <summary>Concept details</summary>
        <Pretty
          value={{
            action: idea.action,
            hook: idea.hook,
            audience: idea.audience,
            format: idea.format,
            duration: idea.duration,
            angle: idea.angle,
            requirements: idea.requirements,
          }}
        />
      </details>
      <div className="module-actions">
        <button className="secondary" onClick={onEdit}>
          Edit idea
        </button>
        <button className="secondary" disabled={busy} onClick={onSave}>
          {idea.approved ? "Save idea" : "Save / approve"}
        </button>
        <button className="secondary" disabled={busy} onClick={onReject}>
          Reject
        </button>
        <button
          className="primary"
          disabled={busy || idea.rejected}
          onClick={onPlan}
        >
          Add to Content Plan
        </button>
      </div>
    </article>
  );
}
function ProfileForm({
  profile,
  busy,
  onSave,
}: {
  profile: ContentProfile;
  busy: boolean;
  onSave: (value: unknown) => void;
}) {
  return (
    <form
      className="module-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...profile, ...fields(e.currentTarget) });
      }}
    >
      <Field label="Profile name" name="name" value={profile.name} required />
      <Field
        label="Content niche"
        name="niche"
        value={profile.niche}
        required
        multiline
      />
      <Field
        label="Character identity (optional)"
        name="character"
        value={profile.character}
        multiline
      />
      <Field
        label="Editable production preferences"
        name="preferences"
        value={profile.preferences}
        multiline
      />
      <Field
        label="Reference-tag mappings (optional)"
        name="referenceTags"
        value={profile.referenceTags}
        multiline
      />
      <button className="primary" disabled={busy}>
        Save content profile
      </button>
    </form>
  );
}
