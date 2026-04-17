import { expect, test } from "@playwright/test";
import {
  buildMoonDistanceChartGeometry,
  createMoonDistancePhaseHoverState,
  resolveMoonDistanceChartHoverState,
  SVG_HEIGHT,
  SVG_WIDTH,
} from "../src/components/moonDistanceChartGeometry";

const series = {
  referenceTimestamp: "2026-04-15T00:00:00.000Z",
  samples: [
    {
      dayOffset: -1,
      timestamp: "2026-04-14T00:00:00.000Z",
      distanceKm: 360_000,
    },
    {
      dayOffset: 0,
      timestamp: "2026-04-15T00:00:00.000Z",
      distanceKm: 370_000,
    },
    {
      dayOffset: 1,
      timestamp: "2026-04-16T00:00:00.000Z",
      distanceKm: 365_000,
    },
  ],
  phaseEvents: [
    {
      phase: "full",
      timestamp: "2026-04-15T00:00:00.000Z",
      distanceKm: 370_000,
      isSupermoon: true,
    },
  ],
} as const;

test("builds stable chart geometry from the series", () => {
  const geometry = buildMoonDistanceChartGeometry(series);

  expect(geometry).not.toBeNull();
  expect(geometry?.points).toHaveLength(3);
  expect(geometry?.phaseMarkers).toHaveLength(1);
  expect(geometry?.xTickIndexes).toEqual([0, 1, 2]);
  expect(geometry?.yTicks).toHaveLength(5);
  expect(geometry?.currentPoint.sample.dayOffset).toBe(0);
  expect(geometry?.linePath).toContain("M");
  expect(geometry?.areaPath).toContain("Z");
});

test("resolves hover states against the memoized geometry", () => {
  const geometry = buildMoonDistanceChartGeometry(series);

  expect(geometry).not.toBeNull();
  if (!geometry) {
    throw new Error("Expected geometry");
  }

  const samplePoint = geometry.points[0];
  const hoveredSample = resolveMoonDistanceChartHoverState(
    geometry,
    (samplePoint.x / SVG_WIDTH) * 1000,
    (samplePoint.y / SVG_HEIGHT) * 500,
    1000,
    500,
  );

  expect(hoveredSample.kind).toBe("sample");
  if (hoveredSample.kind !== "sample") {
    throw new Error("Expected sample hover state");
  }
  expect(hoveredSample.pointIndex).toBe(0);

  const phaseHover = createMoonDistancePhaseHoverState(geometry, 0, 1000, 500);
  const hoveredPhase = resolveMoonDistanceChartHoverState(
    geometry,
    phaseHover.anchorX,
    phaseHover.anchorY,
    1000,
    500,
  );

  expect(hoveredPhase.kind).toBe("phase");
  if (hoveredPhase.kind !== "phase") {
    throw new Error("Expected phase hover state");
  }
  expect(hoveredPhase.phaseEventIndex).toBe(0);
  expect(phaseHover.chartX).toBeGreaterThan(0);
});
