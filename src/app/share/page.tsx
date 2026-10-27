"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export default function ShareImport() {
  const router = useRouter();
  const [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      window.history.replaceState(null, "", "/share");
      setText(
        [p.get("title"), p.get("text")]
          .filter(Boolean)
          .join("\n")
          .slice(0, 20000),
      );
      setUrl((p.get("url") || "").slice(0, 2000));
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="panel" style={{ maxWidth: 700, margin: "2rem auto" }}>
      <h1>Review shared job lead</h1>
      <p>
        Paste only the job advertisement. Remove personal contacts and unrelated
        messages. Nothing is saved until you review it in the inbox.
      </p>
      <label>
        Shared job text
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={20000}
        />
      </label>
      <label>
        Original post URL (optional)
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={2000}
        />
      </label>
      <button
        className="primary"
        onClick={() => {
          try {
            sessionStorage.setItem(
              "launchpad-shared-lead",
              JSON.stringify({ text, url }),
            );
            router.push("/#social");
          } catch {
            setMessage(
              "Browser storage is unavailable. Copy this text and use Add social post in Job Finder.",
            );
          }
        }}
      >
        Continue to verification inbox
      </button>
      <p role="status">{message}</p>
    </main>
  );
}
