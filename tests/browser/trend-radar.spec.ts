import { test, expect } from "@playwright/test";
const date = new Date().toISOString();
const headline = {
  id: "feed:https://example.com/news", title: "Football manager reacts after a major defeat",
  summary: "Test-only source-backed headline", category: "Football",
  publishedAt: date, checkedAt: date, sources: [
    { publisher: "Test RSS", url: "https://example.com/news", publishedAt: date },
  ], score: 78, why: "Fictional reaction scene", people: [],
};
test("Trend Radar displays provider evidence, honest video states, cast selection and image-provider setup", async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({
    json: { database: true, ai: false, scheduler: false, protected: false },
  }));
  await page.route("**/api/discover", (route) => route.fulfill({
    json: { jobs: [], checkedAt: date, persisted: true, sources: [] },
  }));
  await page.route("**/api/profile", (route) => route.fulfill({ json: { name: "Personal workspace" } }));
  await page.route("**/api/applications", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/trend-radar/image", (route) => route.fulfill({
    json: { configured: false, provider: "none", model: "", message: "Image key not configured" },
  }));
  await page.route("**/api/trend-radar?*", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("scope") === "football") return route.fulfill({ json: {
      fixtures: [{
        id: 777, kickoff: date, league: "Test League",
        home: { id: 1, name: "Home FC" }, away: { id: 2, name: "Away FC" },
        homeGoals: 0, awayGoals: 4, loser: { id: 1, name: "Home FC" },
        winner: { id: 2, name: "Away FC" }, margin: 4,
        reason: "Home FC lost 0–4. Score alone does not establish individual blame.",
        level: "heavy defeat", source: "API-Football",
      }], checkedAt: date, errors: [], connected: true, provider: "API-Football",
    } });
    if (url.searchParams.get("scope") === "templates") return route.fulfill({ json: { templates: [] } });
    if (url.searchParams.get("scope") === "connections") return route.fulfill({ json: { x: { configured: false } } });
    return route.fulfill({ json: {
      stories: [headline], manualReferences: [], projects: [], notifications: [],
      checkedAt: date, attemptedAt: date, failures: [],
      connected: { rss: true, youtube: false, ai: false, x: false }, ranking: "Editorial evidence only",
    } });
  });
  await page.route("**/api/trend-radar", (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "football-cast") return route.fulfill({ json: {
      fixtureId: 777, checkedAt: date,
      managers: [{ team: "Home FC", id: 99, name: "Example Coach" }],
      startingXI: [{ team: "Home FC", people: [{ id: 7, name: "Player Example", position: "M" }] }],
      substitutions: [], played: [
        { id: 7, name: "Player Example", teamId: 1, teamName: "Home FC", position: "M",
          minutes: 90, started: true, rating: 5.4, findings: ["Provider match rating 5.4/10"],
          qualifies: true, source: "API-Football players statistics" },
      ], suggested: [
        { id: 7, name: "Player Example", teamId: 1, teamName: "Home FC", position: "M",
          minutes: 90, started: true, rating: 5.4, findings: ["Provider match rating 5.4/10"],
          qualifies: true, source: "API-Football players statistics" },
      ], unavailable: [], source: "API-Football mock fixture",
    } });
    if (body?.action === "story-clips") return route.fulfill({
      json: { clips: [], checked: 0, rejectedByDuration: 0, rejectedMissingMetadata: 0,
        note: "YouTube key unavailable", cached: true },
    });
    return route.fulfill({ status: 503, json: { error: "Provider missing in browser fixture" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Trend Radar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Football Humiliation Radar/ })).toBeVisible();
  await expect(page.getByText("Home FC 0–4 Away FC")).toBeVisible();
  await page.getByRole("button", { name: "Inspect players / Comedy Cast" }).click();
  await expect(page.getByText("Provider match rating 5.4/10")).toBeVisible();
  await page.getByRole("button", { name: /Create fictional comedy/ }).click();
  await expect(page.getByText("Production readiness:", { exact: false })).toBeVisible();
  await expect(page.getByText("Image key not configured")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Image" }).first()).toBeDisabled();
});
