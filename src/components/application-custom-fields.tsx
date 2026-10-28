"use client";
import { useState } from "react";
import type { Application } from "@/lib/types";
import CustomFieldsEditor from "./custom-fields-editor";
export default function ApplicationCustomFields({
  application,
  onSaved,
}: {
  application: Application;
  onSaved: () => Promise<void>;
}) {
  const [fields, setFields] = useState(application.customFields || []),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section>
      <CustomFieldsEditor fields={fields} onChange={setFields} />
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/applications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: application.id,
                customFields: fields,
              }),
            });
            const d = await r.json();
            if (!r.ok)
              throw new Error(d.error || "Could not save custom fields.");
            await onSaved();
            setMessage(
              "Application custom fields saved. Submitted documents remain unchanged.",
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save application custom fields
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
