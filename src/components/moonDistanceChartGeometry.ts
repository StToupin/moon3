import type {
  MoonDistanceSample,
  MoonDistanceSeriesReply,
  MoonPhaseEvent,
} from "../api/ephemeris";

export const SVG_WIDTH = 840;
export const SVG_HEIGHT = 320;
export const PADDING_TOP = 28;
export const PADDING_RIGHT = 18;
export const PADDING_BOTTOM = 40;
export const PADDING_LEFT = 84;
export const PHASE_ICON_RADIUS = 5;
export const PHASE_HIT_RADIUS = 16;
export const SUPERMOON_HIT_RADIUS = 24;
export const TOOLTIP_MAX_WIDTH = 220;
export const TOOLTIP_EDGE_MARGIN = 12;

const Y_AXIS_TICK_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;
const X_AXIS_TICK_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;

export interface MoonDistanceChartPoint {
  index: number;
  sample: MoonDistanceSample;
  x: number;
  y: number;
}

export interface MoonDistanceChartPhaseMarker {
  index: number;
  phaseEvent: MoonPhaseEvent;
  x: number;
  y: number;
}

export interface MoonDistanceChartTick {
  distanceKm: number;
  y: number;
}

export interface MoonDistanceChartGeometry {
  plotWidth: number;
  plotHeight: number;
  minDistance: number;
  maxDistance: number;
  yRange: number;
  lastIndex: number;
  points: MoonDistanceChartPoint[];
  currentPoint: MoonDistanceChartPoint;
  phaseMarkers: MoonDistanceChartPhaseMarker[];
  xTickIndexes: number[];
  yTicks: MoonDistanceChartTick[];
  linePath: string;
  areaPath: string;
  rangeStartTimeMs: number;
  rangeEndTimeMs: number;
  rangeDurationMs: number;
}

export interface MoonDistanceChartHoverSampleState {
  kind: "sample";
  pointIndex: number;
  anchorX: number;
  anchorY: number;
  chartX: number;
  chartY: number;
  width: number;
  height: number;
}

export interface MoonDistanceChartHoverPhaseState {
  kind: "phase";
  phaseEventIndex: number;
  anchorX: number;
  anchorY: number;
  chartX: number;
  chartY: number;
  width: number;
  height: number;
}

export type MoonDistanceChartHoverState =
  | MoonDistanceChartHoverSampleState
  | MoonDistanceChartHoverPhaseState;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildXAxisTickIndexes(lastIndex: number): number[] {
  return Array.from(
    new Set(X_AXIS_TICK_RATIOS.map((ratio) => Math.round(lastIndex * ratio))),
  );
}

