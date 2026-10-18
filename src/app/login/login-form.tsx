"use client";
import { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Zap,
} from "lucide-react";
export default function LoginForm({
  configured,
  next,
}: {
  configured: boolean;
  next: string;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="brand">
          <span className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </span>
          launchpad<span className="brand-dot">.</span>
        </div>
        <div className="login-lock">
          <LockKeyhole size={25} />
        </div>
        <span className="eyebrow">YOUR PRIVATE CAREER WORKSPACE</span>
        <h1>
          {configured ? "Welcome back." : "Finish setting up your workspace."}
        </h1>
        <p>
          {configured
            ? "Enter your workspace password to continue finding your next opportunity."
            : "This deployment cannot read APP_PASSWORD yet. Your career data stays locked until it is configured."}
        </p>
        {configured ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              setBusy(true);
              try {
                const response = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password, next }),
                });
                const result = await response.json();
                if (!response.ok)
                  throw new Error(
                    result.error || "Could not sign in. Please try again.",
                  );
                window.location.assign(result.next);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <label htmlFor="workspace-password">Workspace password</label>
            <div className="login-password">
              <input
                id="workspace-password"
                name="password"
                type={visible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                maxLength={1024}
                autoFocus
              />
              <button
                type="button"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary login-submit" disabled={busy}>
              {busy ? "Signing in…" : "Open my workspace"}
              <ArrowRight size={16} />
            </button>
            <p className="login-help">
              Use the password saved as <code>APP_PASSWORD</code> in Vercel. No
              username is needed.
            </p>
          </form>
        ) : (
          <ol className="login-setup">
            <li>
              Open your Vercel project → Settings → Environment Variables.
            </li>
            <li>
              Add <code>APP_PASSWORD</code> with a password you choose. Select
              the environment you are visiting: Production or Preview.
            </li>
            <li>Redeploy after saving, then open the newest deployment URL.</li>
          </ol>
        )}
        <div className="login-private">
          <ShieldCheck size={15} />
          Your profile, CV, and applications stay private.
        </div>
      </section>
    </main>
  );
}
