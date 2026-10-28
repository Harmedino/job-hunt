"use client";
import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";
import { formatCareerRecord, type CareerRecord } from "@/lib/career-records";
export default function MasterExperienceUpdate({
  recordId,
  proposed,
  expected,
  onClose,
  onSaved,
}: {
  recordId: string;
  proposed: string;
  expected: string[];
  onClose: () => void;
  onSaved: (profile: Profile) => void;
}) {
  const [profile, setProfile] = useState<Profile>(),
    [record, setRecord] = useState<CareerRecord>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/profile")
      .then(async (r) => {
        if (!r.ok)
          throw new Error("Could not load your current master profile.");
        return r.json();
      })
      .then((p) => {
        if (!active) return;
        setProfile(p);
        const r = p.careerRecords?.employment?.find(
          (v: CareerRecord) => v.id === recordId,
        );
        if (!r)
          throw new Error(
            "This original master record is no longer available. Review My Profile before updating it.",
          );
        if (
          expected.some(
            (value) => !formatCareerRecord(r, "employment").includes(value),
          )
        )
          throw new Error(
            "The employer, role or dates changed since this CV was created. Review My Profile before updating this experience.",
          );
        setRecord(r);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [recordId, expected]);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Update Master Experience"
      >
        <button
          className="modal-close icon-button"
          aria-label="Close master experience update"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
        <h2>Update Master Experience</h2>
        <p>
          This deliberately changes permanent career history. The current CV,
          earlier master versions and submitted documents remain unchanged.
        </p>
        <pre className="module-pre">{proposed}</pre>
        {record && profile && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const next = {
                  ...profile,
                  careerRecords: {
                    ...profile.careerRecords,
                    employment: profile.careerRecords!.employment!.map((r) =>
                      r.id === recordId ? record : r,
                    ),
                  },
                };
                const r = await fetch("/api/profile", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(next),
                });
                const p = await r.json();
                if (!r.ok)
                  throw new Error(
                    p.error || "Could not update master experience.",
                  );
                onSaved(p);
                onClose();
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {record.organization} — {record.title} · {record.start} –{" "}
              {record.present ? "Present" : record.end}
            </p>
            <label>
              Reviewed permanent responsibilities
              <textarea
                rows={6}
                maxLength={8000}
                value={record.responsibilities}
                onChange={(e) =>
                  setRecord({ ...record, responsibilities: e.target.value })
                }
              />
            </label>
            <label>
              Reviewed permanent achievements (optional)
              <textarea
                rows={4}
                maxLength={8000}
                value={record.achievements}
                onChange={(e) =>
                  setRecord({ ...record, achievements: e.target.value })
                }
              />
            </label>
            <label className="review-toggle">
              <input type="checkbox" required />I deliberately approve this
              update to my permanent master experience
            </label>
            <button className="primary" disabled={busy}>
              Save master experience update
            </button>
          </form>
        )}
        {message && <p role="alert">{message}</p>}
      </section>
    </div>
  );
}
