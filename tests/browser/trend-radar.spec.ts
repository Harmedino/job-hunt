import { test, expect } from "@playwright/test";
const date = new Date().toISOString();
const headline = {
  id: "feed:https://example.com/news",
  title: "Football manager reacts after a major defeat",
  summary: "Test-only source-backed headline",
  category: "Football",
  publishedAt: date,
  checkedAt: date,
  sources: [
    {
      publisher: "Test RSS",
      url: "https://example.com/news",
      publishedAt: date,
    },
  ],
  score: 78,
  why: "Fictional reaction scene",
  people: [],
};
test("Trend Radar displays provider evidence, honest video states, cast selection and image-provider setup", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: { database: true, ai: false, scheduler: false, protected: false },
    }),
  );
  await page.route("**/api/discover", (route) =>
    route.fulfill({
      json: { jobs: [], checkedAt: date, persisted: true, sources: [] },
    }),
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({ json: { name: "Personal workspace" } }),
  );
  await page.route("**/api/applications", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/notifications", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/trend-radar/image", (route) =>
    route.fulfill({
      json: {
        configured: false,
        provider: "none",
        model: "",
        message: "Image key not configured",
      },
    }),
  );
  await page.route("**/api/trend-radar?*", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("scope") === "football")
      return route.fulfill({
        json: {
          fixtures: [
            {
              id: 777,
              kickoff: date,
              league: "Test League",
              home: { id: 1, name: "Home FC" },
              away: { id: 2, name: "Away FC" },
              homeGoals: 0,
              awayGoals: 4,
              loser: { id: 1, name: "Home FC" },
              winner: { id: 2, name: "Away FC" },
              margin: 4,
              reason:
                "Home FC lost 0–4. Score alone does not establish individual blame.",
              level: "heavy defeat",
              source: "API-Football",
            },
          ],
          checkedAt: date,
          errors: [],
          connected: true,
          provider: "API-Football",
        },
      });
    if (url.searchParams.get("scope") === "templates")
      return route.fulfill({ json: { templates: [] } });
    if (url.searchParams.get("scope") === "connections")
      return route.fulfill({ json: { x: { configured: false } } });
    return route.fulfill({
      json: {
        stories: [headline],
        manualReferences: [],
        projects: [],
        notifications: [],
        checkedAt: date,
        attemptedAt: date,
        failures: [],
        connected: { rss: true, youtube: false, ai: false, x: false },
        ranking: "Editorial evidence only",
      },
    });
  });
  await page.route("**/api/trend-radar", (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "football-cast")
      return route.fulfill({
        json: {
          fixtureId: 777,
          checkedAt: date,
          managers: [{ team: "Home FC", id: 99, name: "Example Coach" }],
          startingXI: [
            {
              team: "Home FC",
              people: [{ id: 7, name: "Player Example", position: "M" }],
            },
          ],
          substitutions: [],
          played: [
            {
              id: 7,
              name: "Player Example",
              teamId: 1,
              teamName: "Home FC",
              position: "M",
              minutes: 90,
              started: true,
              rating: 5.4,
              findings: ["Provider match rating 5.4/10"],
              qualifies: true,
              source: "API-Football players statistics",
            },
          ],
          suggested: [
            {
              id: 7,
              name: "Player Example",
              teamId: 1,
              teamName: "Home FC",
              position: "M",
              minutes: 90,
              started: true,
              rating: 5.4,
              findings: ["Provider match rating 5.4/10"],
              qualifies: true,
              source: "API-Football players statistics",
            },
          ],
          unavailable: [],
          source: "API-Football mock fixture",
        },
      });
    if (body?.action === "story-clips")
      return route.fulfill({
        json: {
          clips: [],
          checked: 0,
          rejectedByDuration: 0,
          rejectedMissingMetadata: 0,
          note: "YouTube key unavailable",
          cached: true,
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: "Provider missing in browser fixture" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Trend Radar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Football Humiliation Radar/ }),
  ).toBeVisible();
  await expect(page.getByText("Home FC 0–4 Away FC")).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect players / Comedy Cast" })
    .click();
  await expect(page.getByText("Provider match rating 5.4/10")).toBeVisible();
  await page.getByRole("button", { name: /Create fictional comedy/ }).click();
  await expect(
    page.getByText("Production readiness:", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Image key not configured")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate Image" }).first(),
  ).toBeDisabled();
});

