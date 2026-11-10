/* global chrome */
import { applicationTarget, mapField, verifyForm } from "./generated/policy.js";
const get = async () => (await chrome.storage.session.get("pair")).pair;
const save = (pair) => chrome.storage.session.set({ pair });
const sha = async (text) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
async function request(origin, path, body, token) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      "X-Launchpad-Extension": chrome.runtime.id,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error || "Launchpad could not verify this operation.",
    );
  return value;
}
async function command(pair, body) {
  return request(
    pair.origin,
    `/api/assisted-companion/${pair.id}`,
    body,
    pair.token,
  );
}
async function content(pair, body) {
  if (!pair.tabId) throw new Error("Open the employer page first.");
  const tab = await chrome.tabs.get(pair.tabId);
  if (applicationTarget(tab.url).key !== pair.pack.target.key)
    throw new Error("This tab no longer matches the approved vacancy.");
  await chrome.scripting.executeScript({
    target: { tabId: pair.tabId },
    files: ["content.js"],
  });
  const result = await chrome.tabs.sendMessage(pair.tabId, {
    type: "launchpad-content",
    ...body,
  });
  if (!result?.ok)
    throw new Error(result?.error || "Employer form could not be inspected.");
  return result.result;
}
function publicPair(pair) {
  return pair
    ? {
        id: pair.id,
        origin: pair.origin,
        target: pair.pack.target,
        company: pair.pack.company,
        title: pair.pack.title,
        state: pair.state,
        report: pair.report,
        errors: pair.errors,
        inFlight: pair.inFlight,
        packageHash: pair.packageHash,
        tabId: pair.tabId,
      }
    : null;
}
async function run(message) {
  if (message.action === "status")
    return { extensionId: chrome.runtime.id, pair: publicPair(await get()) };
  if (message.action === "pair") {
    if (await get())
      throw new Error("Disconnect the current attempt before pairing another.");
    const code = message.code?.match(/^launchpad1\.([\w-]+)$/)?.[1];
    if (!code || code.length > 4000)
      throw new Error("Paste the one-time Launchpad handoff code.");
    const handoff = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(code.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    const origin = new URL(handoff.origin);
    if (
      origin.origin !== handoff.origin ||
      origin.username ||
      origin.password ||
      !(
        origin.protocol === "https:" ||
        (origin.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(origin.hostname))
      )
    )
      throw new Error("Invalid Launchpad origin.");
    const claim = await request(
      origin.origin,
      "/api/assisted-companion/handoff",
      { token: handoff.token },
    );
    const payload = await request(
      origin.origin,
      `/api/assisted-companion/${claim.id}`,
      undefined,
      claim.leaseToken,
    );
    if (
      (await sha(JSON.stringify(payload.package))) !== payload.sha256 ||
      payload.package.id !== claim.id ||
      applicationTarget(payload.package.target.url).key !==
        payload.package.target.key
    )
      throw new Error("Approved package integrity or vacancy binding failed.");
    const pair = {
      id: claim.id,
      origin: origin.origin,
      token: claim.leaseToken,
      pack: payload.package,
      packageHash: payload.sha256,
      state: claim.state,
      inFlight: false,
    };
    await save(pair);
    return publicPair(pair);
  }
  const pair = await get();
  if (!pair)
    throw new Error("Pair an approved application from Launchpad first.");
  if (message.action === "disconnect") {
    try {
      await command(pair, { action: "release" });
    } finally {
      await chrome.storage.session.remove("pair");
    }
    return null;
  }
  if (message.action === "open") {
    if (pair.inFlight || pair.state === "confirmed-submission")
      throw new Error(
        "A submission was attempted. Check its outcome in Launchpad.",
      );
    const tab = pair.tabId
      ? await chrome.tabs.get(pair.tabId).catch(() => null)
      : null;
    pair.tabId = tab
      ? tab.id
      : (await chrome.tabs.create({ url: pair.pack.target.url })).id;
    if (tab) await chrome.tabs.update(tab.id, { active: true });
    await save(pair);
    return publicPair(pair);
  }
  if (message.action === "download") {
    // Deliberate manual upload fallback: no downloads permission or filesystem access.
    return pair.pack.files.map((f) => ({
      name: f.name,
      mime: f.mime,
      base64: f.base64,
      sha256: f.sha256,
    }));
  }
  if (message.action === "receipt") {
    if (!pair.inFlight && pair.state !== "uncertain-submission")
      throw new Error("There is no submission to confirm.");
    const tab = await chrome.tabs.get(pair.tabId);
    if (new URL(tab.url).hostname !== new URL(pair.pack.target.url).hostname)
      throw new Error(
        "Confirmation left the supported employer host. Reconcile it manually in Launchpad.",
      );
    await chrome.scripting.executeScript({
      target: { tabId: pair.tabId },
      files: ["content.js"],
    });
    const result = await chrome.tabs.sendMessage(pair.tabId, {
      type: "launchpad-content",
      action: "receipt",
    });
    if (!result?.ok || !result.result.text)
      throw new Error(
        "No explicit confirmation found. Submission remains uncertain. Do not submit again.",
      );
    const confirmed = await command(pair, {
      action: "receipt",
      ...result.result,
    });
    pair.state = confirmed.state;
    pair.report = confirmed.report;
    await save(pair);
    return publicPair(pair);
  }
  if (
    pair.inFlight ||
    ["uncertain-submission", "confirmed-submission"].includes(pair.state)
  )
    throw new Error(
      "A submission was attempted. Check confirmation or reconcile in Launchpad; never retry blindly.",
    );
  await command(pair, { action: "heartbeat" });
  if (message.action === "suggest") {
    const snapshot = await content(pair, { action: "inspect" });
    if (JSON.stringify(snapshot) !== JSON.stringify(pair.lastSnapshot))
      throw new Error(
        "Read the current form values before requesting suggestions.",
      );
    pair.proposalSnapshotHash = await sha(JSON.stringify(snapshot));
    const result = await command(pair, { action: "suggest" });
    pair.proposals = result.proposals.map((p) => ({
      ...p,
      value: pair.pack.facts[p.factKey],
    }));
    pair.aiUsage = {
      cached: result.cached,
      calls: result.calls,
      provider: result.provider,
    };
    await save(pair);
    return { proposals: pair.proposals, usage: pair.aiUsage };
  }
  if (message.action === "approve-suggestion") {
    const suggestion = pair.proposals?.find(
      (p) => p.fieldId === message.fieldId,
    );
    if (!suggestion || message.confirmed !== true)
      throw new Error(
        "Review and approve this contact mapping before filling it.",
      );
    const current = await content(pair, { action: "inspect" });
    if ((await sha(JSON.stringify(current))) !== pair.proposalSnapshotHash)
      throw new Error(
        "The form changed. Read it again and request fresh mapping suggestions.",
      );
    await content(pair, {
      action: "fill",
      plans: [{ id: suggestion.fieldId, value: suggestion.value }],
    });
    pair.state = "awaiting-user";
    pair.lastSnapshot = undefined;
    pair.proposals = [];
    pair.pendingMappings = [
      ...(pair.pendingMappings || []).filter(
        (m) => m.fieldId !== suggestion.fieldId,
      ),
      { fieldId: suggestion.fieldId, factKey: suggestion.factKey },
    ];
    await save(pair);
    return publicPair(pair);
  }
  if (message.action === "fill") {
    const initial = await content(pair, { action: "inspect" });
    if (initial.challenge || initial.unsupported)
      throw new Error(initial.challenge || initial.unsupported);
    const plans = initial.fields.map((field) => ({
      id: field.id,
      ...mapField(field, pair.pack),
    }));
    const filled = await content(pair, { action: "fill", plans });
    pair.errors = filled.errors;
    pair.report = verifyForm(pair.pack, filled.snapshot);
    pair.state = "awaiting-user";
    pair.lastSnapshot = undefined;
    await save(pair);
    return publicPair(pair);
  }
  if (message.action === "inspect" || message.action === "verify") {
    const snapshot = await content(pair, { action: "inspect" });
    const manualReviewed =
      message.manualConfirmed === true
        ? snapshot.fields
            .filter(
              (f) =>
                mapField(f, pair.pack).value === undefined &&
                !mapField(f, pair.pack).file &&
                (f.value || f.files?.length),
            )
            .map((f) => f.id)
        : [];
    const verified = await command(pair, {
      action: "verify",
      report: snapshot,
      manualReviewed,
      manualConfirmed: message.manualConfirmed === true,
      technicalMappings:
        message.manualConfirmed === true ? pair.pendingMappings || [] : [],
    });
    pair.report = verified.report;
    pair.reportHash = verified.reportHash;
    pair.state = verified.state;
    pair.lastSnapshot = snapshot;
    pair.snapshotHash = await sha(JSON.stringify(snapshot));
    await save(pair);
    return publicPair(pair);
  }
  if (message.action === "submit") {
    if (
      message.confirmation !== "SUBMIT" ||
      message.confirmed !== true ||
      pair.state !== "verified-ready" ||
      !pair.report?.ready
    )
      throw new Error(
        "Review all values, confirm the submission checkbox and type SUBMIT.",
      );
    const fresh = await content(pair, { action: "inspect" });
    if (JSON.stringify(fresh) !== JSON.stringify(pair.lastSnapshot)) {
      const verified = await command(pair, {
        action: "verify",
        report: fresh,
        manualReviewed: [],
      });
      pair.report = verified.report;
      pair.state = verified.state;
      pair.lastSnapshot = undefined;
      await save(pair);
      throw new Error(
        "The form changed after review. Review and verify it again before confirming submission.",
      );
    }
    const manualReviewed = pair.report.fields
      .filter((f) => f.verification === "manual-reviewed")
      .map((f) => f.id);
    const verified = await command(pair, {
      action: "verify",
      report: fresh,
      manualReviewed,
      manualConfirmed: manualReviewed.length > 0,
      technicalMappings: pair.pendingMappings || [],
    });
    if (!verified.report?.ready)
      throw new Error("A fresh verification failed. Review the form again.");
    pair.reportHash = verified.reportHash;
    pair.inFlight = true;
    pair.state = "uncertain-submission";
    await save(pair);
    // No click unless the server has acknowledged durable intent. A lost response is uncertain.
    await command(pair, {
      action: "submit-intent",
      confirmed: true,
      reportHash: pair.reportHash,
    });
    try {
      await content(pair, {
        action: "submit",
        snapshotHash: pair.snapshotHash,
      });
    } catch {
      await command(pair, {
        action: "failure",
        reason:
          "The browser did not confirm whether a submit click completed. Reconcile the outcome; do not retry automatically.",
      }).catch(() => {});
      throw new Error(
        "Submission outcome uncertain. No automatic retry will occur. Check confirmation or reconcile in Launchpad.",
      );
    }
    return publicPair(pair);
  }
  throw new Error("Unknown companion action.");
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL("popup.html")
  )
    return;
  run(message)
    .then((result) => respond({ ok: true, result }))
    .catch((error) => respond({ ok: false, error: error.message }));
  return true;
});
