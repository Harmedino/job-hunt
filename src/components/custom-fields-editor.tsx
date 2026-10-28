"use client";
import type { CustomField } from "@/lib/custom-fields";
export default function CustomFieldsEditor({
  fields,
  onChange,
  heading = "Custom fields",
  addLabel = "Add Custom Field",
  nameLabel = "Field name",
  valueLabel = "Field value",
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
  heading?: string;
  addLabel?: string;
  nameLabel?: string;
  valueLabel?: string;
}) {
  const move = (i: number, delta: number) => {
    const next = [...fields],
      other = i + delta;
    if (other < 0 || other >= next.length) return;
    [next[i], next[other]] = [next[other], next[i]];
    onChange(next);
  };
  return (
    <section className="custom-fields" aria-label="Custom fields">
      <h4>{heading}</h4>
      <p>
        These are private records. CV inclusion requires a separate choice; job
        requirements do not become your qualifications.
      </p>
      {fields.map((field, i) => (
        <fieldset key={field.id}>
          <legend>Custom field {i + 1}</legend>
          <label>
            {nameLabel}
            <input
              maxLength={80}
              value={field.name}
              onChange={(e) =>
                onChange(
                  fields.map((f) =>
                    f.id === field.id ? { ...f, name: e.target.value } : f,
                  ),
                )
              }
            />
          </label>
          <label>
            {valueLabel}
            <textarea
              maxLength={2000}
              rows={2}
              value={field.value}
              onChange={(e) =>
                onChange(
                  fields.map((f) =>
                    f.id === field.id ? { ...f, value: e.target.value } : f,
                  ),
                )
              }
            />
          </label>
          <label className="review-toggle">
            <input
              type="checkbox"
              checked={field.confirmed}
              onChange={(e) =>
                onChange(
                  fields.map((f) =>
                    f.id === field.id
                      ? { ...f, confirmed: e.target.checked }
                      : f,
                  ),
                )
              }
            />
            I confirm this information is accurate
          </label>
          <div className="module-actions">
            <button
              type="button"
              className="secondary"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              Move field up
            </button>
            <button
              type="button"
              className="secondary"
              disabled={i === fields.length - 1}
              onClick={() => move(i, 1)}
            >
              Move field down
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
            >
              Remove field
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={fields.length >= 25}
        onClick={() =>
          onChange([
            ...fields,
            { id: crypto.randomUUID(), name: "", value: "", confirmed: false },
          ])
        }
      >
        {addLabel}
      </button>
    </section>
  );
}
