export class ModuleError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAt?: string,
  ) {
    super(message);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ModuleError("Expected an object.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  label: string,
  max = 2000,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new ModuleError(`Invalid ${label}.`);
  return value.trim();
}
export function id(value: unknown): string {
  const result = text(value, "identifier", 200, true);
  if (!/^[a-zA-Z0-9_:.\/-]+$/.test(result) || result.includes(".."))
    throw new ModuleError("Invalid identifier.");
  return result;
}
export function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new ModuleError(`Invalid ${label}.`);
  return value as T;
}
export function httpsUrl(
  value: unknown,
  required = false,
  hosts?: string[],
): string {
  const input = text(value, "HTTPS URL", 1000, required);
  if (!input) return "";
  try {
    const u = new URL(input);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      (hosts && !hosts.includes(u.hostname))
    )
      throw new Error();
    return u.href;
  } catch {
    throw new ModuleError("Use a valid HTTPS URL on a supported source.");
  }
}
export function date(value: unknown, required = false): string {
  const result = text(value, "date", 40, required);
  if (
    result &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(result) ||
      !Number.isFinite(Date.parse(result)) ||
      new Date(result).toISOString().slice(0, 10) !== result)
  )
    throw new ModuleError("Invalid date.");
  return result;
}
export function stringList(value: unknown, max = 20): string[] {
  if (!Array.isArray(value) || value.length > max)
    throw new ModuleError("Invalid list.");
  return value.map((x) => text(x, "list item", 3000, true));
}
export function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ModuleError("Expected a boolean.");
  return value;
}
export function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new ModuleError(`Enter a number between ${min} and ${max}.`);
  return value;
}
export function money(amount: unknown, currency: unknown) {
  const a = text(amount, "amount", 24, true);
  const c = text(currency, "ISO currency", 3, true).toUpperCase();
  if (!/^\d+(\.\d{1,3})?$/.test(a) || !/^[A-Z]{3}$/.test(c))
    throw new ModuleError("Enter a positive decimal amount and ISO currency.");
  let digits: number;
  try {
    digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: c,
      }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new ModuleError("Invalid currency.");
  }
  if (
    !Intl.supportedValuesOf("currency").includes(c) ||
    (a.split(".")[1]?.length || 0) > digits ||
    Number(a) <= 0 ||
    Number(a) > 1e10
  )
    throw new ModuleError("Invalid amount or currency precision.");
  return { amount: a, currency: c };
}
export function githubIssue(value: unknown) {
  const url = new URL(httpsUrl(value, true, ["github.com"]));
  const match = url.pathname.match(
    /^\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\/?$/,
  );
  if (!match) throw new ModuleError("Use a GitHub issue URL.");
  return {
    repository: `${match[1]}/${match[2]}`,
    number: match[3],
    url: `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`,
  };
}
export function videoId(value: unknown) {
  const raw = text(value, "YouTube video", 1000, true);
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const u = new URL(
    httpsUrl(raw, true, ["www.youtube.com", "youtube.com", "youtu.be"]),
  );
  const v =
    u.hostname === "youtu.be"
      ? u.pathname.slice(1)
      : u.searchParams.get("v") ||
        u.pathname.match(/^\/(shorts|live)\/([\w-]+)/)?.[2];
  if (!v || !/^[\w-]{11}$/.test(v))
    throw new ModuleError("Use a valid YouTube video link.");
  return v;
}