test("three character images, identity reference, local analysis and a complete verified Kling ZIP", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { default: JSZip } = await import("jszip");
  const png = await readFile("tests/fixtures/radar/character-fixture.png");
  const imageRequests: Record<string, unknown>[] = [];
  const projects: Record<string, unknown>[] = [];
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { database: true, ai: false, protected: false } }),
  );
  await page.route("**/api/discover", (r) =>
    r.fulfill({ json: { jobs: [], checkedAt: date, sources: [] } }),
  );
  await page.route("**/api/profile", (r) =>
    r.fulfill({ json: { name: "Test creator" } }),
  );
  await page.route("**/api/applications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/notifications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/trend-radar/image", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: {
          provider: "Fixture provider",
          model: "fixture-image-model",
          configured: true,
          message: "Browser fixture — no real image provider invoked",
        },
      });
    const body = r.request().postDataJSON();
    imageRequests.push(body);
    return r.fulfill({
      json: {
        base64: png.toString("base64"),
        mime: "image/png",
        sha256: createHash("sha256").update(png).digest("hex"),
        provider: "Fixture provider",
        model: "fixture-image-model",
        prompt: body.prompt,
        tag: body.imageTag,
      },
    });
  });
  await page.route("**/api/trend-radar?*", (r) => {
    const scope = new URL(r.request().url()).searchParams.get("scope");
    if (scope === "football")
      return r.fulfill({
        json: {
          fixtures: [],
          checkedAt: null,
          errors: ["No football provider in this fixture"],
          connected: false,
        },
      });
    if (scope === "templates") return r.fulfill({ json: { templates: [] } });
    if (scope === "connections")
      return r.fulfill({ json: { x: { configured: false } } });
    return r.fulfill({
      json: {
        stories: [headline],
        manualReferences: [],
        projects,
        notifications: [],
        checkedAt: date,
        failures: [],
        connected: { rss: true, youtube: false, ai: false, x: false },
        ranking: "Fixture only",
      },
    });
  });
  await page.route("**/api/trend-radar", (r) => {
    const body = r.request().postDataJSON();
    if (body.action === "save") {
      const project = {
        ...body,
        updatedAt: date,
        publishedUrls: body.publishedUrls || [],
        archived: false,
      };
      const i = projects.findIndex((p) => p.id === body.id);
      if (i < 0) projects.push(project);
      else projects[i] = project;
      return r.fulfill({ json: project });
    }
    return r.fulfill({
      status: 503,
      json: { error: "YouTube missing in browser fixture" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Trend Radar", exact: true }).click();
  await page
    .getByRole("button", { name: "Create parody", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add character or background dancer" })
    .click();
  await page
    .getByLabel("Original role 3", { exact: true })
    .fill("the third performer");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  const cards = page.locator(".radar-generated-card");
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++)
    await cards
      .nth(i)
      .getByLabel("Replacement identity", { exact: true })
      .fill("Original fictional character " + (i + 1));
  await cards
    .nth(0)
    .getByLabel("Authentic identity reference photo", { exact: false })
    .setInputFiles("tests/fixtures/radar/character-fixture.png");
  for (let i = 0; i < 3; i++) {
    await cards
      .nth(i)
      .getByRole("button", { name: "Generate Image", exact: true })
      .click();
    await cards
      .nth(i)
      .getByRole("button", { name: "Approve & Save", exact: true })
      .click();
    await expect(
      cards
        .nth(i)
        .getByText("Approved (browser local; metadata saved to project)", {
          exact: true,
        }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", {
      name: "Analyze authorized video locally",
      exact: true,
    }),
  ).toHaveCount(1);
  expect(imageRequests).toHaveLength(3);
  expect(imageRequests[0].reference).toBeTruthy();
  expect(String(imageRequests[0].prompt)).toContain("FULL-BODY");
  const approvedBefore = structuredClone(projects[0].approvedImages);
  await cards
    .nth(0)
    .getByRole("button", {
      name: "Regenerate (approval preserved)",
      exact: true,
    })
    .click();
  await expect(
    cards.nth(0).getByRole("button", { name: "Approve & Save", exact: true }),
  ).toBeVisible();
  expect(projects[0].approvedImages).toEqual(approvedBefore);
  const individual = page.waitForEvent("download");
  await cards
    .nth(2)
    .getByRole("button", { name: "Download approved", exact: true })
    .click();
  expect((await individual).suggestedFilename()).toContain("Image3");
  await page
    .getByLabel("Owned or licensed local video", { exact: true })
    .setInputFiles("tests/fixtures/radar/authorized-test-pattern.mp4");
  await expect(
    page.getByText(/1.50s verified from browser metadata/),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Analyze authorized video locally",
      exact: true,
    })
    .click();
  await expect(page.getByText(/sampled frames · possible cuts/)).toBeVisible();
  await expect(
    page.getByText(/People, speech and laughter: UNKNOWN/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add timestamped performer role" })
    .click();
  await page
    .getByLabel("Screen position", { exact: true })
    .fill("starts left, crosses right");
  await page
    .getByLabel("Action / crossing", { exact: true })
    .fill("same original dancer throughout");
  await page.getByPlaceholder("@Image3", { exact: true }).fill("@Image4");
  await page
    .getByLabel("Select optional environment image", { exact: true })
    .setInputFiles("tests/fixtures/radar/character-fixture.png");
  await page
    .getByRole("button", { name: "Save Trend Radar project", exact: true })
    .click();
  await expect(
    page.getByText(/Project and selected media saved/),
  ).toBeVisible();
  const zipped = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Prepare for Kling · Download ZIP",
      exact: true,
    })
    .click();
  const artifact = await zipped;
  const zip = await JSZip.loadAsync(await readFile((await artifact.path())!));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  expect(manifest.characterMapping).toHaveLength(3);
  expect(manifest.roleTimeline).toHaveLength(1);
  expect(manifest.roleTimeline[0].characterId).toEqual(
    manifest.characterMapping[0].characterId,
  );
  expect(
    Object.keys(zip.files).filter((name) =>
      /^images\/Image[123]\.png$/.test(name),
    ),
  ).toHaveLength(3);
  expect(zip.file("video/authorized-test-pattern.mp4")).toBeTruthy();
  expect(await zip.file("Kling Prompt.txt")!.async("string")).toContain(
    "dialogue, sound, rhythm and timing completely unchanged",
  );
  await cards
    .nth(0)
    .getByLabel("Replacement identity", { exact: true })
    .fill("Changed identity");
  await expect(
    cards.nth(0).getByRole("button", { name: "Approve & Save", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Prepare for Kling · Download ZIP",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Review and reapprove the image for changed character/),
  ).toBeVisible();
});
