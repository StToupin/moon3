import { expect, test } from "@playwright/test";

const FIXED_DATE = "2026-04-15T18:54:41.304Z";

test("recreates the ephemeris app with kernel-backed CSPICE execution in the browser", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  await page.goto(`/?date=${encodeURIComponent(FIXED_DATE)}`);

  await expect(page).toHaveTitle("Moon");
  await expect(page.getByTestId("camera-state")).toHaveText("MOON (4/5)", {
    timeout: 120_000,
  });
  await expect(page).toHaveURL(/step=4\b/);
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await expect(page.locator('link[rel="icon"][type="image/x-icon"]')).toHaveAttribute(
    "href",
    "/favicon.ico?v=3",
  );

  const debugSnapshot = await page.waitForFunction(
    () => {
      const snapshot = window.__wasmSpiceDebug as
        | {
            status?: string;
          }
        | undefined;
      return snapshot?.status === "ready" ? snapshot : null;
    },
    undefined,
    { timeout: 120_000 },
  );

  const data = await debugSnapshot.jsonValue();
  const snapshot = data as {
    requestedIsoDate: string;
    diagnostics: { loadedKernels: string[]; toolkitVersion: string };
    ephemeris: {
      bodies: Array<{
        name: string;
        positionKm: number[];
        radiiKm: number[];
      }>;
      surfacePoint: number[];
      moonCamera: {
        position: number[];
        target: number[];
      };
    };
    orbits: {
      earthPoints: number;
      moonPoints: number;
      earthFirstPoint: number[];
      moonFirstPoint: number[];
    };
  };

  const earth = snapshot.ephemeris.bodies.find((body) => body.name === "EARTH");
  const moon = snapshot.ephemeris.bodies.find((body) => body.name === "MOON");

  expect(snapshot.requestedIsoDate).toBe(FIXED_DATE);
  expect(snapshot.diagnostics.loadedKernels).toEqual([
    "/kernels/naif0012.tls",
    "/kernels/de432s.bsp",
    "/kernels/pck00010.tpc",
  ]);
  expect(snapshot.orbits.earthPoints).toBe(360);
  expect(snapshot.orbits.moonPoints).toBe(360);
  expect(earth?.positionKm).toHaveLength(3);
  expect(moon?.positionKm).toHaveLength(3);
  expect(snapshot.ephemeris.surfacePoint).toHaveLength(3);
  expect(snapshot.ephemeris.moonCamera.position).toHaveLength(3);
  expect(snapshot.ephemeris.moonCamera.target).toHaveLength(3);

  expect(snapshot.orbits.earthFirstPoint[0]).toBeCloseTo(
    earth?.positionKm[0] ?? 0,
    3,
  );
  expect(snapshot.orbits.moonFirstPoint[0]).toBeCloseTo(
    moon?.positionKm[0] ?? 0,
    3,
  );
  expect(earth?.radiiKm[0]).toBeCloseTo(6378.1366, 3);
  expect(earth?.positionKm[0]).toBeCloseTo(-135883584.82967234, 3);
  expect(moon?.positionKm[0]).toBeCloseTo(-135513221.72906354, 3);

  const earthCenterDistance = Math.hypot(
    snapshot.ephemeris.surfacePoint[0] - (earth?.positionKm[0] ?? 0),
    snapshot.ephemeris.surfacePoint[1] - (earth?.positionKm[1] ?? 0),
    snapshot.ephemeris.surfacePoint[2] - (earth?.positionKm[2] ?? 0),
  );
  expect(earthCenterDistance).toBeGreaterThan(earth?.radiiKm[2] ?? 0);
  expect(earthCenterDistance).toBeLessThanOrEqual(earth?.radiiKm[0] ?? 0);

  const cameraAltitude = Math.hypot(
    snapshot.ephemeris.moonCamera.position[0] - (earth?.positionKm[0] ?? 0),
    snapshot.ephemeris.moonCamera.position[1] - (earth?.positionKm[1] ?? 0),
    snapshot.ephemeris.moonCamera.position[2] - (earth?.positionKm[2] ?? 0),
  );
  expect(cameraAltitude).toBeCloseTo((earth?.radiiKm[0] ?? 0) + 4000, 0);
});

