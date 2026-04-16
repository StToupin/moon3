import { useId, useState } from "react";
import type { MoonDistanceSeriesReply } from "../api/ephemeris";

const SVG_WIDTH = 840;
const SVG_HEIGHT = 320;
const PADDING_TOP = 20;
const PADDING_RIGHT = 18;
const PADDING_BOTTOM = 40;
const PADDING_LEFT = 64;
const TOOLTIP_MAX_WIDTH = 220;
const TOOLTIP_EDGE_MARGIN = 12;
const axisDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
});
const detailDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const wholeNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

interface MoonDistanceChartProps {
  series: MoonDistanceSeriesReply;
}

type SpecialPointRole = "current" | "minimum" | "maximum";

interface HoverState {
  pointIndex: number;
  roles: SpecialPointRole[];
  anchorX: number;
  anchorY: number;
  chartX: number;
  chartY: number;
  width: number;
  height: number;
}

function formatDistance(distanceKm: number): string {
  return `${wholeNumberFormatter.format(distanceKm)} km`;
}

function formatCompactDistance(distanceKm: number): string {
  return `${wholeNumberFormatter.format(distanceKm / 1000)}k km`;
}

function formatDayOffset(dayOffset: number): string {
  if (dayOffset === 0) {
    return "Selected date";
  }

  const absoluteDayOffset = Math.abs(dayOffset);
  const dayLabel = absoluteDayOffset === 1 ? "day" : "days";

  return dayOffset > 0
    ? `${absoluteDayOffset} ${dayLabel} after`
    : `${absoluteDayOffset} ${dayLabel} before`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatSpecialPointRole(role: SpecialPointRole): string {
  switch (role) {
    case "current":
      return "Current";
    case "minimum":
      return "Minimum";
    case "maximum":
      return "Maximum";
  }
}

function clampTooltipX(anchorX: number, width: number): number {
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

function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function MoonDistanceChart({ series }: MoonDistanceChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const gradientId = `${titleId.replace(/:/g, "")}-fill`;
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
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
  const currentSample =
    samples.find((sample) => sample.dayOffset === 0) ??
    samples[Math.floor(samples.length / 2)];
  const distanceSpan = maximumSample.distanceKm - minimumSample.distanceKm;
  const yPadding =
    distanceSpan === 0
      ? Math.max(1, minimumSample.distanceKm * 0.02)
      : distanceSpan * 0.08;
  const minDistance = minimumSample.distanceKm - yPadding;
  const maxDistance = maximumSample.distanceKm + yPadding;
  const yRange = maxDistance - minDistance || 1;
  const lastIndex = Math.max(samples.length - 1, 1);
  const xTickIndexes = Array.from(
    new Set(
      [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(lastIndex * ratio)),
    ),
  );

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

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const currentPoint =
    points.find((point) => point.sample.dayOffset === 0) ??
    points[Math.floor(points.length / 2)];
  const minimumPoint =
    points.find((point) => point.sample === minimumSample) ?? currentPoint;
  const maximumPoint =
    points.find((point) => point.sample === maximumSample) ?? currentPoint;
  const hoveredPoint =
    hoverState === null ? null : points[hoverState.pointIndex] ?? null;
  const specialRolesByPointIndex = new Map<number, SpecialPointRole[]>();
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(2)} ${(
    PADDING_TOP + plotHeight
  ).toFixed(2)} L ${firstPoint.x.toFixed(2)} ${(PADDING_TOP + plotHeight).toFixed(
    2,
  )} Z`;

  function registerSpecialRole(pointIndex: number, role: SpecialPointRole) {
    const existingRoles = specialRolesByPointIndex.get(pointIndex);

    if (existingRoles) {
      if (!existingRoles.includes(role)) {
        existingRoles.push(role);
      }
      return;
    }

    specialRolesByPointIndex.set(pointIndex, [role]);
  }

  registerSpecialRole(currentPoint.index, "current");
  registerSpecialRole(minimumPoint.index, "minimum");
  registerSpecialRole(maximumPoint.index, "maximum");

  const isSpecialHover = (hoverState?.roles.length ?? 0) > 0;
  const tooltipVerticalClass =
    hoverState !== null && !isSpecialHover && hoverState.anchorY < 110
      ? "moon-distance-tooltip--below"
      : "moon-distance-tooltip--above";
  const tooltipLeft =
    hoverState === null ? 0 : clampTooltipX(hoverState.anchorX, hoverState.width);
  const tooltipTitle = hoveredPoint
    ? detailDateFormatter.format(new Date(hoveredPoint.sample.timestamp))
    : "";
  const tooltipContext = hoveredPoint
    ? formatDayOffset(hoveredPoint.sample.dayOffset)
    : "";
  const tooltipSpecialLabel =
    hoverState === null || hoverState.roles.length === 0
      ? null
      : hoverState.roles.map(formatSpecialPointRole).join(" • ");

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = clamp(event.clientX - rect.left, 0, rect.width);
    const anchorY = clamp(event.clientY - rect.top, 0, rect.height);
    const plotLeft = (PADDING_LEFT / SVG_WIDTH) * rect.width;
    const plotRight = ((SVG_WIDTH - PADDING_RIGHT) / SVG_WIDTH) * rect.width;
    const plotWidthPx = Math.max(plotRight - plotLeft, 1);
    const plotCursorX = clamp(anchorX, plotLeft, plotRight);
    const fraction = clamp((plotCursorX - plotLeft) / plotWidthPx, 0, 1);
    const exactIndex = fraction * lastIndex;
    const pointIndex = clamp(Math.round(exactIndex), 0, lastIndex);
    const lowerIndex = Math.floor(exactIndex);
    const upperIndex = Math.ceil(exactIndex);
    const interpolationProgress = exactIndex - lowerIndex;
    const lowerPoint = points[lowerIndex] ?? points[0];
    const upperPoint = points[upperIndex] ?? points[lastIndex];
    const chartX = PADDING_LEFT + fraction * plotWidth;
    const chartY = interpolate(
      lowerPoint.y,
      upperPoint.y,
      interpolationProgress,
    );

    setHoverState({
      pointIndex,
      roles: [],
      anchorX,
      anchorY,
      chartX,
      chartY,
      width: rect.width,
      height: rect.height,
    });
  }

  function createSpecialPointHoverHandler(pointIndex: number) {
    return (event: React.PointerEvent<SVGCircleElement>) => {
      event.stopPropagation();

      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) {
        return;
      }

      const rect = svg.getBoundingClientRect();
      const point = points[pointIndex];
      const roles = specialRolesByPointIndex.get(pointIndex) ?? [];

      setHoverState({
        pointIndex,
        roles,
        anchorX: clamp((point.x / SVG_WIDTH) * rect.width, 0, rect.width),
        anchorY: clamp((point.y / SVG_HEIGHT) * rect.height, 0, rect.height),
        chartX: point.x,
        chartY: point.y,
        width: rect.width,
        height: rect.height,
      });
    };
  }

  return (
    <div className="moon-distance-chart-shell">
      <div className="moon-distance-stats">
        <div className="moon-distance-stat" data-testid="moon-distance-current">
          <span className="hud-label">Current</span>
          <strong>{formatDistance(currentSample.distanceKm)}</strong>
          <small>{detailDateFormatter.format(new Date(currentSample.timestamp))}</small>
        </div>
        <div className="moon-distance-stat">
          <span className="hud-label">Minimum</span>
          <strong>{formatDistance(minimumSample.distanceKm)}</strong>
          <small>{detailDateFormatter.format(new Date(minimumSample.timestamp))}</small>
        </div>
        <div className="moon-distance-stat">
          <span className="hud-label">Maximum</span>
          <strong>{formatDistance(maximumSample.distanceKm)}</strong>
          <small>{detailDateFormatter.format(new Date(maximumSample.timestamp))}</small>
        </div>
      </div>

      <p className="moon-distance-range" data-testid="moon-distance-range">
        {wholeNumberFormatter.format(samples.length)} daily samples from{" "}
        {detailDateFormatter.format(new Date(samples[0].timestamp))} to{" "}
        {detailDateFormatter.format(new Date(samples[samples.length - 1].timestamp))}
      </p>

      <div className="moon-distance-chart-frame">
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className="moon-distance-chart"
          data-testid="moon-distance-chart"
          onPointerLeave={() => setHoverState(null)}
          onPointerMove={handlePointerMove}
          role="img"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        >
          <title id={titleId}>Earth-Moon distance chart</title>
          <desc id={descriptionId}>
            Earth-Moon center distance sampled daily from one year before to one
            year after the selected date.
          </desc>

          <defs>
            <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#78d7ff" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#78d7ff" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <rect
            className="moon-distance-chart__backdrop"
            height={plotHeight}
            rx="18"
            width={plotWidth}
            x={PADDING_LEFT}
            y={PADDING_TOP}
          />

          {Array.from({ length: 5 }, (_, index) => {
            const distance = minDistance + (index / 4) * yRange;
            const y = PADDING_TOP + plotHeight - (index / 4) * plotHeight;

            return (
              <g key={`y-${distance}`}>
                <line
                  className="moon-distance-chart__grid"
                  x1={PADDING_LEFT}
                  x2={PADDING_LEFT + plotWidth}
                  y1={y}
                  y2={y}
                />
                <text
                  className="moon-distance-chart__axis-label"
                  textAnchor="end"
                  x={PADDING_LEFT - 10}
                  y={y + 4}
                >
                  {formatCompactDistance(distance)}
                </text>
              </g>
            );
          })}

          {xTickIndexes.map((tickIndex) => {
            const point = points[tickIndex];

            return (
              <g key={`x-${tickIndex}`}>
                <line
                  className="moon-distance-chart__grid moon-distance-chart__grid--vertical"
                  x1={point.x}
                  x2={point.x}
                  y1={PADDING_TOP}
                  y2={PADDING_TOP + plotHeight}
                />
                <text
                  className="moon-distance-chart__axis-label"
                  textAnchor={
                    tickIndex === 0
                      ? "start"
                      : tickIndex === lastIndex
                        ? "end"
                        : "middle"
                  }
                  x={point.x}
                  y={SVG_HEIGHT - 12}
                >
                  {axisDateFormatter.format(new Date(point.sample.timestamp))}
                </text>
              </g>
            );
          })}

          <line
            className="moon-distance-chart__current-line"
            x1={currentPoint.x}
            x2={currentPoint.x}
            y1={PADDING_TOP}
            y2={PADDING_TOP + plotHeight}
          />

          <path
            className="moon-distance-chart__area"
            d={areaPath}
            fill={`url(#${gradientId})`}
          />
          <path className="moon-distance-chart__line" d={linePath} />

          {hoveredPoint && (
            <>
              <line
                className="moon-distance-chart__hover-line"
                x1={hoverState?.chartX ?? hoveredPoint.x}
                x2={hoverState?.chartX ?? hoveredPoint.x}
                y1={PADDING_TOP}
                y2={PADDING_TOP + plotHeight}
              />
              <circle
                className="moon-distance-chart__hover-marker"
                cx={hoverState?.chartX ?? hoveredPoint.x}
                cy={hoverState?.chartY ?? hoveredPoint.y}
                data-testid="moon-distance-hover-marker"
                r="6"
              />
            </>
          )}

          <circle
            className="moon-distance-chart__marker moon-distance-chart__marker--current"
            cx={currentPoint.x}
            cy={currentPoint.y}
            r="5"
          />
          <circle
            className="moon-distance-chart__marker"
            cx={minimumPoint.x}
            cy={minimumPoint.y}
            r="4"
          />
          <circle
            className="moon-distance-chart__marker"
            cx={maximumPoint.x}
            cy={maximumPoint.y}
            r="4"
          />

          <circle
            className="moon-distance-chart__special-hit-area"
            cx={currentPoint.x}
            cy={currentPoint.y}
            data-testid="moon-distance-current-hit-area"
            onPointerEnter={createSpecialPointHoverHandler(currentPoint.index)}
            onPointerMove={createSpecialPointHoverHandler(currentPoint.index)}
            r="13"
          />
          <circle
            className="moon-distance-chart__special-hit-area"
            cx={minimumPoint.x}
            cy={minimumPoint.y}
            data-testid="moon-distance-minimum-hit-area"
            onPointerEnter={createSpecialPointHoverHandler(minimumPoint.index)}
            onPointerMove={createSpecialPointHoverHandler(minimumPoint.index)}
            r="13"
          />
          <circle
            className="moon-distance-chart__special-hit-area"
            cx={maximumPoint.x}
            cy={maximumPoint.y}
            data-testid="moon-distance-maximum-hit-area"
            onPointerEnter={createSpecialPointHoverHandler(maximumPoint.index)}
            onPointerMove={createSpecialPointHoverHandler(maximumPoint.index)}
            r="13"
          />
        </svg>

        {hoverState !== null && hoveredPoint && (
          <div
            className={`moon-distance-tooltip ${tooltipVerticalClass}`}
            data-testid="moon-distance-tooltip"
            style={{
              left: `${tooltipLeft}px`,
              top: `${clamp(hoverState.anchorY, 12, hoverState.height - 12)}px`,
            }}
          >
            {tooltipSpecialLabel && (
              <span className="moon-distance-tooltip__eyebrow">
                {tooltipSpecialLabel}
              </span>
            )}
            <strong>{tooltipTitle}</strong>
            <span>{formatDistance(hoveredPoint.sample.distanceKm)}</span>
            <small>{tooltipContext}</small>
          </div>
        )}
      </div>
    </div>
  );
}
