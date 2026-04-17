import { useId, useMemo, useRef, useState } from "react";
import type {
  MoonDistanceSeriesReply,
  MoonPhaseName,
} from "../api/ephemeris";
import {
  buildMoonDistanceChartGeometry,
  clampMoonDistanceTooltipX,
  createMoonDistancePhaseHoverState,
  type MoonDistanceChartHoverState,
  PHASE_ICON_RADIUS,
  PHASE_HIT_RADIUS,
  SVG_HEIGHT,
  SVG_WIDTH,
  PADDING_LEFT,
  PADDING_TOP,
  SUPERMOON_HIT_RADIUS,
  resolveMoonDistanceChartHoverState,
} from "./moonDistanceChartGeometry";
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

function formatPhaseLabel(phase: MoonPhaseName): string {
  switch (phase) {
    case "new":
      return "New Moon";
    case "first_quarter":
      return "First Quarter";
    case "full":
      return "Full Moon";
    case "last_quarter":
      return "Last Quarter";
  }
}

function renderPhaseIcon(phase: MoonPhaseName) {
  return (
    <>
      <circle
        className={`moon-distance-chart__phase-disc ${
          phase === "full"
            ? "moon-distance-chart__phase-disc--light"
            : "moon-distance-chart__phase-disc--dark"
        }`}
        cx="0"
        cy="0"
        r={PHASE_ICON_RADIUS}
      />
      {phase === "first_quarter" && (
        <path
          className="moon-distance-chart__phase-disc moon-distance-chart__phase-disc--light"
          d={HALF_DISK_PATH_RIGHT}
        />
      )}
      {phase === "last_quarter" && (
        <path
          className="moon-distance-chart__phase-disc moon-distance-chart__phase-disc--light"
          d={HALF_DISK_PATH_LEFT}
        />
      )}
      <circle
        className="moon-distance-chart__phase-outline"
        cx="0"
        cy="0"
        r={PHASE_ICON_RADIUS}
      />
    </>
  );
}

const HALF_DISK_PATH_RIGHT = [
  `M 0 ${-PHASE_ICON_RADIUS}`,
  `A ${PHASE_ICON_RADIUS} ${PHASE_ICON_RADIUS} 0 0 1 0 ${PHASE_ICON_RADIUS}`,
  `L 0 ${-PHASE_ICON_RADIUS}`,
  "Z",
].join(" ");
const HALF_DISK_PATH_LEFT = [
  `M 0 ${-PHASE_ICON_RADIUS}`,
  `A ${PHASE_ICON_RADIUS} ${PHASE_ICON_RADIUS} 0 0 0 0 ${PHASE_ICON_RADIUS}`,
  `L 0 ${-PHASE_ICON_RADIUS}`,
  "Z",
].join(" ");

