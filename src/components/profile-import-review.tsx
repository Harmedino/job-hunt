"use client";
import { useState } from "react";
import {
  importFields,
  type ImportField,
  type ProfilePatch,
} from "@/lib/profile-import-fields";
import { careerImportProposals } from "@/lib/career-import";
import {
  recordSections,
  recordTextFields,
  type CareerRecord,
  type RecordSection,
} from "@/lib/career-records";
import type { Profile } from "@/lib/types";
export default function ProfileImportReview({
  profile,
  text,
  fields,
  onApply,
  onCancel,
}: {
  profile: Profile;
  text: string;
  fields: ProfilePatch;
  onApply: (profile: Profile) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ProfilePatch>({ ...fields }),
    [selected, setSelected] = useState<ImportField[]>([]),
    [includeText, setIncludeText] = useState(false),
    [proposals, setProposals] = useState(() => careerImportProposals(text)),
    [records, setRecords] = useState<string[]>([]),
    [replace, setReplace] = useState<string[]>([]);
  const existingMatch = (section: RecordSection, r: CareerRecord) =>
    (profile.careerRecords?.[section] || []).find((old) =>
      section === "employment"
        ? old.organization.toLowerCase() === r.organization.toLowerCase() &&
          old.title.toLowerCase() === r.title.toLowerCase()
        : section === "education"
          ? old.organization.toLowerCase() === r.organization.toLowerCase() &&
            old.degree.toLowerCase() === r.degree.toLowerCase()
          : old.name.toLowerCase() === r.name.toLowerCase(),
    );
  return (
    <div className="modal-backdrop">
      <section
        className="modal profile-import-review"
        role="dialog"
        aria-modal="true"
        aria-label="Review imported CV changes"
      >
        <button
          type="button"
          className="modal-close icon-button"
          aria-label="Close import review without changes"
          onClick={onCancel}
        >
          ×
        </button>
        <h3>Review imported CV changes</h3>
        <p>
          Your master profile has not changed. Select only updates you have
          reviewed. Edit every proposed value, or reject it. Saving My Profile
          is a separate deliberate action.
        </p>
        {importFields
          .filter((key) => fields[key] !== undefined)
          .map((key) => (
            <fieldset key={key}>
              <legend>{key}</legend>
              {profile[key]?.trim() && profile[key] !== fields[key] && (
                <p className="location-warning">
                  Different information already exists. Compare employers,
                  dates, skills and project details; this update is not
                  automatically accepted.
                </p>
              )}
              <div className="resume-wording-comparison">
                <div>
                  <b>Current master value</b>
                  <pre>{profile[key] || "Not supplied"}</pre>
                </div>
                <label>
                  Proposed {key}
                  <textarea
                    rows={3}
                    maxLength={50000}
                    value={values[key] || ""}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="review-toggle">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, key]
                        : selected.filter((k) => k !== key),
                    )
                  }
                />
                Approve {key} update
              </label>
            </fieldset>
          ))}
        <details>
          <summary>
            Review structured record proposals ({proposals.length})
          </summary>
          <p>
            Only confidently recognized headings and literal date ranges were
            proposed. Unparsed or ambiguous text remains available below.
            Existing confirmed records are preserved unless you explicitly
            replace a matching record.
          </p>
          {proposals.map((proposal, i) => {
            const old = existingMatch(proposal.section, proposal.record);
            return (
              <fieldset key={proposal.record.id}>
                <legend>
                  {recordSections[proposal.section]}:{" "}
                  {proposal.record.organization || proposal.record.name}
                </legend>
                <pre className="module-pre">{proposal.source}</pre>
                {proposal.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <div className="form-grid">
                  {recordTextFields
                    .filter(
                      (key) =>
                        proposal.record[key] ||
                        [
                          "start",
                          "end",
                          "responsibilities",
                          "achievements",
                        ].includes(key),
                    )
                    .map((key) => (
                      <label key={key}>
                        Proposed record {key}
                        <textarea
                          rows={2}
                          value={proposal.record[key]}
                          onChange={(e) =>
                            setProposals(
                              proposals.map((p, n) =>
                                n === i
                                  ? {
                                      ...p,
                                      record: {
                                        ...p.record,
                                        [key]: e.target.value,
                                      },
                                    }
                                  : p,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                </div>
                {old && (
                  <>
                    <p>
                      A matching master record exists. Its current details
                      remain unchanged by default.
                    </p>
                    <pre className="module-pre">
                      {JSON.stringify(old, null, 2)}
                    </pre>
                    <label className="review-toggle">
                      <input
                        type="checkbox"
                        checked={replace.includes(proposal.record.id)}
                        onChange={(e) =>
                          setReplace(
                            e.target.checked
                              ? [...replace, proposal.record.id]
                              : replace.filter(
                                  (id) => id !== proposal.record.id,
                                ),
                          )
                        }
                      />
                      Replace only the matching record with reviewed, nonempty
                      proposed fields
                    </label>
                  </>
                )}
                <label className="review-toggle">
                  <input
                    type="checkbox"
                    checked={records.includes(proposal.record.id)}
                    onChange={(e) =>
                      setRecords(
                        e.target.checked
                          ? [...records, proposal.record.id]
                          : records.filter((id) => id !== proposal.record.id),
                      )
                    }
                  />
                  I reviewed and approve this actual record
                </label>
              </fieldset>
            );
          })}
        </details>
        <details>
          <summary>Full extracted text (original layout may be lost)</summary>
          <pre className="module-pre">{text}</pre>
        </details>
        <label className="review-toggle">
          <input
            type="checkbox"
            checked={includeText}
            onChange={(e) => setIncludeText(e.target.checked)}
          />
          Keep this reviewed text as my current CV source
        </label>
        <p>
          NYSC status is not inferred from this upload. Confirm it separately in
          My Profile when appropriate. OCR is not run automatically.
        </p>
        <div className="module-actions">
          <button
            type="button"
            className="primary"
            disabled={!selected.length && !includeText && !records.length}
            onClick={() => {
              let next = {
                ...profile,
                ...Object.fromEntries(
                  selected.map((key) => [key, values[key] || ""]),
                ),
                ...(includeText ? { cvText: text } : {}),
              };
              for (const proposal of proposals.filter((p) =>
                records.includes(p.record.id),
              )) {
                const old = existingMatch(proposal.section, proposal.record),
                  rows = [...(next.careerRecords?.[proposal.section] || [])];
                if (old && replace.includes(proposal.record.id)) {
                  const reviewed = { ...old };
                  for (const key of recordTextFields)
                    if (proposal.record[key])
                      reviewed[key] = proposal.record[key];
                  if (proposal.record.end) reviewed.present = false;
                  else if (proposal.record.present) {
                    reviewed.present = true;
                    reviewed.end = "";
                  }
                  reviewed.confirmed = true;
                  next = {
                    ...next,
                    careerRecords: {
                      ...next.careerRecords,
                      [proposal.section]: rows.map((r) =>
                        r.id === old.id ? reviewed : r,
                      ),
                    },
                  };
                } else
                  next = {
                    ...next,
                    careerRecords: {
                      ...next.careerRecords,
                      [proposal.section]: [
                        ...rows,
                        {
                          ...proposal.record,
                          id: crypto.randomUUID(),
                          confirmed: true,
                        },
                      ],
                    },
                  };
              }
              onApply(next);
            }}
          >
            Apply approved changes to profile form
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Reject import / keep current profile
          </button>
        </div>
      </section>
    </div>
  );
}