test("persists the step query param and only requests textures for the matching steps", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  const requestedAssets = new Set<string>();
  page.on("request", (request) => {
    requestedAssets.add(new URL(request.url()).pathname);
  });

  await page.goto(`/?date=${encodeURIComponent(FIXED_DATE)}&step=2`);

  await expect(page.getByTestId("camera-state")).toHaveText("SOLAR SYSTEM (2/5)", {
    timeout: 120_000,
  });
  await expect(page).toHaveURL(/step=2\b/);
  await page.waitForTimeout(500);
  expect(requestedAssets.has("/earth-texture.jpg")).toBe(false);
  expect(requestedAssets.has("/sun-texture.jpg")).toBe(false);

  await page.getByRole("button", { name: "Previous", exact: true }).click();

  await expect(page.getByTestId("camera-state")).toHaveText(
    "SCHEMATIC (NOT TO SCALE) (1/5)",
  );
  await expect(page).toHaveURL(/step=1\b/);
  await expect.poll(() => requestedAssets.has("/earth-texture.jpg")).toBe(true);
  await expect.poll(() => requestedAssets.has("/sun-texture.jpg")).toBe(true);
});

test("switching views during playback lands on the newly selected camera", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  await page.goto(`/?date=${encodeURIComponent(FIXED_DATE)}`);

  await expect(page.getByTestId("camera-state")).toHaveText("MOON (4/5)", {
    timeout: 120_000,
  });

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByTestId("camera-state")).toHaveText("EARTH (5/5)");

  const alignedCamera = await page.waitForFunction(
    () => {
      const snapshot = window.__wasmSpiceDebug as
        | {
            ephemeris?: {
              moonCamera?: {
                position?: number[];
              };
              surfacePoint?: number[];
            };
            liveCamera?: {
              fov?: number;
              position?: number[];
              target?: number[];
              viewName?: string;
            } | null;
          }
        | undefined;
      const expectedPosition = snapshot?.ephemeris?.moonCamera?.position;
      const expectedTarget = snapshot?.ephemeris?.surfacePoint;
      const liveCamera = snapshot?.liveCamera;

      if (
        !expectedPosition ||
        !expectedTarget ||
        !liveCamera?.position ||
        !liveCamera.target ||
        liveCamera.viewName !== "earth"
      ) {
        return null;
      }

      const positionDelta = Math.hypot(
        liveCamera.position[0] - expectedPosition[0],
        liveCamera.position[1] - expectedPosition[1],
        liveCamera.position[2] - expectedPosition[2],
      );
      const targetDelta = Math.hypot(
        liveCamera.target[0] - expectedTarget[0],
        liveCamera.target[1] - expectedTarget[1],
        liveCamera.target[2] - expectedTarget[2],
      );
      const fovDelta = Math.abs((liveCamera.fov ?? 0) - 70);

      if (positionDelta > 5 || targetDelta > 5 || fovDelta > 0.5) {
        return null;
      }

      return {
        fovDelta,
        positionDelta,
        targetDelta,
      };
    },
    undefined,
    { timeout: 10_000 },
  );

  const alignment = (await alignedCamera.jsonValue()) as {
    fovDelta: number;
    positionDelta: number;
    targetDelta: number;
  };

  expect(alignment.positionDelta).toBeLessThan(5);
  expect(alignment.targetDelta).toBeLessThan(5);
  expect(alignment.fovDelta).toBeLessThan(0.5);
});