export function MoonDistanceChart({ series }: MoonDistanceChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const idBase = titleId.replace(/:/g, "");
  const gradientId = `${idBase}-fill`;
  const plotClipId = `${idBase}-plot-clip`;
  const [hoverState, setHoverState] = useState<MoonDistanceChartHoverState | null>(
    null,
  );
  const activePointerIdRef = useRef<number | null>(null);
  const geometry = useMemo(() => buildMoonDistanceChartGeometry(series), [series]);

  if (geometry === null) {
    return null;
  }

  const chartGeometry = geometry;
  const {
    plotWidth,
    plotHeight,
    currentPoint,
    points,
    phaseMarkers,
    xTickIndexes,
    yTicks,
    linePath,
    areaPath,
  } = chartGeometry;

  const hoveredPoint =
    hoverState?.kind === "sample" ? points[hoverState.pointIndex] ?? null : null;
  const hoveredPhaseMarker =
    hoverState?.kind === "phase"
      ? phaseMarkers[hoverState.phaseEventIndex] ?? null
      : null;
  const tooltipVerticalClass =
    hoverState !== null && hoverState.anchorY < 110
      ? "moon-distance-tooltip--below"
      : "moon-distance-tooltip--above";
  const tooltipLeft =
    hoverState === null
      ? 0
      : clampMoonDistanceTooltipX(hoverState.anchorX, hoverState.width);
  const tooltipTitle = hoveredPhaseMarker
    ? formatPhaseLabel(hoveredPhaseMarker.phaseEvent.phase)
    : hoveredPoint
      ? detailDateFormatter.format(new Date(hoveredPoint.sample.timestamp))
      : "";
  const tooltipValue = hoveredPhaseMarker
    ? formatDistance(hoveredPhaseMarker.phaseEvent.distanceKm)
    : hoveredPoint
      ? formatDistance(hoveredPoint.sample.distanceKm)
      : "";
  const tooltipContext = hoveredPhaseMarker
    ? detailDateFormatter.format(new Date(hoveredPhaseMarker.phaseEvent.timestamp))
    : hoveredPoint
      ? formatDayOffset(hoveredPoint.sample.dayOffset)
      : "";
  const tooltipSpecialLabel = hoveredPhaseMarker
    ? hoveredPhaseMarker.phaseEvent.isSupermoon
      ? "Supermoon"
      : null
    : null;

  function updateHoverState(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const anchorY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);

    setHoverState(
      resolveMoonDistanceChartHoverState(
        chartGeometry,
        anchorX,
        anchorY,
        rect.width,
        rect.height,
      ),
    );
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== "mouse") {
      event.preventDefault();
      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    updateHoverState(event);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    updateHoverState(event);
  }

  function handlePointerLeave(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse") {
      setHoverState(null);
    }
  }

  function handlePointerRelease(event: React.PointerEvent<SVGSVGElement>) {
    if (activePointerIdRef.current === event.pointerId) {
      activePointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setHoverState(null);
    }
  }

  function createPhaseHoverState(phaseEventIndex: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    return createMoonDistancePhaseHoverState(
      chartGeometry,
      phaseEventIndex,
      rect.width,
      rect.height,
    );
  }

  function createPhaseHoverHandler(phaseEventIndex: number) {
    return (event: React.PointerEvent<SVGCircleElement>) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      event.stopPropagation();

      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) {
        return;
      }

      setHoverState(createPhaseHoverState(phaseEventIndex, svg));
    };
  }

  return (
    <div className="moon-distance-chart-shell">
      <div className="moon-distance-chart-frame">
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className="moon-distance-chart"
          data-testid="moon-distance-chart"
          onPointerCancel={handlePointerRelease}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerLeave}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerRelease}
          role="img"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        >
          <title id={titleId}>Earth-Moon distance chart</title>
          <desc id={descriptionId}>
            Earth-Moon center distance sampled daily from six months before to
            six months after the selected date.
          </desc>

          <defs>
            <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#78d7ff" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#78d7ff" stopOpacity="0.02" />
            </linearGradient>
            <clipPath id={plotClipId}>
              <rect
                height={plotHeight}
                rx="18"
                width={plotWidth}
                x={PADDING_LEFT}
                y={PADDING_TOP}
              />
            </clipPath>
          </defs>

          <rect
            className="moon-distance-chart__backdrop"
            height={plotHeight}
            rx="18"
            width={plotWidth}
            x={PADDING_LEFT}
            y={PADDING_TOP}
          />

          {yTicks.map((tick) => (
            <text
              key={`y-label-${tick.distanceKm}`}
              className="moon-distance-chart__axis-label"
              textAnchor="end"
              x={PADDING_LEFT - 10}
              y={tick.y + 4}
            >
              {formatCompactDistance(tick.distanceKm)}
            </text>
          ))}

          {xTickIndexes.map((tickIndex) => {
            const point = points[tickIndex];

            return (
                <text
                key={`x-label-${tickIndex}`}
                className="moon-distance-chart__axis-label"
                textAnchor={
                  tickIndex === 0
                    ? "start"
                    : tickIndex === chartGeometry.lastIndex
                      ? "end"
                      : "middle"
                }
                x={point.x}
                y={SVG_HEIGHT - 12}
              >
                {axisDateFormatter.format(new Date(point.sample.timestamp))}
              </text>
            );
          })}

          <g clipPath={`url(#${plotClipId})`}>
            {yTicks.map((tick) => (
              <line
                key={`y-grid-${tick.distanceKm}`}
                className="moon-distance-chart__grid"
                x1={PADDING_LEFT}
                x2={PADDING_LEFT + plotWidth}
                y1={tick.y}
                y2={tick.y}
              />
            ))}

            {xTickIndexes.map((tickIndex) => {
              const point = points[tickIndex];

              return (
                <line
                  key={`x-grid-${tickIndex}`}
                  className="moon-distance-chart__grid moon-distance-chart__grid--vertical"
                  x1={point.x}
                  x2={point.x}
                  y1={PADDING_TOP}
                  y2={PADDING_TOP + plotHeight}
                />
              );
            })}

            <path
              className="moon-distance-chart__area"
              d={areaPath}
              fill={`url(#${gradientId})`}
            />
            <path className="moon-distance-chart__line" d={linePath} />
            <line
              className="moon-distance-chart__current-line"
              data-testid="moon-distance-current-line"
              x1={currentPoint.x}
              x2={currentPoint.x}
              y1={PADDING_TOP}
              y2={PADDING_TOP + plotHeight}
            />

            {phaseMarkers.map((marker) => (
              <g
                key={`phase-${marker.index}`}
                data-testid={
                  marker.phaseEvent.isSupermoon
                    ? "moon-phase-supermoon"
                    : "moon-phase-event"
                }
              >
                <g
                  className={`moon-distance-chart__phase-icon ${
                    marker.phaseEvent.isSupermoon
                      ? "moon-distance-chart__phase-icon--supermoon"
                      : ""
                  }`}
                  transform={`translate(${marker.x} ${marker.y})`}
                >
                  {marker.phaseEvent.isSupermoon && (
                    <circle
                      className="moon-distance-chart__phase-halo"
                      r={PHASE_ICON_RADIUS + 4}
                    />
                  )}
                  {renderPhaseIcon(marker.phaseEvent.phase)}
                </g>
              </g>
            ))}

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
            {hoveredPhaseMarker && (
              <>
                <line
                  className="moon-distance-chart__hover-line"
                  x1={hoveredPhaseMarker.x}
                  x2={hoveredPhaseMarker.x}
                  y1={PADDING_TOP}
                  y2={PADDING_TOP + plotHeight}
                />
                <circle
                  className="moon-distance-chart__hover-marker"
                  cx={hoveredPhaseMarker.x}
                  cy={hoveredPhaseMarker.y}
                  r="6"
                />
              </>
            )}
          </g>

          {phaseMarkers.map((marker) => (
            <circle
              key={`phase-hit-${marker.index}`}
              className="moon-distance-chart__phase-hit-area"
              cx={marker.x}
              cy={marker.y}
              onPointerEnter={createPhaseHoverHandler(marker.index)}
              onPointerMove={createPhaseHoverHandler(marker.index)}
              r={
                marker.phaseEvent.isSupermoon
                  ? SUPERMOON_HIT_RADIUS
                  : PHASE_HIT_RADIUS
              }
            />
          ))}
        </svg>

        {hoverState !== null && (hoveredPoint || hoveredPhaseMarker) && (
          <div
            className={`moon-distance-tooltip ${tooltipVerticalClass}`}
            data-testid="moon-distance-tooltip"
            style={{
              left: `${tooltipLeft}px`,
              top: `${Math.min(
                Math.max(hoverState.anchorY, 12),
                hoverState.height - 12,
              )}px`,
            }}
          >
            {tooltipSpecialLabel && (
              <span className="moon-distance-tooltip__eyebrow">
                {tooltipSpecialLabel}
              </span>
            )}
            <strong>{tooltipTitle}</strong>
            <span>{tooltipValue}</span>
            <small>{tooltipContext}</small>
          </div>
        )}
      </div>
    </div>
  );
}
