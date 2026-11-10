"use client";
import { useEffect, useState } from "react";
import type { BankAnswer } from "@/lib/assisted-apply";
export default function ApplicationAnswers() {
  const [answers, setAnswers] = useState<BankAnswer[]>([]),
    [url, setUrl] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [source, setSource] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reusable, setReusable] = useState(false),
    [disabled, setDisabled] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await fetch("/api/assisted-apply/answers", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setAnswers(data);
  }
  useEffect(() => {
    const timer = setTimeout(
      () => void refresh().catch((e) => setMessage(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, []);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel assistant-answer-bank"
      aria-label="Application Answers"
    >
      <h2>Application Answers</h2>
      <p>
        Save your exact, confirmed answers. Eligibility, salary and legal
        answers stay tied to one vacancy. A saved profile change makes older
        answers stale until you confirm them again. Approved historical packages
        keep their original evidence.
      </p>
      {message && <p role="status">{message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void work(async () => {
            const r = await fetch("/api/assisted-apply/answers", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url,
                question,
                answer,
                source,
                confirmed,
                reusable,
                disabled,
              }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setConfirmed(false);
            setMessage(
              "Confirmed answer saved. Existing approved packages were not changed.",
            );
          });
        }}
      >
        <label>
          Original supported job URL
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          Exact employer question
          <textarea
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <label>
          Your accurate answer
          <textarea
            required
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </label>
        <label>
          Source or evidence
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="My confirmed profile, employment record, or personal decision"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={reusable}
            onChange={(e) => setReusable(e.target.checked)}
          />{" "}
          Reuse this exact non-sensitive question across vacancies
        </label>
        <label>
          <input
            type="checkbox"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
          />{" "}
          Disable this saved answer
        </label>
        <label>
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{" "}
          I confirm this answer is accurate for the stated question and scope.
        </label>
        <button className="primary" disabled={busy || !confirmed}>
          Save confirmed answer
        </button>
      </form>
      {answers.map((row) => (
        <article key={row.id}>
          <h3>{row.question}</h3>
          <p>{row.answer}</p>
          <p>
            {row.vacancyKey === "*"
              ? "Reusable exact question"
              : row.vacancyKey}{" "}
            ·{" "}
            {row.disabled
              ? "Disabled"
              : row.invalidated
                ? "Stale: profile changed"
                : "Confirmed"}
          </p>
          <p>
            {row.source} · Updated {row.updatedAt || row.confirmedAt}
          </p>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setUrl(row.sourceUrl || "");
              setQuestion(row.question);
              setAnswer(row.answer);
              setSource(row.source || "");
              setDisabled(!!row.disabled);
              setReusable(row.vacancyKey === "*");
              setConfirmed(false);
              setMessage(
                "Review the question, answer and current job URL before saving the revision.",
              );
            }}
          >
            Edit / reconfirm
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                const r = await fetch("/api/assisted-apply/answers", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: row.id }),
                });
                if (!r.ok) throw new Error("Could not delete answer.");
              })
            }
          >
            Delete answer
          </button>
        </article>
      ))}
      {!answers.length && <p>No confirmed answers saved yet.</p>}
    </section>
  );
}
