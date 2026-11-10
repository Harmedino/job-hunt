/** Shared, deterministic Assisted Apply policy. No AI or employer submission API. */
export const factKeys = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "linkedin",
  "github",
  "portfolio",
] as const;
export type FactKey = (typeof factKeys)[number];
export type AssistedState =
  | "awaiting-user"
  | "verified-ready"
  | "uncertain-submission"
  | "confirmed-submission";
export type GreenhouseTarget = {
  platform?: "Greenhouse" | "Lever" | "Ashby";
  board: string;
  jobId: string;
  url: string;
  key: string;
};
export function greenhouseTarget(value: string): GreenhouseTarget {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)
  )
    throw new Error(
      "Assisted Apply v1 supports original HTTPS Greenhouse job links only.",
    );
  const parts = url.pathname.match(
    /^\/([a-zA-Z0-9_-]{1,100})\/jobs\/(\d{1,20})\/?$/,
  );
  if (!parts)
    throw new Error(
      "Choose an individual Greenhouse job, not a company board or an embedded link.",
    );
  return {
    platform: "Greenhouse",
    board: parts[1],
    jobId: parts[2],
    url: `https://job-boards.greenhouse.io/${parts[1]}/jobs/${parts[2]}`,
    key: `greenhouse:${parts[1].toLowerCase()}:${parts[2]}`,
  };
}
export function applicationTarget(value: string): GreenhouseTarget {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.port || u.username || u.password)
    throw new Error("Use an original HTTPS employer application URL.");
  if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(u.hostname))
    return greenhouseTarget(value);
  const lever = u.pathname.match(
    /^\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9-]{16,100})(?:\/apply)?\/?$/,
  );
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(u.hostname) && lever)
    return {
      platform: "Lever",
      board: lever[1],
      jobId: lever[2],
      url: `https://${u.hostname}/${lever[1]}/${lever[2]}/apply`,
      key: `lever:${u.hostname}:${lever[1].toLowerCase()}:${lever[2]}`,
    };
  const ashby = u.pathname.match(
    /^\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9-]{16,100})(?:\/application)?\/?$/,
  );
  if (u.hostname === "jobs.ashbyhq.com" && ashby)
    return {
      platform: "Ashby",
      board: ashby[1],
      jobId: ashby[2],
      url: `https://jobs.ashbyhq.com/${ashby[1]}/${ashby[2]}/application`,
      key: `ashby:${ashby[1].toLowerCase()}:${ashby[2]}`,
    };
  throw new Error(
    "Supported original application pages: Greenhouse, Lever and Ashby.",
  );
}
export function sameGreenhousePage(value: string, target: GreenhouseTarget) {
  try {
    return applicationTarget(value).key === target.key;
  } catch {
    return false;
  }
}
/** Confirmation URLs must still identify the approved board AND vacancy. */
export function confirmationTarget(value: string, target: GreenhouseTarget) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    const suffix = /\/(?:confirmation|thank_you|thank-you|thanks)\/?$/;
    url.pathname = url.pathname.replace(suffix, "");
    return applicationTarget(url.href).key === target.key;
  } catch {
    return false;
  }
}
export function employerPermissions(target: GreenhouseTarget) {
  return target.key.startsWith("greenhouse:")
    ? ["https://boards.greenhouse.io/*", "https://job-boards.greenhouse.io/*"]
    : [new URL(target.url).origin + "/*"];
}
export const confirmationMessage = (text: string) =>
  /thank you for applying|application (?:has been |was )?(?:successfully )?(?:submitted|received)|thank you for your (?:application|interest)/i.test(
    text,
  );