export function buildMoonDistanceChartGeometry(
  series: MoonDistanceSeriesReply,
): MoonDistanceChartGeometry | null {
  const { samples } = series;

  if (samples.length === 0) {
    return null;
  }

  const plotWidth = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const minimumSample = samples.reduce((lowest, sample) =>
    sample.distanceKm < lowest.distanceKm ? sample : lowest,
  );
  const maximumSample = samples.reduce((highest, sample) =>
    sample.distanceKm > highest.distanceKm ? sample : highest,
  );
  const distanceSpan = maximumSample.distanceKm - minimumSample.distanceKm;
  const yPadding =
    distanceSpan === 0
      ? Math.max(1, minimumSample.distanceKm * 0.02)
      : distanceSpan * 0.08;
  const minDistance = minimumSample.distanceKm - yPadding;
  const maxDistance = maximumSample.distanceKm + yPadding;
  const yRange = maxDistance - minDistance || 1;
  const lastIndex = Math.max(samples.length - 1, 1);

  const points = samples.map((sample, index) => {
    const x = PADDING_LEFT + (index / lastIndex) * plotWidth;
    const y =
      PADDING_TOP + ((maxDistance - sample.distanceKm) / yRange) * plotHeight;

    return {
      index,
      sample,
      x,
      y,
    };
  });

  const currentPoint =
    points.find((point) => point.sample.dayOffset === 0) ??
    points[Math.floor(points.length / 2)];
  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const rangeStartTimeMs = Date.parse(samples[0].timestamp);
  const rangeEndTimeMs = Date.parse(samples[samples.length - 1].timestamp);
  const rangeDurationMs = Math.max(rangeEndTimeMs - rangeStartTimeMs, 1);
  const phaseMarkers = series.phaseEvents.map((phaseEvent, index) => {
    const timeMs = Date.parse(phaseEvent.timestamp);
    const fraction = clamp(
      (timeMs - rangeStartTimeMs) / rangeDurationMs,
      0,
      1,
    );

    return {
      index,
      phaseEvent,
      x: PADDING_LEFT + fraction * plotWidth,
      y: PADDING_TOP + ((maxDistance - phaseEvent.distanceKm) / yRange) * plotHeight,
    };
  });
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(2)} ${(
    PADDING_TOP + plotHeight
  ).toFixed(2)} L ${firstPoint.x.toFixed(2)} ${(PADDING_TOP + plotHeight).toFixed(
    2,
  )} Z`;

  return {
    plotWidth,
    plotHeight,
    minDistance,
    maxDistance,
    yRange,
    lastIndex,
    points,
    currentPoint,
    phaseMarkers,
    xTickIndexes: buildXAxisTickIndexes(lastIndex),
    yTicks: Y_AXIS_TICK_RATIOS.map((ratio) => {
      const distance = minDistance + ratio * yRange;
      const y = PADDING_TOP + plotHeight - ratio * plotHeight;

      return {
        distanceKm: distance,
        y,
      };
    }),
    linePath,
    areaPath,
    rangeStartTimeMs,
    rangeEndTimeMs,
    rangeDurationMs,
  };
}

export function resolveMoonDistanceChartHoverState(
  geometry: MoonDistanceChartGeometry,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): MoonDistanceChartHoverState {
  const chartPointerX = (anchorX / width) * SVG_WIDTH;
  const chartPointerY = (anchorY / height) * SVG_HEIGHT;
  let nearestPhaseMarker: MoonDistanceChartPhaseMarker | null = null;
  let nearestPhaseDistanceSq = Number.POSITIVE_INFINITY;

  for (const marker of geometry.phaseMarkers) {
    const hitRadius = marker.phaseEvent.isSupermoon
      ? SUPERMOON_HIT_RADIUS
      : PHASE_HIT_RADIUS;
    const deltaX = chartPointerX - marker.x;
    const deltaY = chartPointerY - marker.y;
    const distanceSq = deltaX * deltaX + deltaY * deltaY;

    if (distanceSq <= hitRadius * hitRadius && distanceSq < nearestPhaseDistanceSq) {
      nearestPhaseMarker = marker;
      nearestPhaseDistanceSq = distanceSq;
    }
  }

  if (nearestPhaseMarker !== null) {
    return {
      kind: "phase",
      phaseEventIndex: nearestPhaseMarker.index,
      anchorX: clamp((nearestPhaseMarker.x / SVG_WIDTH) * width, 0, width),
      anchorY: clamp((nearestPhaseMarker.y / SVG_HEIGHT) * height, 0, height),
      chartX: nearestPhaseMarker.x,
      chartY: nearestPhaseMarker.y,
      width,
      height,
    };
  }

  const plotLeft = (PADDING_LEFT / SVG_WIDTH) * width;
  const plotRight = ((SVG_WIDTH - PADDING_RIGHT) / SVG_WIDTH) * width;
  const plotWidthPx = Math.max(plotRight - plotLeft, 1);
  const plotCursorX = clamp(anchorX, plotLeft, plotRight);
  const fraction = clamp((plotCursorX - plotLeft) / plotWidthPx, 0, 1);
  const exactIndex = fraction * geometry.lastIndex;
  const pointIndex = clamp(Math.round(exactIndex), 0, geometry.lastIndex);
  const lowerIndex = Math.floor(exactIndex);
  const upperIndex = Math.ceil(exactIndex);
  const interpolationProgress = exactIndex - lowerIndex;
  const lowerPoint = geometry.points[lowerIndex] ?? geometry.points[0];
  const upperPoint = geometry.points[upperIndex] ?? geometry.points[geometry.lastIndex];

  return {
    kind: "sample",
    pointIndex,
    anchorX,
    anchorY,
    chartX: PADDING_LEFT + fraction * geometry.plotWidth,
    chartY: interpolate(lowerPoint.y, upperPoint.y, interpolationProgress),
    width,
    height,
  };
}

export function createMoonDistancePhaseHoverState(
  geometry: MoonDistanceChartGeometry,
  phaseEventIndex: number,
  width: number,
  height: number,
): MoonDistanceChartHoverPhaseState {
  const marker = geometry.phaseMarkers[phaseEventIndex];

  return {
    kind: "phase",
    phaseEventIndex,
    anchorX: clamp((marker.x / SVG_WIDTH) * width, 0, width),
    anchorY: clamp((marker.y / SVG_HEIGHT) * height, 0, height),
    chartX: marker.x,
    chartY: marker.y,
    width,
    height,
  };
}

export function clampMoonDistanceTooltipX(anchorX: number, width: number): number {
  const halfTooltipWidth = TOOLTIP_MAX_WIDTH / 2;

  if (width <= TOOLTIP_MAX_WIDTH + TOOLTIP_EDGE_MARGIN * 2) {
    return width / 2;
  }

  return clamp(
    anchorX,
    halfTooltipWidth + TOOLTIP_EDGE_MARGIN,
    width - halfTooltipWidth - TOOLTIP_EDGE_MARGIN,
  );
}
