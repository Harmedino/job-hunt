import { createHash } from "node:crypto";
export function canonicalJobUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (
      /^utm_|^(ref|source|gh_src|lever-source|lever-origin|trackingId)$/i.test(
        key,
      )
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href.replace(/\/$/, "");
}
export function jobIdentity(job: {
  url: string;
  company: string;
  title: string;
  location: string;
  requisitionId?: string;
}) {
  // A title is not a vacancy identifier. Different requisitions/locations must survive.
  const canonical = canonicalJobUrl(job.url);
  return createHash("sha256")
    .update(
      job.company.trim().toLowerCase() +
        "|" +
        canonical +
        "|" +
        job.location.trim().toLowerCase() +
        (job.requisitionId ? "|" + job.requisitionId : ""),
    )
    .digest("hex")
    .slice(0, 24);
}
