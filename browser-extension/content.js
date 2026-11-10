/* global chrome */
// Isolated content script. Employer text is data, never executable instructions.
(() => {
  if (globalThis.__launchpadCompanion) return;
  globalThis.__launchpadCompanion = true;
  let permit = false,
    lastSubmit = false;
  const forms = () => {
    const known = [
      ...document.querySelectorAll(
        "form#application-form, form#application_form, form.application-form, form.ashby-application-form, form[data-ashby-application-form]",
      ),
    ];
    if (known.length || location.hostname !== "jobs.ashbyhq.com") return known;
    return [...document.forms].filter((f) => {
      const inputs = [...f.querySelectorAll("input")];
      return (
        inputs.some((el) => idOf(el) === "_systemfield_name") &&
        inputs.some((el) => idOf(el) === "_systemfield_email") &&
        inputs.some((el) => idOf(el) === "_systemfield_resume")
      );
    });
  };
  const form = () => forms()[0];
  const visible = (el) =>
    !!el.getClientRects().length &&
    getComputedStyle(el).visibility !== "hidden";
  const controls = () =>
    form()
      ? [...form().querySelectorAll("input,textarea,select")].filter(
          (el) =>
            !["hidden", "submit", "button", "reset", "password"].includes(
              el.type,
            ) &&
            (el.type === "file" ||
              (visible(el) && !el.closest('[hidden],[aria-hidden="true"]'))),
        )
      : [];
  const idOf = (el) => {
    if (location.hostname === "jobs.ashbyhq.com") {
      const label = rawLabel(el)
        .replace(/\s*[*＊✱]\s*$/, "")
        .trim()
        .toLowerCase();
      if (el.name?.startsWith("_systemfield_")) return el.name;
      if (el.id?.startsWith("_systemfield_")) return el.id;
      if (
        ["name", "full name"].includes(label) &&
        ["text", ""].includes(el.type)
      )
        return "_systemfield_name";
      if (["email", "email address"].includes(label))
        return "_systemfield_email";
      if (
        el.type === "file" &&
        /^(?:resume\s*\/?\s*cv|resume|cv|curriculum vitae)$/.test(label)
      )
        return "_systemfield_resume";
      if (el.type === "file" && /^cover[ -]letter$/.test(label))
        return "_systemfield_cover_letter";
    }
    if (
      el.type === "file" &&
      !["resume", "resume-upload-input"].includes(el.id) &&
      el.name !== "resume" &&
      /^cover[ -]letter$/i.test(
        rawLabel(el)
          .replace(/\s*[*＊✱]\s*$/, "")
          .trim(),
      )
    )
      return "cover_letter";
    return el.type === "file" &&
      (el.name === "resume" || el.id === "resume-upload-input")
      ? "resume"
      : el.name?.startsWith("_systemfield_")
        ? el.name
        : ["radio", "checkbox"].includes(el.type) && el.name
          ? el.name
          : el.id || el.name || "";
  };
  const submitControl = () =>
    [
      ...(form()?.querySelectorAll(
        'button[type="submit"],input[type="submit"],#btn-submit',
      ) || []),
    ].find(visible);
  function rawLabel(el) {
    const labelled = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ")
      .trim();
    const ordinary =
      labelled ||
      el.getAttribute("aria-label") ||
      el.closest(".application-question")?.querySelector(".application-label")
        ?.textContent ||
      (["radio", "checkbox"].includes(el.type)
        ? el.closest("fieldset")?.querySelector("legend")?.textContent
        : "") ||
      [...(el.labels || [])].map((l) => l.textContent).join(" ") ||
      el
        .closest('[class*="ashby-application-form-field"]')
        ?.querySelector("label")?.textContent ||
      "";
    if (
      el.type === "file" &&
      (!ordinary || /^attach\s*[*＊✱]?$/i.test(ordinary.trim()))
    )
      return (
        document.getElementById(`upload-label-${el.id}`)?.textContent ||
        ordinary
      );
    return ordinary;
  }
  function labelOf(el) {
    return rawLabel(el)
      .replace(/\s*[*＊✱]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function errorsFor(el) {
    const ids = [
      ...(el.getAttribute("aria-errormessage") || "").split(/\s+/),
      ...(el.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((id) => /error/i.test(id)),
    ];
    return [
      ...new Set(
        ids
          .map((id) => document.getElementById(id))
          .filter((node) => node && visible(node) && node.textContent.trim())
          .map((node) => node.textContent.trim().slice(0, 1000)),
      ),
    ];
  }
  const confirmationNodes = () =>
    [
      ...document.querySelectorAll(
        '#application_confirmation,.application-confirmation,.application--confirmation,[data-testid="application-confirmation"],.application-confirmation-container,.postings-confirmation,.ashby-application-form-success,[data-testid="application-success"]',
      ),
    ].filter(visible);
  const positiveConfirmation = (text) =>
    /thank you for applying|application (?:has been |was )?(?:successfully )?(?:submitted|received)|thank you for your (?:application|interest)/i.test(
      text,
    );
  async function sha(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  async function snapshot() {
    const fields = [],
      seen = new Set();
    for (const el of controls()) {
      const group =
        ["radio", "checkbox"].includes(el.type) && el.name
          ? controls().filter((c) => c.type === el.type && c.name === el.name)
          : [el];
      if (group.length > 1 && seen.has(idOf(el))) continue;
      seen.add(idOf(el));
      const combo = el.getAttribute("role") === "combobox";
      const selectRoot = el.closest('[class*="select__control"]');
      const selected = selectRoot
        ? [
            ...selectRoot.querySelectorAll(
              '[class*="select__single-value"],[class*="select__multi-value__label"]',
            ),
          ]
            .map((e) => e.textContent)
            .join(", ")
        : "";
      const backing = selectRoot
        ? [...selectRoot.querySelectorAll('input[type="hidden"]')].filter(
            (n) => n.value.trim() && !n.disabled,
          )
        : [];
      const acceptedCombo =
        combo && !!selected && !el.value.trim() && backing.length === 1;
      const kind =
        group.length > 1
          ? el.type === "radio"
            ? "radio"
            : "checkbox-group"
          : el.type === "date"
            ? "date"
            : el.type === "file"
              ? "file"
              : el.tagName === "SELECT"
                ? "select"
                : el.tagName === "TEXTAREA"
                  ? "textarea"
                  : el.type === "checkbox"
                    ? "checkbox"
                    : acceptedCombo
                      ? "select"
                      : combo || ["radio", "number"].includes(el.type)
                        ? "unsupported"
                        : "text";
      const field = {
        id: idOf(el),
        label: labelOf(el),
        kind,
        required: el.required || el.getAttribute("aria-required") === "true",
        value:
          el.type === "checkbox"
            ? el.checked
              ? "Yes"
              : "No"
            : el.tagName === "SELECT"
              ? el.value && !el.selectedOptions[0]?.disabled
                ? el.selectedOptions[0]?.textContent?.trim() || ""
                : ""
              : combo
                ? selected || el.value
                : el.type === "radio"
                  ? el.checked
                    ? el.value
                    : ""
                  : el.value || "",
        valid: el.validity.valid && el.getAttribute("aria-invalid") !== "true",
        disabled: Boolean(el.disabled),
        readOnly: Boolean(el.readOnly),
        accepted: combo
          ? acceptedCombo
          : el.tagName === "SELECT"
            ? !!el.value && !el.selectedOptions[0]?.disabled
            : true,
        errors: errorsFor(el),
      };
      if (el.tagName === "SELECT")
        field.options = [...el.options].map((o) => o.textContent.trim());
      if (el.tagName === "SELECT") {
        field.acceptedValue = el.value;
        field.optionValues = [...el.options].map((o) => o.value);
      }
      if (acceptedCombo) field.acceptedValue = backing[0].value;
      if (group.length > 1) {
        const option = (node) =>
          [...(node.labels || [])].map((l) => l.textContent.trim()).join(" ") ||
          node.value;
        field.value = group
          .filter((c) => c.checked)
          .map(option)
          .join("\n");
        field.options = group.map(option);
        field.acceptedValue = group
          .filter((c) => c.checked)
          .map((c) => c.value)
          .join("\n");
        field.optionValues = group.map((c) => c.value);
        field.required =
          group.some(
            (c) => c.required || c.getAttribute("aria-required") === "true",
          ) ||
          !!el.closest(".application-question")?.querySelector(".required");
        field.valid = group.every((c) => c.validity.valid);
      }
      if (el.closest(".application-question")?.querySelector(".required"))
        field.required = true;
      if (el.type === "file") {
        field.files = [];
        for (const file of el.files || []) {
          const bytes = await file.arrayBuffer();
          const sniffed =
            new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
              ? "application/pdf"
              : "application/octet-stream";
          field.files.push({
            name: file.name,
            size: file.size,
            sha256: await sha(bytes),
            mime: file.type || sniffed,
          });
        }
        field.value = "";
      }
      fields.push(field);
    }
    for (const el of form()?.querySelectorAll(
      '[role="combobox"]:not(input),[role="listbox"],[role="checkbox"]:not(input),[role="radiogroup"]',
    ) || []) {
      if (!visible(el) || el.querySelector("input,select,textarea")) continue;
      fields.push({
        id: el.id || "",
        label: labelOf(el),
        kind: "unsupported",
        required: el.getAttribute("aria-required") === "true",
        value: el.getAttribute("aria-valuetext") || el.textContent.trim(),
        valid: el.getAttribute("aria-invalid") !== "true",
        disabled: el.getAttribute("aria-disabled") === "true",
        accepted: false,
        errors: errorsFor(el),
      });
    }
    const challengeWidgets = [
      ...document.querySelectorAll(
        'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],.cf-turnstile',
      ),
    ].some(visible);
    const solved = [
      ...document.querySelectorAll(
        '[name="g-recaptcha-response"],[name="h-captcha-response"],[name="cf-turnstile-response"]',
      ),
    ].some((el) => !!el.value);
    const password = [
      ...document.querySelectorAll('input[type="password"]'),
    ].some(visible);
    const submit = submitControl();
    const employerErrors = [
      ...(form()?.querySelectorAll(
        '[role="alert"],.application-error,.application--error,.ashby-application-form-error,.error-message',
      ) || []),
    ]
      .filter(visible)
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    const alreadyConfirmed = confirmationNodes().some((n) =>
      positiveConfirmation(n.textContent),
    );
    return {
      url: location.href,
      challenge: password
        ? "Employer login required. Complete it yourself; the companion never handles credentials."
        : challengeWidgets && !solved
          ? "Human verification required. Complete the challenge yourself, then inspect again."
          : "",
      unsupported: alreadyConfirmed
        ? "This page already contains an application confirmation. Check your existing submission before preparing another."
        : employerErrors.length
          ? `Employer validation: ${employerErrors.join("; ").slice(0, 2000)}`
          : forms().length !== 1
            ? "No single supported application form found. Embedded, changed or unknown forms need manual completion."
            : !submit
              ? "Intermediate step: no final submit control. Complete Next yourself and inspect the final form again; all identity fields and documents must be verifiable together."
              : "",
      fields,
    };
  }
  function stop(e) {
    if (
      form() &&
      (e.target === form() || form().contains(e.target)) &&
      !permit
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  document.addEventListener(
    "submit",
    (e) => {
      stop(e);
      if (permit) permit = false;
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const button = e.target.closest(
        'button[type="submit"],input[type="submit"],#btn-submit',
      );
      if (button) stop(e);
    },
    true,
  );
  function notify(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function fill(plans) {
    const before = await snapshot();
    if (
      before.challenge ||
      (before.unsupported &&
        !before.unsupported.startsWith("Intermediate step:"))
    )
      throw new Error(before.challenge || before.unsupported);
    const errors = [];
    for (const plan of plans) {
      const matches = controls().filter((el) => idOf(el) === plan.id);
      if (
        matches.length > 1 &&
        matches.every(
          (e) =>
            ["radio", "checkbox"].includes(e.type) &&
            e.name === matches[0].name,
        )
      ) {
        if (
          plan.value !== undefined &&
          !/\bagree\b|\bconsent\b|acknowledge|terms (?:of|and)|privacy policy/i.test(
            labelOf(matches[0]),
          )
        ) {
          const values = plan.value.split("\n"),
            option = (node) =>
              [...(node.labels || [])]
                .map((l) => l.textContent.trim())
                .join(" ") || node.value;
          if (
            values.some((v) => !matches.some((e) => option(e) === v)) ||
            (matches[0].type === "radio" && values.length !== 1)
          ) {
            errors.push(`${plan.id}: no exact group option`);
            continue;
          }
          for (const e of matches) {
            if (e.checked !== values.includes(option(e))) e.click();
            notify(e);
          }
        }
        continue;
      }
      if (matches.length !== 1) {
        errors.push(`${plan.id}: field missing or duplicated`);
        continue;
      }
      const el = matches[0];
      if (
        el.disabled ||
        el.readOnly ||
        /\bagree\b|\bconsent\b|acknowledge|terms (?:of|and)|privacy policy/i.test(
          labelOf(el),
        )
      )
        continue;
      try {
        if (plan.file) {
          const bytes = Uint8Array.from(atob(plan.file.base64), (c) =>
            c.charCodeAt(0),
          );
          if ((await sha(bytes)) !== plan.file.sha256)
            throw new Error("Approved file integrity check failed");
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([bytes], plan.file.name, { type: plan.file.mime }),
          );
          el.files = transfer.files;
          notify(el);
        } else if (plan.value !== undefined && el.tagName === "SELECT") {
          const option = [...el.options].filter(
            (o) => o.textContent.trim() === plan.value && !o.disabled,
          );
          if (option.length !== 1)
            throw new Error("No unambiguous exact option");
          el.value = option[0].value;
          notify(el);
        } else if (plan.value !== undefined && el.type === "checkbox") {
          if (!["Yes", "No"].includes(plan.value))
            throw new Error("Checkbox needs an exact Yes or No answer");
          if (el.checked !== (plan.value === "Yes")) el.click();
          notify(el);
        } else if (
          (plan.value !== undefined &&
            el.getAttribute("role") !== "combobox" &&
            ["text", "email", "tel", "url", "search", "date"].includes(
              el.type,
            )) ||
          (plan.value !== undefined && el.tagName === "TEXTAREA")
        ) {
          const prototype =
            el.tagName === "TEXTAREA"
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value").set.call(
            el,
            plan.value,
          );
          notify(el);
        }
      } catch (e) {
        errors.push(`${plan.id}: ${e.message}`);
      }
    }
    return { errors, snapshot: await snapshot() };
  }
  async function run(message) {
    if (message.action === "inspect") return snapshot();
    if (message.action === "fill") return fill(message.plans);
    if (message.action === "submit") {
      if (lastSubmit)
        throw new Error(
          "A submission was already attempted in this tab. Never retry automatically.",
        );
      const current = await snapshot();
      if (
        (await sha(new TextEncoder().encode(JSON.stringify(current)))) !==
          message.snapshotHash ||
        current.challenge ||
        current.unsupported
      )
        throw new Error(
          "The form changed after review. Submission stopped; reconcile the persisted intent in Launchpad.",
        );
      const submit = submitControl();
      if (
        !submit ||
        submit.disabled ||
        submit.getAttribute("aria-disabled") === "true"
      )
        throw new Error("Submit control unavailable. No click was made.");
      lastSubmit = true;
      permit = true;
      submit.click();
      permit = false;
      return { clicked: true };
    }
    if (message.action === "receipt") {
      const nodes = confirmationNodes();
      const text = nodes
        .filter(visible)
        .map((n) => n.textContent.trim())
        .join("\n")
        .slice(0, 2000);
      return {
        url: location.href,
        text: positiveConfirmation(text) ? text : "",
      };
    }
    throw new Error("Unsupported companion operation");
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.type !== "launchpad-content")
      return;
    run(message)
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
