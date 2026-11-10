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
    board: parts[1],
    jobId: parts[2],
    url: `https://job-boards.greenhouse.io/${parts[1]}/jobs/${parts[2]}`,
    key: `greenhouse:${parts[1].toLowerCase()}:${parts[2]}`,
  };
}
export function sameGreenhousePage(value: string, target: GreenhouseTarget) {
  try {
    return greenhouseTarget(value).key === target.key;
  } catch {
    return false;
  }
}
export const questionKey = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/\s*\*\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
export type BankAnswer = {
  id: string;
  question: string;
  answer: string;
  vacancyKey: string;
  confirmedAt: string;
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
};
export type FormField = {
  id: string;
  label: string;
  kind: "text" | "textarea" | "select" | "checkbox" | "file" | "unsupported";
  required: boolean;
  value: string;
  valid: boolean;
  disabled: boolean;
  options?: string[];
  files?: { name: string; size: number; sha256: string }[];
};
export type FieldPlan = { value?: string; file?: PackageFile; source: string };
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
};
export function mapField(field: FormField, pack: AssistedPackage): FieldPlan {
  if (field.kind === "file") {
    const kind =
      field.id === "resume"
        ? "cv"
        : field.id === "cover_letter"
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
  const contact = contacts[field.id];
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
      a.vacancyKey === pack.target.key &&
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
  fields: (FormField & { source: string; verification: string })[];
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
  for (const id of ["first_name", "last_name", "email", "resume"])
    if (!ids.includes(id))
      blockers.push(`Expected Greenhouse field missing: ${id}.`);
  const fields = input.fields.map((field) => {
    const plan = mapField(field, pack);
    const empty =
      field.kind === "file"
        ? !field.files?.length
        : field.kind === "checkbox"
          ? field.value !== "Yes"
          : !field.value.trim();
    let verification = "empty";
    if (field.disabled) verification = "unsupported";
    else if (!field.valid) verification = "invalid";
    else if (field.kind === "file" && plan.file) {
      const actual = field.files || [];
      verification =
        actual.length === 1 &&
        actual[0].name === plan.file.name &&
        actual[0].size === plan.file.size &&
        actual[0].sha256 === plan.file.sha256
          ? "matched"
          : "mismatch";
    } else if (plan.value !== undefined)
      verification =
        field.value.replace(/\r\n/g, "\n") === plan.value.replace(/\r\n/g, "\n")
          ? "matched"
          : "mismatch";
    else if (manualReviewed.includes(field.id) && (!empty || !field.required))
      verification = "manual-reviewed";
    else if (!empty || field.required) verification = "unresolved";
    if (
      ["mismatch", "invalid", "unresolved", "unsupported"].includes(
        verification,
      )
    )
      blockers.push(`${field.label || field.id}: ${verification}.`);
    return { ...field, source: plan.source, verification };
  });
  return { ...input, fields, blockers, ready: blockers.length === 0 };
}
