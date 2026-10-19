import { ModuleError } from "./validation";
export async function providerJson(
  url: string,
  init: RequestInit = {},
  label = "Provider",
  timeoutMs = 6000,
): Promise<unknown> {
  // Callers build URLs exclusively from fixed official hosts and encoded validated identifiers.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      if (!attempt) continue;
      throw new ModuleError(`${label} could not be reached. Retry later.`, 502);
    }
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new ModuleError(`${label} returned unreadable data.`, 502);
      }
    }
    if (
      response.status === 429 ||
      (response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0")
    ) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const retry = Number(response.headers.get("retry-after"));
      throw new ModuleError(
        `${label} rate limit reached. Retry after the provider reset.`,
        429,
        new Date(
          reset > 0
            ? reset * 1000
            : Date.now() + (retry > 0 && retry < 86400 ? retry : 3600) * 1000,
        ).toISOString(),
      );
    }
    if (response.status >= 500 && !attempt) continue;
    if (response.status === 404)
      throw new ModuleError(
        `${label} resource unavailable or not public.`,
        404,
      );
    throw new ModuleError(
      `${label} rejected the request. Check credentials, permissions or quota.`,
      response.status === 401 || response.status === 403 ? 403 : 502,
    );
  }
  throw new ModuleError(`${label} unavailable.`, 502);
}
