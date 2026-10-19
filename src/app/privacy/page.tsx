import Link from "next/link";
export default function Privacy() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: 24,
        lineHeight: 1.8,
      }}
    >
      <h1>Workspace privacy & data controls</h1>
      <p>
        This personal workspace stores your job, bounty and creative planning
        records in the MongoDB database configured by its operator. Its existing
        password protects all workspace data. Everyone with that password uses
        the same owner workspace.
      </p>
      <h2>YouTube and Google access</h2>
      <p>
        Public research uses YouTube API Services. Connecting a channel grants
        read-only access to your channel and YouTube Analytics reports. Access
        and refresh tokens are encrypted server-side with AES-256-GCM. Tokens
        are never sent to the browser. We do not upload, publish, download
        footage, claim competitor private analytics, or calculate custom
        competitor scores.
      </p>
      <p>
        Public metadata snapshots are refreshed or expire before 30 days; the
        app does not keep historical competitor statistics. Private scheduled
        analytics snapshots expire after one day. Explicitly saved original
        ideas, prompts and your notes remain until you delete them. AI
        interpretations are cached for at most one day.
      </p>
      <p>
        Use the Analytics tab’s Disconnect action to revoke the Google grant and
        delete local channel tokens and AI caches. You can also revoke access in
        your{" "}
        <a href="https://myaccount.google.com/permissions">
          Google account permissions
        </a>
        . Use Remove reference, Delete idea, Remove from plan, and Remove note
        for saved content. Contact your deployment operator to delete the entire
        workspace database or backups.
      </p>
      <h2>AI processing</h2>
      <p>
        Requested AI features send selected task metadata, saved skill
        preferences, selected research title/description metadata, creative
        profiles or authorized analytics to your configured OpenAI or Gemini
        provider. AI features run only on your explicit request. Do not include
        secrets in notes or prompts. Source text and provider interpretations
        can be inaccurate; verify payment and publication decisions.
      </p>
      <p>
        Using the YouTube features is subject to{" "}
        <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>{" "}
        and the{" "}
        <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
      </p>
      <Link href="/">Back to workspace</Link>
    </main>
  );
}
