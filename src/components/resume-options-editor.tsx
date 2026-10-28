"use client";
import type { Profile } from "@/lib/types";
import type { ResumeOptions } from "@/lib/resume-options";
import type { CvTrack } from "@/lib/career-records";
import CustomFieldsEditor from "./custom-fields-editor";
import JobKeywordEditor from "./job-keyword-editor";
export default function ResumeOptionsEditor({
  profile,
  options,
  onChange,
  description,
  onMaster,
  onApplyAdditional,
}: {
  profile?: Profile;
  options: ResumeOptions;
  onChange: (value: ResumeOptions) => void;
  description: string;
  onMaster: (track: CvTrack) => void;
  onApplyAdditional?: () => void;
}) {
  const records = Object.values(profile?.careerRecords || {})
      .flat()
      .filter(
        (r) => r.confirmed && (r.track === "both" || r.track === options.track),
      ),
    selected = options.selectedRecordIds ?? records.map((r) => r.id),
    custom = [...(profile?.customFields || []), ...options.customFields];
  return (
    <section
      className="resume-options"
      aria-label="Career CV profile and evidence selection"
    >
      <h4>Career CV profile</h4>
      <label>
        CV career track
        <select
          value={options.track}
          onChange={(e) =>
            onChange({
              ...options,
              track: e.target.value as CvTrack,
              selectedRecordIds: undefined,
            })
          }
        >
          <option value="development">
            Development · junior and intermediate
          </option>
          <option value="cybersecurity">
            Cybersecurity · internship and supervised learning
          </option>
        </select>
      </label>
      <p>
        Security learning and development employment remain distinct. Job
        keywords guide relevance; they never establish a qualification.
      </p>
      <div className="module-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => onMaster("development")}
        >
          Create Development Master CV (Basic)
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onMaster("cybersecurity")}
        >
          Create Cybersecurity Internship Master CV (Basic)
        </button>
      </div>
      {records.length > 0 && (
        <details>
          <summary>Select actual experience and projects for this CV</summary>
          <p>
            Only confirmed records are available. Blank dates and optional
            achievements stay unknown.
          </p>
          {records.map((record) => (
            <label className="review-toggle" key={record.id}>
              <input
                type="checkbox"
                checked={selected.includes(record.id)}
                onChange={(e) =>
                  onChange({
                    ...options,
                    selectedRecordIds: e.target.checked
                      ? [...selected, record.id]
                      : selected.filter((id) => id !== record.id),
                  })
                }
              />
              {record.organization || record.name} ·{" "}
              {record.title || record.degree} ·{" "}
              {record.start || "Date not supplied"}
            </label>
          ))}
        </details>
      )}
      <JobKeywordEditor
        keywords={options.keywords}
        onChange={(keywords) => onChange({ ...options, keywords })}
        description={description}
        profile={profile}
      />
      <details>
        <summary>Optional additional information and custom fields</summary>
        {/\bNYSC\b/i.test(description) &&
          profile?.nysc?.confirmed &&
          profile.nysc.status === "Completed" && (
            <p>
              The job mentions NYSC. You may choose to include your confirmed
              Completed status.
            </p>
          )}
        <label className="review-toggle">
          <input
            type="checkbox"
            checked={options.includeNysc}
            disabled={
              !profile?.nysc?.confirmed ||
              profile.nysc.status === "Not specified"
            }
            onChange={(e) =>
              onChange({ ...options, includeNysc: e.target.checked })
            }
          />
          Include my confirmed NYSC information in this CV
        </label>
        <p>
          Saved NYSC status: {profile?.nysc?.status || "Not specified"} ·{" "}
          {profile?.nysc?.confirmed
            ? "confirmed by you"
            : "not confirmed; no completion claim will be added"}
          . This is optional and omitted by default.
        </p>
        <CustomFieldsEditor
          fields={options.customFields}
          onChange={(customFields) => onChange({ ...options, customFields })}
        />
        <h4>Choose fields to include in this CV</h4>
        {custom.map((field) => (
          <label className="review-toggle" key={field.id}>
            <input
              type="checkbox"
              disabled={
                !field.confirmed || !field.name || /\bNYSC\b/i.test(field.name)
              }
              checked={options.includedCustomFields.includes(field.id)}
              onChange={(e) =>
                onChange({
                  ...options,
                  includedCustomFields: e.target.checked
                    ? [...options.includedCustomFields, field.id]
                    : options.includedCustomFields.filter(
                        (id) => id !== field.id,
                      ),
                })
              }
            />
            {field.name || "Unnamed field"} ·{" "}
            {field.confirmed ? "confirmed by you" : "needs confirmation"}
          </label>
        ))}
        {onApplyAdditional && (
          <button
            type="button"
            className="secondary"
            onClick={onApplyAdditional}
          >
            Apply selected additional information to this CV
          </button>
        )}
      </details>
    </section>
  );
}
