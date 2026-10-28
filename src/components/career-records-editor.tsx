"use client";
import { useState } from "react";
import { emptyProfile, type Profile } from "@/lib/types";
import {
  recordSections,
  emptyCareerRecord,
  type RecordSection,
  type CareerRecord,
  type CvTrack,
} from "@/lib/career-records";
import CustomFieldsEditor from "./custom-fields-editor";
export default function CareerRecordsEditor({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
}) {
  const [history, setHistory] = useState<
      { id: string; createdAt: string; profile: Profile }[]
    >([]),
    [message, setMessage] = useState("");
  const updateSection = (section: RecordSection, rows: CareerRecord[]) =>
    onChange({
      ...profile,
      careerRecords: { ...profile.careerRecords, [section]: rows },
    });
  const nysc = profile.nysc || {
    status: "Not specified" as const,
    confirmed: false,
    completionDate: "",
    details: "",
  };
  function records(section: RecordSection) {
    const rows = profile.careerRecords?.[section] || [];
    const labels: Partial<Record<keyof CareerRecord, string>> =
      section === "employment"
        ? {
            organization: "Employer name",
            title: "Actual job title",
            employmentType: "Employment type",
            start: "Start date",
            end: "End date",
            location: "Location",
            responsibilities: "Actual responsibilities (one bullet per line)",
            achievements: "Actual achievements (optional)",
            technologies: "Technologies used",
            url: "Evidence link (optional)",
          }
        : section === "projects"
          ? {
              name: "Project name",
              description: "Project description",
              technologies: "Technologies used",
              responsibilities: "Features implemented (one per line)",
              achievements: "Actual achievements (optional)",
              github: "GitHub repository URL",
              url: "Live demo or evidence URL",
              start: "Start date, if known",
              end: "End date, if known",
            }
          : section === "education"
            ? {
                degree: "Exact degree or qualification",
                organization: "Institution",
                start: "Start date, if known",
                end: "Completion date, if known",
                description: "Additional verified education details",
                url: "Evidence link (optional)",
              }
            : {
                name: "Name",
                organization: "Organization or provider",
                description: "Actual contribution, training or qualification",
                start: "Start date, if known",
                end: "Completion date, if known",
                technologies: "Technologies actually used or learned",
                url: "Evidence link (optional)",
              };
    return (
      <details key={section}>
        <summary>
          {recordSections[section]} ({rows.length})
        </summary>
        <p>
          Keep names, dates and work context exact. Achievements and dates may
          be left unknown. Existing free-text information stays available for
          review below.
        </p>
        {rows.map((record, i) => (
          <fieldset className="career-record" key={record.id}>
            <legend>
              {record.organization || record.name || `Record ${i + 1}`}
            </legend>
            <div className="form-grid">
              {Object.entries(labels).map(([key, label]) => (
                <label key={key}>
                  {label}
                  {["description", "responsibilities", "achievements"].includes(
                    key,
                  ) ? (
                    <textarea
                      rows={3}
                      maxLength={8000}
                      value={record[key as keyof CareerRecord] as string}
                      onChange={(e) =>
                        updateSection(
                          section,
                          rows.map((r) =>
                            r.id === record.id
                              ? { ...r, [key]: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  ) : (
                    <input
                      value={record[key as keyof CareerRecord] as string}
                      maxLength={1500}
                      placeholder={
                        key === "start" || key === "end"
                          ? "YYYY, YYYY-MM or YYYY-MM-DD; leave unknown dates blank"
                          : undefined
                      }
                      onChange={(e) =>
                        updateSection(
                          section,
                          rows.map((r) =>
                            r.id === record.id
                              ? { ...r, [key]: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            {section === "employment" && (
              <label className="review-toggle">
                <input
                  type="checkbox"
                  checked={record.present}
                  onChange={(e) =>
                    updateSection(
                      section,
                      rows.map((r) =>
                        r.id === record.id
                          ? {
                              ...r,
                              present: e.target.checked,
                              end: e.target.checked ? "" : r.end,
                            }
                          : r,
                      ),
                    )
                  }
                />
                I currently hold this position (Present)
              </label>
            )}
            <label>
              Relevant career track
              <select
                value={record.track}
                onChange={(e) =>
                  updateSection(
                    section,
                    rows.map((r) =>
                      r.id === record.id
                        ? {
                            ...r,
                            track: e.target.value as CareerRecord["track"],
                          }
                        : r,
                    ),
                  )
                }
              >
                <option value="both">Both / transferable</option>
                <option value="development">Development</option>
                <option value="cybersecurity">
                  Cybersecurity learning / internships
                </option>
              </select>
            </label>
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={record.confirmed}
                onChange={(e) =>
                  updateSection(
                    section,
                    rows.map((r) =>
                      r.id === record.id
                        ? { ...r, confirmed: e.target.checked }
                        : r,
                    ),
                  )
                }
              />
              I confirm this record describes my actual work, education or
              learning
            </label>
            <div className="module-actions">
              {[-1, 1].map((delta) => (
                <button
                  type="button"
                  className="secondary"
                  key={delta}
                  disabled={i + delta < 0 || i + delta >= rows.length}
                  onClick={() => {
                    const next = [...rows];
                    [next[i], next[i + delta]] = [next[i + delta], next[i]];
                    updateSection(section, next);
                  }}
                >
                  {delta < 0 ? "Move record up" : "Move record down"}
                </button>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  updateSection(
                    section,
                    rows.filter((r) => r.id !== record.id),
                  )
                }
              >
                Remove record
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={rows.length >= 30}
          onClick={() =>
            updateSection(section, [
              ...rows,
              emptyCareerRecord(crypto.randomUUID()),
            ])
          }
        >
          Add{" "}
          {section === "employment"
            ? "employment"
            : section === "projects"
              ? "project"
              : section === "education"
                ? "education"
                : section === "training"
                  ? "training"
                  : section === "contributions"
                    ? "contribution"
                    : "certification"}{" "}
          record
        </button>
      </details>
    );
  }
  return (
    <section
      className="panel career-records-editor"
      aria-label="Structured master career profile"
    >
      <h3>Master career records</h3>
      <p>
        Add, review and reorder actual records. Confirmed records form CV
        evidence. No achievement, date or qualification is required to be
        invented. Save My Profile to persist changes; tailored CV edits remain
        separate.
      </p>
      {(Object.keys(recordSections) as RecordSection[]).map(records)}
      <details>
        <summary>Technical skill groups</summary>
        <CustomFieldsEditor
          fields={profile.skillGroups || []}
          onChange={(skillGroups) => onChange({ ...profile, skillGroups })}
          heading="Technical skill groups"
          addLabel="Add skill group"
          nameLabel="Group name"
          valueLabel="Actual skills"
        />
      </details>
      <details>
        <summary>Development and cybersecurity CV profiles</summary>
        <p>
          Both tracks share original career history. Cybersecurity targets
          internships and learning; development work may remain as transferable
          evidence.
        </p>
        {(["development", "cybersecurity"] as CvTrack[]).map((track) => (
          <fieldset key={track}>
            <legend>
              {track === "development"
                ? "Development CV"
                : "Cybersecurity Internship CV"}
            </legend>
            <label>
              My supplied {track} summary
              <textarea
                rows={3}
                maxLength={3000}
                value={profile.cvTracks?.[track]?.summary || ""}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    cvTracks: {
                      ...profile.cvTracks,
                      [track]: {
                        summary: e.target.value,
                        selectedRecordIds:
                          profile.cvTracks?.[track]?.selectedRecordIds || [],
                      },
                    },
                  })
                }
              />
            </label>
            <p>
              Leave record selection empty to consider all confirmed records
              appropriate to this track.
            </p>
            {Object.values(profile.careerRecords || {})
              .flat()
              .filter((r) => r.confirmed)
              .map((record) => (
                <label key={record.id} className="review-toggle">
                  <input
                    type="checkbox"
                    checked={
                      profile.cvTracks?.[track]?.selectedRecordIds.includes(
                        record.id,
                      ) || false
                    }
                    onChange={(e) => {
                      const ids =
                        profile.cvTracks?.[track]?.selectedRecordIds || [];
                      onChange({
                        ...profile,
                        cvTracks: {
                          ...profile.cvTracks,
                          [track]: {
                            summary: profile.cvTracks?.[track]?.summary || "",
                            selectedRecordIds: e.target.checked
                              ? [...ids, record.id]
                              : ids.filter((id) => id !== record.id),
                          },
                        },
                      });
                    }}
                  />
                  {record.organization || record.name} {record.title}
                </label>
              ))}
          </fieldset>
        ))}
      </details>
      <details>
        <summary>Optional NYSC information</summary>
        <p>
          NYSC is never assumed completed, exempted or resolved. A CV uses it
          only when you deliberately choose inclusion and confirm the saved
          information.
        </p>
        <label>
          NYSC Status
          <select
            aria-label="NYSC Status"
            value={nysc.status}
            onChange={(e) =>
              onChange({
                ...profile,
                nysc: {
                  ...nysc,
                  status: e.target.value as typeof nysc.status,
                  confirmed: false,
                },
              })
            }
          >
            {["Not specified", "In progress", "Completed", "Exempted"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          NYSC completion date (optional)
          <input
            type="date"
            value={nysc.completionDate}
            onChange={(e) =>
              onChange({
                ...profile,
                nysc: {
                  ...nysc,
                  completionDate: e.target.value,
                  confirmed: false,
                },
              })
            }
          />
        </label>
        <label>
          Supporting NYSC details (optional)
          <textarea
            rows={3}
            maxLength={2000}
            value={nysc.details}
            onChange={(e) =>
              onChange({
                ...profile,
                nysc: { ...nysc, details: e.target.value, confirmed: false },
              })
            }
          />
        </label>
        <label className="review-toggle">
          <input
            type="checkbox"
            checked={nysc.confirmed}
            onChange={(e) =>
              onChange({
                ...profile,
                nysc: { ...nysc, confirmed: e.target.checked },
              })
            }
          />
          I confirm this is my accurate NYSC information
        </label>
      </details>
      <CustomFieldsEditor
        fields={profile.customFields || []}
        onChange={(customFields) => onChange({ ...profile, customFields })}
      />
      <details>
        <summary>Master profile history</summary>
        <p>
          Opening a previous profile only fills this form for comparison. Save
          deliberately to restore it as a new current version. Older records and
          submitted CVs remain unchanged.
        </p>
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            try {
              const r = await fetch("/api/profile/history");
              if (!r.ok) throw new Error("Could not load profile history.");
              setHistory(await r.json());
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Load master profile history
        </button>
        {history.length > 0 && history.length % 100 === 0 && (
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                const r = await fetch(
                  `/api/profile/history?offset=${history.length}`,
                );
                if (!r.ok)
                  throw new Error("Could not load older master versions.");
                const values = await r.json();
                setHistory([...history, ...values]);
                if (!values.length)
                  setMessage("All older master versions are loaded.");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Load older master versions
          </button>
        )}
        {history.map((item) => (
          <details key={item.id}>
            <summary>Profile saved before {item.createdAt}</summary>
            <pre className="module-pre">
              {item.profile.name}
              {"\n"}
              {item.profile.experience}
              {"\n"}
              {item.profile.projects}
            </pre>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onChange({
                  ...emptyProfile,
                  careerRecords: {},
                  cvTracks: {},
                  customFields: [],
                  skillGroups: [],
                  nysc: {
                    status: "Not specified",
                    confirmed: false,
                    completionDate: "",
                    details: "",
                  },
                  ...item.profile,
                  revision: profile.revision,
                });
                setMessage(
                  "Previous profile loaded into the form. Review it before saving a new current version.",
                );
              }}
            >
              Review and restore this profile
            </button>
          </details>
        ))}
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
