"use client";
import { useEffect, useState } from "react";
import { currencyTotals } from "@/lib/modules/bounties-client";
import type { WorkspaceSnapshot } from "@/lib/modules/types";
import { moduleRequest } from "./shared";
export default function WorkspaceOverview({
  jobs,
  navigate,
}: {
  jobs: number;
  navigate: (tab: string) => void;
}) {
  const [data, setData] = useState<WorkspaceSnapshot>();
  useEffect(() => {
    void moduleRequest<WorkspaceSnapshot>("state", undefined, "GET")
      .then(setData)
      .catch(() => {});
  }, []);
  const received = data?.storageAvailable
    ? Object.entries(currencyTotals(data.payments))
        .map(([currency, amount]) => `${currency} ${amount}`)
        .join(" · ") || "0 received"
    : "Storage unavailable";
  const cards = [
    { label: "Job opportunities", value: String(jobs), tab: "Job Finder" },
    {
      label: "Funding evidence checked",
      value: data?.storageAvailable
        ? String(
            data.bounties.filter((b) => b.reward && b.status === "open").length,
          )
        : "—",
      tab: "Coding Bounties",
    },
    {
      label: "Saved / active bounties",
      value: data?.storageAvailable ? String(data.tracked.length) : "—",
      tab: "Coding Bounties",
    },
    { label: "Bounty receipts", value: received, tab: "Coding Bounties" },
    {
      label: "Saved video ideas",
      value: data?.storageAvailable
        ? String(data.ideas.filter((i) => !i.rejected).length)
        : "—",
      tab: "YouTube Research",
    },
    {
      label: "Planned / scheduled content",
      value: data?.storageAvailable
        ? String(data.entries.filter((e) => e.status !== "Published").length)
        : "—",
      tab: "YouTube Research",
    },
  ];
  return (
    <section className="module-overview" aria-label="Workspace overview">
      {cards.map((c) => (
        <button key={c.label} onClick={() => navigate(c.tab)}>
          <span>{c.label}</span>
          <b>{c.value}</b>
          <small>Open {c.tab} ↗</small>
        </button>
      ))}
    </section>
  );
}