export const questionKey = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/\s*[*＊✱]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
export type BankAnswer = {
  id: string;
  question: string;
  answer: string;
  vacancyKey: string;
  confirmedAt: string;
  source?: string;
  sourceUrl?: string;
  updatedAt?: string;
  disabled?: boolean;
  profileHash?: string;
  invalidated?: boolean;
};
export type PackageFile = {
  kind: "cv" | "letter";
  name: string;
  mime: string;
  size: number;
  sha256: string;
  base64: string;
};
export type AssistedPackage = {
  version: 1;
  id: string;
  applicationId: string;
  draftId: string;
  approvedAt: string;
  target: GreenhouseTarget;
  company: string;
  title: string;
  facts: Partial<Record<FactKey, string>>;
  answers: BankAnswer[];
  files: PackageFile[];
  profileHash?: string;
};
export type FormField = {
  id: string;
  label: string;
  kind:
    | "text"
    | "textarea"
    | "select"
    | "checkbox"
    | "file"
    | "unsupported"
    | "radio"
    | "checkbox-group"
    | "date";
  required: boolean;
  value: string;
  valid: boolean;
  disabled: boolean;
  readOnly?: boolean;
  accepted?: boolean;
  acceptedValue?: string;
  optionValues?: string[];
  errors?: string[];
  options?: string[];
  files?: { name: string; size: number; sha256: string; mime?: string }[];
};
export type FieldPlan = { value?: string; file?: PackageFile; source: string };
export function manualReviewKey(field: FormField) {
  return JSON.stringify([
    field.id,
    field.label,
    field.kind,
    field.value,
    field.required,
    field.valid,
    field.disabled,
    field.readOnly,
    field.accepted,
    field.acceptedValue,
    field.options,
    field.optionValues,
    field.errors,
  ]);
}
const contacts: Record<string, [FactKey, string[]]> = {
  first_name: ["firstName", ["first name"]],
  last_name: ["lastName", ["last name"]],
  email: ["email", ["email", "email address"]],
  phone: ["phone", ["phone", "phone number"]],
  linkedin: [
    "linkedin",
    ["linkedin", "linkedin profile", "linkedin profile url"],
  ],
  website: ["portfolio", ["website", "portfolio", "portfolio url"]],
  name: ["firstName", []],
};
export function mapField(field: FormField, pack: AssistedPackage): FieldPlan {
  if (
    /\bagree\b|\bconsent\b|acknowledge|terms (?:of|and)|privacy policy/i.test(
      field.label,
    )
  )
    return { source: "Legal agreement requires manual review and action" };
  if (field.kind === "file") {
    const label = questionKey(field.label);
    const kind =
      ["resume", "_systemfield_resume"].includes(field.id) &&
      /^(?:resume\s*\/?\s*cv|resume|cv|curriculum vitae)$/.test(label)
        ? "cv"
        : ["cover_letter", "_systemfield_cover_letter"].includes(field.id) &&
            /^(?:cover[ -]letter)(?:\s*\/?\s*lettre de motivation)?$/.test(
              label,
            )
          ? "letter"
          : undefined;
    const file = pack.files.find((f) => f.kind === kind);
    return {
      file,
      source: file
        ? `Approved ${kind} file (${file.sha256})`
        : "Manual document review required",
    };
  }
  const contact =
    contacts[field.id] ||
    Object.values(contacts).find(([, labels]) =>
      labels.includes(questionKey(field.label)),
    );
  if (
    ["name", "_systemfield_name", "full_name"].includes(field.id) &&
    field.kind === "text" &&
    ["full name", "name"].includes(questionKey(field.label)) &&
    pack.facts.firstName &&
    pack.facts.lastName
  )
    return {
      value: `${pack.facts.firstName} ${pack.facts.lastName}`,
      source: "Owner-verified full name",
    };
  if (
    contact &&
    field.kind === "text" &&
    contact[1].includes(questionKey(field.label))
  ) {
    return {
      value: pack.facts[contact[0]],
      source: `Owner-verified ${contact[0]}`,
    };
  }
  const answers = pack.answers.filter(
    (a) =>
      (a.vacancyKey === pack.target.key || a.vacancyKey === "*") &&
      !a.disabled &&
      !a.invalidated &&
      a.confirmedAt &&
      questionKey(a.question) === questionKey(field.label),
  );
  if (answers.length === 1)
    return {
      value: answers[0].answer,
      source: `Private answer ${answers[0].id}`,
    };
  return {
    source:
      answers.length > 1
        ? "Conflicting answers; owner review required"
        : "No verified answer; owner input required",
  };
}
export type Verification = {
  url: string;
  challenge: string;
  unsupported: string;
  fields: (FormField & {
    source: string;
    expected: string;
    verification: string;
  })[];
  blockers: string[];
  ready: boolean;
};
export function verifyForm(
  pack: AssistedPackage,
  input: {
    url: string;
    challenge: string;
    unsupported: string;
    fields: FormField[];
  },
  manualReviewed: string[] = [],
): Verification {
  const blockers: string[] = [];
  if (!sameGreenhousePage(input.url, pack.target))
    blockers.push("The employer page no longer matches the approved vacancy.");
  if (input.challenge) blockers.push(input.challenge);
  if (input.unsupported) blockers.push(input.unsupported);
  const ids = input.fields.map((f) => f.id);
  if (
    ids.length > 200 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !id)
  )
    blockers.push(
      "The form has missing, duplicate or excessive field identifiers.",
    );
  for (const id of pack.target.platform === "Lever"
    ? ["name", "email", "resume"]
    : pack.target.platform === "Ashby"
      ? ["_systemfield_name", "_systemfield_email", "_systemfield_resume"]
      : ["first_name", "last_name", "email", "resume"])
    if (!ids.includes(id))
      blockers.push(
        `Expected ${pack.target.platform || "Greenhouse"} field missing: ${id}.`,
      );
  if (
    pack.files.some((f) => f.kind === "letter") &&
    !input.fields.some((f) => mapField(f, pack).file?.kind === "letter")
  )
    blockers.push(
      "The approved cover letter has no supported upload field. Approve a CV-only package or complete the application manually.",
    );
  const fields = input.fields.map((field) => {
    const plan = mapField(field, pack);
    const empty =
      field.kind === "file"
        ? !field.files?.length
        : field.kind === "checkbox"
          ? field.value !== "Yes"
          : !field.value.trim();
    let verification = "empty";
    let detail = "";
    if (field.disabled) verification = "unsupported";
    else if (!field.valid || field.errors?.length) verification = "invalid";
    else if (field.required && empty) verification = "required-missing";
    else if (field.accepted === false && (!empty || field.required))
      verification = "unaccepted";
    else if (field.kind === "unsupported" && (!empty || field.required))
      verification = "unsupported";
    else if (field.kind === "file" && plan.file) {
      const actual = field.files || [];
      detail =
        actual.length !== 1
          ? "Expected one attached document."
          : actual[0].name !== plan.file.name
            ? "The attachment filename differs from the approved file."
            : actual[0].size !== plan.file.size
              ? "The attachment size differs from the approved file."
              : actual[0].mime !== plan.file.mime
                ? "The attachment MIME type is missing or differs from the approved PDF. Reload the updated companion and attach the approved file."
                : actual[0].sha256 !== plan.file.sha256
                  ? "The attachment SHA-256 differs from the approved bytes."
                  : "";
      verification = detail ? "mismatch" : "matched";
    } else if (field.kind === "file" && (!empty || field.required))
      verification = "unsupported";
    else if (plan.value !== undefined)
      verification =
        field.value.replace(/\r\n/g, "\n") === plan.value.replace(/\r\n/g, "\n")
          ? "matched"
          : "mismatch";
    else if (manualReviewed.includes(field.id) && (!empty || !field.required))
      verification = "manual-reviewed";
    else if (!empty || field.required) verification = "unresolved";
    if (
      [
        "mismatch",
        "invalid",
        "unresolved",
        "unsupported",
        "required-missing",
        "unaccepted",
      ].includes(verification)
    )
      blockers.push(
        `${field.label || field.id}: ${detail || (verification === "required-missing" ? "Required answer is empty or unchecked" : verification === "unaccepted" ? "No accepted option was read back; choose an actual option" : verification === "unsupported" ? "This control or document cannot be safely verified; complete it manually outside the companion" : verification === "invalid" && field.errors?.length ? field.errors.join("; ") : verification)}.`,
      );
    return {
      ...field,
      source: plan.source,
      expected: plan.file
        ? `${plan.file.name} · SHA256 ${plan.file.sha256}`
        : (plan.value ?? "Manual review"),
      verification,
    };
  });
  return { ...input, fields, blockers, ready: blockers.length === 0 };
}
