export type CustomField = {
  id: string;
  name: string;
  value: string;
  confirmed: boolean;
};
export function validateCustomFields(value: unknown): CustomField[] {
  if (!Array.isArray(value) || value.length > 25)
    throw new Error("Use at most 25 custom fields.");
  const ids = new Set<string>();
  return value.map((raw) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.id !== "string" ||
      !raw.id ||
      raw.id.length > 100 ||
      ids.has(raw.id) ||
      typeof raw.name !== "string" ||
      raw.name.length > 80 ||
      typeof raw.value !== "string" ||
      raw.value.length > 2000 ||
      typeof raw.confirmed !== "boolean"
    )
      throw new Error(
        "Each custom field needs a unique ID, a name under 80 characters and a value under 2,000 characters.",
      );
    ids.add(raw.id);
    return {
      id: raw.id,
      name: raw.name.trim(),
      value: raw.value.trim(),
      confirmed: raw.confirmed,
    };
  });
}
