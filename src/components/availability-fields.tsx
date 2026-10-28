"use client";
import type { Profile } from "@/lib/types";
import type { JobHuntAvailability } from "@/lib/application-history";
export default function AvailabilityFields({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (value: Profile) => void;
}) {
  const current = profile.availability || { mode: "Not set", readyFrom: "" };
  return (
    <section className="panel" aria-label="Job-hunting availability">
      <h3>Job-hunting availability</h3>
      <p>
        This optional setting records when you choose to apply. It does not
        infer NYSC status, erase earlier applications or change your career
        preferences.
      </p>
      <div className="form-grid">
        <label>
          Job-hunting mode
          <select
            value={current.mode}
            onChange={(e) =>
              onChange({
                ...profile,
                availability: {
                  ...current,
                  mode: e.target.value as JobHuntAvailability["mode"],
                },
              })
            }
          >
            {["Not set", "Preparing", "Actively applying", "Paused"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Ready to start applying from (optional)
          <input
            type="date"
            value={current.readyFrom}
            onChange={(e) =>
              onChange({
                ...profile,
                availability: { ...current, readyFrom: e.target.value },
              })
            }
          />
        </label>
      </div>
      <p>
        Save My Profile to keep this setting. Your profile, CVs and application
        history continue across 2026, 2027 and later years.
      </p>
    </section>
  );
}
