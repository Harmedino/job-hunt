import { publicHttps } from "./lead-extraction";
export function searchLink(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("Provide a search name and Indeed URL.");
  const { name, url } = value as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 120 ||
    typeof url !== "string" ||
    url.length > 2000
  )
    throw new Error("Provide a search name and Indeed URL.");
  const safe = publicHttps(url);
  const parsed = new URL(safe);
  if (
    ![
      "indeed.com",
      "www.indeed.com",
      "ng.indeed.com",
      "uk.indeed.com",
      "ca.indeed.com",
    ].includes(parsed.hostname) ||
    !["/jobs", "/jobs/"].includes(parsed.pathname)
  )
    throw new Error("Use an Indeed /jobs search link.");
  return { name: name.trim(), url: safe };
}
