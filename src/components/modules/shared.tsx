"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/modules/types";
export async function moduleRequest<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(`/api/workspace/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      (result.error || "Request failed.") +
        (typeof result.retryAt === "string"
          ? ` Retry at ${new Date(result.retryAt).toLocaleString()}.`
          : ""),
    );
  return result;
}
export function useWorkspace() {
  const [data, setData] = useState<WorkspaceSnapshot>();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const reload = useCallback(async () => {
    const result = await moduleRequest<WorkspaceSnapshot>(
      "state",
      undefined,
      "GET",
    );
    setData(result);
  }, []);
  useEffect(() => {
    let active = true;
    void moduleRequest<WorkspaceSnapshot>("state", undefined, "GET")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async <T,>(
    label: string,
    action: () => Promise<T>,
    refresh = false,
  ): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(label);
    setMessage("");
    try {
      const result = await action();
      if (refresh) await reload();
      return result;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
      return undefined;
    } finally {
      setBusy("");
    }
  };
  const save = <T,>(kind: string, record: unknown) =>
    run(
      `Saving ${kind}`,
      () => moduleRequest<T>(`records/${kind}`, record),
      true,
    );
  const remove = (kind: string, id: string) =>
    run(
      "Removing record",
      () =>
        moduleRequest(
          `records/${kind}?${new URLSearchParams({ id })}`,
          undefined,
          "DELETE",
        ),
      true,
    );
  return { data, busy, message, setMessage, run, save, remove, reload };
}
export function Feedback({
  busy,
  message,
  warning,
}: {
  busy: string;
  message: string;
  warning?: string;
}) {
  return (
    <>
      {busy && (
        <p className="module-notice" role="status">
          {busy}…
        </p>
      )}
      {message && (
        <p className="module-error" role="alert">
          {message}
        </p>
      )}
      {warning && <p className="module-notice">{warning}</p>}
    </>
  );
}
export function Field({
  label,
  name,
  value,
  required,
  type = "text",
  placeholder,
  multiline = false,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="module-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          name={name}
          defaultValue={value}
          required={required}
          placeholder={placeholder}
          rows={3}
          maxLength={14000}
        />
      ) : (
        <input
          name={name}
          defaultValue={value}
          required={required}
          type={type}
          placeholder={placeholder}
          maxLength={6000}
        />
      )}
    </label>
  );
}
export function Select({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value?: string;
  options: readonly string[];
}) {
  return (
    <label className="module-field">
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="module-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="module-empty">{children}</p>;
}
export function LinkOut({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <a
      className="secondary"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children} ↗
    </a>
  );
}
export function fields(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries(
    [...new FormData(form).entries()].filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
}
export function Pretty({ value }: { value: unknown }) {
  if (typeof value === "string") return <p className="module-pre">{value}</p>;
  if (Array.isArray(value))
    return (
      <ul>
        {value.map((v, i) => (
          <li key={i}>{String(v)}</li>
        ))}
      </ul>
    );
  if (value && typeof value === "object")
    return (
      <div>
        {Object.entries(value).map(([key, v]) => (
          <div key={key}>
            <h4>{key.replace(/([A-Z])/g, " $1")}</h4>
            <Pretty value={v} />
          </div>
        ))}
      </div>
    );
  return null;
}
export function Copy({ value }: { value: string }) {
  const [state, setState] = useState("Copy");
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => setState("Copied"),
          () => setState("Copy unavailable"),
        );
      }}
    >
      {state}
    </button>
  );
}
export function Pages({
  count,
  page,
  setPage,
  size = 12,
}: {
  count: number;
  page: number;
  setPage: (n: number) => void;
  size?: number;
}) {
  return (
    <div className="module-actions">
      <button
        className="secondary"
        disabled={page <= 0}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page + 1} · {count} results
      </span>
      <button
        className="secondary"
        disabled={(page + 1) * size >= count}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