test("renders the moon distance card and SVG chart", async ({
  page,
  context,
}) => {
  await page.setViewportSize({
    width: 1280,
    height: 900,
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  await page.goto(`/?date=${encodeURIComponent(FIXED_DATE)}`);

  const moonDistancePanel = page.getByRole("region", { name: "Moon Distance" });
  const sidebar = page.locator("#app-sidebar");
  const resizeHandle = page.getByTestId("sidebar-resize-handle");

  await expect(moonDistancePanel).toBeVisible();
  await expect(resizeHandle).toBeVisible();
  await expect(moonDistancePanel.getByTestId("moon-distance-chart")).toBeVisible({
    timeout: 120_000,
  });
  await expect(moonDistancePanel.getByTestId("moon-distance-current-line")).toHaveCount(1);
  await expect(moonDistancePanel.getByTestId("moon-phase-event").first()).toBeVisible();
  expect(await moonDistancePanel.getByTestId("moon-phase-supermoon").count()).toBeGreaterThan(
    0,
  );

  const initialSidebarHeight = await sidebar.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await page.setViewportSize({
    width: 1280,
    height: 700,
  });
  await expect
    .poll(async () => {
      return sidebar.evaluate((element) => element.getBoundingClientRect().height);
    })
    .toBeLessThan(initialSidebarHeight - 100);

  const initialSidebarBox = await sidebar.boundingBox();
  if (!initialSidebarBox) {
    throw new Error("Unable to measure initial sidebar layout");
  }

  await page.setViewportSize({
    width: 760,
    height: 900,
  });

  await expect
    .poll(async () => {
      const box = await sidebar.boundingBox();
      return box?.width ?? 0;
    })
    .toBeLessThan(initialSidebarBox.width - 40);
  await expect
    .poll(async () => {
      const box = await sidebar.boundingBox();
      return box?.width ?? 0;
    })
    .toBeLessThanOrEqual(442);

  const sidebarBeforeResize = await sidebar.boundingBox();
  const resizeHandleBox = await resizeHandle.boundingBox();
  if (!sidebarBeforeResize || !resizeHandleBox) {
    throw new Error("Unable to measure sidebar resize handle layout");
  }
  await page.mouse.move(
    resizeHandleBox.x + resizeHandleBox.width / 2,
    resizeHandleBox.y + resizeHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resizeHandleBox.x + resizeHandleBox.width / 2 - 48,
    resizeHandleBox.y + resizeHandleBox.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();

  const sidebarAfterResize = await sidebar.boundingBox();
  if (!sidebarAfterResize) {
    throw new Error("Unable to measure resized sidebar layout");
  }
  expect(sidebarAfterResize.width).toBeLessThan(sidebarBeforeResize.width - 6);
  expect(sidebarAfterResize.width).toBeGreaterThanOrEqual(420);

  const chart = moonDistancePanel.getByTestId("moon-distance-chart");
  const chartBox = await chart.boundingBox();
  if (!chartBox) {
    throw new Error("Unable to measure chart layout");
  }
  const hoverPosition = {
    x: chartBox.width * 0.5,
    y: chartBox.height * 0.44,
  };

  await chart.hover({
    position: hoverPosition,
  });
  await expect(moonDistancePanel.getByTestId("moon-distance-tooltip")).toBeVisible();
  await expect(moonDistancePanel.getByTestId("moon-distance-tooltip")).toContainText(
    "km",
  );
  const hoverMarkerBox = await moonDistancePanel
    .getByTestId("moon-distance-hover-marker")
    .boundingBox();
  if (!hoverMarkerBox) {
    throw new Error("Unable to measure chart hover marker layout");
  }
  const hoveredCursorX = chartBox.x + hoverPosition.x;
  const hoverMarkerCenterX = hoverMarkerBox.x + hoverMarkerBox.width / 2;
  expect(Math.abs(hoverMarkerCenterX - hoveredCursorX)).toBeLessThan(16);

  const supermoonMarkerBox = await moonDistancePanel
    .getByTestId("moon-phase-supermoon")
    .first()
    .boundingBox();
  if (!supermoonMarkerBox) {
    throw new Error("Unable to measure supermoon marker layout");
  }
  await page.mouse.move(
    supermoonMarkerBox.x + supermoonMarkerBox.width / 2,
    supermoonMarkerBox.y + supermoonMarkerBox.height / 2,
  );
  await expect(moonDistancePanel.getByTestId("moon-distance-tooltip")).toContainText(
    "Full Moon",
  );
  await expect(moonDistancePanel.getByTestId("moon-distance-tooltip")).not.toContainText(
    "New Moon",
  );
});

test("shows top and bottom mobile bars with the moon distance panel collapsed by default", async ({
  page,
  context,
}) => {
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  await page.goto(`/?date=${encodeURIComponent(FIXED_DATE)}`);

  const moonDistancePanel = page.getByRole("region", { name: "Moon Distance" });
  const previousButton = page.getByRole("button", { name: "Previous", exact: true });
  const expandButton = page.getByRole("button", {
    name: "Expand moon distance card",
  });
  const collapseNavigationButton = page.getByRole("button", {
    name: "Collapse navigation card",
  });

  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  await expect(moonDistancePanel).toBeVisible();
  await expect(previousButton).toBeVisible();
  await expect(expandButton).toBeVisible();
  await expect(collapseNavigationButton).toBeVisible();
  await expect(moonDistancePanel.getByTestId("moon-distance-chart")).toHaveCount(0);

  await expandButton.click();
  await expect(
    page.getByRole("button", { name: "Collapse moon distance card" }),
  ).toBeVisible();
  await expect(moonDistancePanel.getByTestId("moon-distance-chart")).toBeVisible({
    timeout: 120_000,
  });

  await page.getByRole("button", { name: "Collapse moon distance card" }).click();
  await expect(page.getByRole("button", { name: "Expand moon distance card" })).toBeVisible();
  await expect(moonDistancePanel.getByTestId("moon-distance-chart")).toHaveCount(0);

  await collapseNavigationButton.click();
  await expect(page.getByRole("button", { name: "Expand navigation card" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next day" })).toBeVisible();
  await expect(
    page.locator(".mobile-bottom-bar").getByLabel("Ephemeris day offset"),
  ).toBeVisible();
});
