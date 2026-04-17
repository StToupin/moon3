import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMoonDistanceChartGeometry,
  createMoonDistancePhaseHoverState,
  resolveMoonDistanceChartHoverState,
  SVG_HEIGHT,
  SVG_WIDTH,
} from "../src/components/moonDistanceChartGeometry.ts";

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

  assert.notEqual(geometry, null);
  assert.equal(geometry?.points.length, 3);
  assert.equal(geometry?.phaseMarkers.length, 1);
  assert.deepEqual(geometry?.xTickIndexes, [0, 1, 2]);
  assert.equal(geometry?.yTicks.length, 5);
  assert.equal(geometry?.currentPoint.sample.dayOffset, 0);
  assert.ok(geometry?.linePath.includes("M"));
  assert.ok(geometry?.areaPath.includes("Z"));
});

test("resolves hover states against the memoized geometry", () => {
  const geometry = buildMoonDistanceChartGeometry(series);

  assert.notEqual(geometry, null);
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

  assert.equal(hoveredSample.kind, "sample");
  if (hoveredSample.kind !== "sample") {
    throw new Error("Expected sample hover state");
  }
  assert.equal(hoveredSample.pointIndex, 0);

  const phaseHover = createMoonDistancePhaseHoverState(geometry, 0, 1000, 500);
  const hoveredPhase = resolveMoonDistanceChartHoverState(
    geometry,
    phaseHover.anchorX,
    phaseHover.anchorY,
    1000,
    500,
  );

  assert.equal(hoveredPhase.kind, "phase");
  if (hoveredPhase.kind !== "phase") {
    throw new Error("Expected phase hover state");
  }
  assert.equal(hoveredPhase.phaseEventIndex, 0);
  assert.ok(phaseHover.chartX > 0);
});
