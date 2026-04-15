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
  await expect(page.getByTestId("camera-state")).toHaveText("MOON (5/5)", {
    timeout: 120_000,
  });
  await expect(page.getByRole("button", { name: "← Back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
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
    "/kernels/earth_200101_990825_predict.bpc",
    "/kernels/earth_assoc_itrf93.tf",
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
  expect(snapshot.ephemeris.surfacePoint[0]).toBeCloseTo(
    -135886244.10997662,
    3,
  );
  expect(snapshot.ephemeris.moonCamera.position[0]).toBeCloseTo(
    -135887920.1185606,
    3,
  );
});
