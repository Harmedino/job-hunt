/* global chrome */
import { employerPermissions, manualReviewKey } from "./generated/policy.js";
const el = (id) => document.getElementById(id);
const send = async (action, data = {}) => {
  const response = await chrome.runtime.sendMessage({ action, ...data });
  if (!response?.ok)
    throw new Error(response?.error || "Companion unavailable.");
  return response.result;
};
let pair;
const manualApprovals = new Map();
function render(value) {
  if (
    pair?.id !== value?.id ||
    JSON.stringify(pair?.report?.fields.map(manualReviewKey)) !==
      JSON.stringify(value?.report?.fields.map(manualReviewKey))
  ) {
    manualApprovals.clear();
    el("confirmed").checked = false;
    el("confirmation").value = "";
  }
  pair = value;
  el("pairing").hidden = !!pair;
  el("workflow").hidden = !pair;
  if (!pair) return;
  el("job").textContent = `${pair.company} — ${pair.title}`;
  el("state").textContent = pair.state;
  el("hash").textContent = `Approved package SHA256: ${pair.packageHash}`;
  el("fields").replaceChildren();
  el("manual-fields").replaceChildren();
  for (const field of pair.report?.fields || []) {
    const row = document.createElement("tr");
    for (const text of [
      field.label || field.id,
      field.expected,
      field.kind === "file"
        ? (field.files || [])
            .map((f) => `${f.name} · SHA256 ${f.sha256}`)
            .join(", ") || "No attachment"
        : field.value || "Empty",
      field.verification,
    ]) {
      const td = document.createElement("td");
      td.textContent = text;
      row.append(td);
    }
    el("fields").append(row);
    if (
      ["unresolved", "manual-reviewed"].includes(field.verification) &&
      !["file", "unsupported"].includes(field.kind) &&
      field.valid &&
      !field.disabled &&
      field.accepted !== false &&
      field.value.trim()
    ) {
      const label = document.createElement("label"),
        checkbox = document.createElement("input"),
        fingerprint = manualReviewKey(field);
      checkbox.type = "checkbox";
      checkbox.checked = manualApprovals.get(field.id) === fingerprint;
      checkbox.onchange = () => {
        if (checkbox.checked) manualApprovals.set(field.id, fingerprint);
        else manualApprovals.delete(field.id);
      };
      label.append(
        checkbox,
        document.createTextNode(
          ` I reviewed ${field.label || field.id}: ${field.value}`,
        ),
      );
      el("manual-fields").append(label);
    }
  }
  el("blockers").replaceChildren();
  for (const blocker of [
    ...(pair.errors || []),
    ...(pair.report?.blockers || []),
  ]) {
    const li = document.createElement("li");
    li.textContent = blocker;
    el("blockers").append(li);
  }
  el("submit").disabled = pair.state !== "verified-ready" || pair.inFlight;
  for (const id of ["fill", "inspect", "verify", "open"])
    el(id).disabled = pair.inFlight || pair.state === "confirmed-submission";
}
async function task(fn) {
  el("error").textContent = "";
  for (const button of document.querySelectorAll("button"))
    button.disabled = true;
  try {
    const result = await fn();
    if (result !== undefined) render(result);
  } catch (e) {
    el("error").textContent = e.message;
  } finally {
    for (const button of document.querySelectorAll("button"))
      button.disabled = false;
    const status = await send("status").catch(() => null);
    if (status) render(status.pair);
  }
}
el("pair").onclick = () =>
  task(async () => {
    const code = el("code").value.trim(),
      data = code.split(".")[1];
    if (!data) throw new Error("Paste a Launchpad handoff code.");
    const handoff = JSON.parse(
      atob(data.replaceAll("-", "+").replaceAll("_", "/")),
    );
    const origin = new URL(handoff.origin);
    // Chrome host patterns are host-scoped, including all local ports. The bearer
    // handoff still binds requests to the exact server origin and attempt.
    if (
      !(await chrome.permissions.request({
        origins: [`${origin.protocol}//${origin.hostname}/*`],
      }))
    )
      throw new Error("Launchpad host permission was not granted.");
    const result = await send("pair", { code });
    el("code").value = "";
    return result;
  });
el("open").onclick = () =>
  task(async () => {
    if (
      !(await chrome.permissions.request({
        origins: employerPermissions(pair.target),
      }))
    )
      throw new Error("Employer host permission was not granted.");
    return send("open");
  });
for (const action of ["fill", "inspect", "receipt", "disconnect"])
  el(action).onclick = () => task(() => send(action));
el("verify").onclick = () =>
  task(() =>
    send("verify", {
      manualApprovals: [...manualApprovals].map(([id, fingerprint]) => ({
        id,
        fingerprint,
      })),
    }),
  );
el("suggest").onclick = () =>
  task(async () => {
    const result = await send("suggest");
    el("suggestions").replaceChildren();
    const usage = document.createElement("p");
    usage.textContent = `Form AI: ${result.usage.cached ? "cached suggestions, no new call" : `${result.usage.calls} call attempted`}. Provider billing follows your account; no monetary cost estimate is available.`;
    el("suggestions").append(usage);
    for (const p of result.proposals) {
      const row = document.createElement("p"),
        button = document.createElement("button");
      row.textContent = `${p.fieldId} → ${p.factKey}: ${p.value}. ${p.reason} `;
      button.textContent = "Approve and fill this contact value";
      button.onclick = () =>
        task(() =>
          send("approve-suggestion", { fieldId: p.fieldId, confirmed: true }),
        );
      row.append(button);
      el("suggestions").append(row);
    }
    if (!result.proposals.length) {
      const p = document.createElement("p");
      p.textContent =
        "No safe contact mapping was proposed. Complete unknown fields manually.";
      el("suggestions").append(p);
    }
  });
el("submit").onclick = () =>
  task(async () => {
    try {
      return await send("submit", {
        confirmed: el("confirmed").checked,
        confirmation: el("confirmation").value,
      });
    } finally {
      el("confirmed").checked = false;
      el("confirmation").value = "";
    }
  });
el("download").onclick = () =>
  task(async () => {
    const files = await send("download");
    el("files").replaceChildren();
    for (const file of files) {
      const a = document.createElement("a");
      a.textContent = `Download ${file.name} (${file.sha256})`;
      a.href = `data:${file.mime};base64,${file.base64}`;
      a.download = file.name;
      el("files").append(a, document.createElement("br"));
    }
  });
const status = await send("status");
el("extension-id").textContent = status.extensionId;
render(status.pair);
