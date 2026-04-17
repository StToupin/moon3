import { memo, useId, type ChangeEvent } from "react";
import { useCollapsibleTransition } from "../hooks/useCollapsibleTransition";

export interface NavigationCardProps {
  cameraStateTestId?: string;
  className?: string;
  canGoNext: boolean;
  canGoPrevious: boolean;
  canStepDayForward: boolean;
  canStepDayBackward: boolean;
  currentCameraLabel: string;
  currentStep: number;
  dayOffset: number;
  displayDate: string;
  isCollapsed?: boolean;
  isCollapsible?: boolean;
  isPlaying: boolean;
  maxDayOffset: number;
  minDayOffset: number;
  onNext: () => void;
  onPrevious: () => void;
  onReset: () => void;
  onSliderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStepDayBackward: () => void;
  onStepDayForward: () => void;
  onToggleCollapse?: () => void;
  onTogglePlayback: () => void;
  totalSteps: number;
}

interface TimelineArrowIconProps {
  direction: "left" | "right";
}

function TimelineArrowIcon({ direction }: TimelineArrowIconProps) {
  return (
    <svg
      aria-hidden="true"
      className="timeline-button__glyph"
      viewBox="0 0 12 12"
    >
      <path
        d={
          direction === "left"
            ? "M7.75 2.25 4 6l3.75 3.75"
            : "M4.25 2.25 8 6l-3.75 3.75"
        }
      />
    </svg>
  );
}

function TimelinePlayPauseIcon({ isPlaying }: { isPlaying: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="timeline-button__glyph"
      viewBox="0 0 12 12"
    >
      {isPlaying ? (
        <>
          <rect fill="currentColor" height="7" rx="0.75" width="2.25" x="2" y="2.5" />
          <rect fill="currentColor" height="7" rx="0.75" width="2.25" x="7.75" y="2.5" />
        </>
      ) : (
        <path d="M3 2.25v7.5L9.25 6 3 2.25Z" fill="currentColor" />
      )}
    </svg>
  );
}

function TimelineResetIcon() {
  return (
    <svg
      aria-hidden="true"
      className="timeline-button__glyph"
      viewBox="0 0 12 12"
    >
      <path
        d="M9.2 4.25A4 4 0 1 0 10 6.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9.15 1.9v2.7h-2.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export const NavigationCard = memo(function NavigationCard({
  cameraStateTestId,
  className,
  canGoNext,
  canGoPrevious,
  canStepDayForward,
  canStepDayBackward,
  currentCameraLabel,
  currentStep,
  dayOffset,
  displayDate,
  isCollapsed = false,
  isCollapsible = false,
  isPlaying,
  maxDayOffset,
  minDayOffset,
  onNext,
  onPrevious,
  onReset,
  onSliderChange,
  onStepDayBackward,
  onStepDayForward,
  onToggleCollapse,
  onTogglePlayback,
  totalSteps,
}: NavigationCardProps) {
  const toolbarId = useId();
  const { ref: toolbarRef, shouldRender: shouldRenderToolbar } =
    useCollapsibleTransition(!isCollapsed);
  const timelineClassName = ["timeline-panel", className].filter(Boolean).join(" ");
  const timelineDateLabel =
    dayOffset === 0
      ? displayDate
      : `${displayDate} ${dayOffset > 0 ? "+" : ""}${dayOffset} days`;

  return (
    <div className={timelineClassName}>
      <div className="timeline-header">
        <div className="timeline-header__details">
          <p className="timeline-view-indicator" data-testid={cameraStateTestId}>
            {currentCameraLabel.toUpperCase()} ({currentStep}/{totalSteps})
          </p>
          <strong className="timeline-date-row" title={timelineDateLabel}>
            {displayDate}
            {dayOffset !== 0 && (
              <span className="timeline-offset">
                {dayOffset > 0 ? "+" : ""}
                {dayOffset} days
              </span>
            )}
          </strong>
        </div>
        {isCollapsible && onToggleCollapse && (
          <button
            aria-controls={toolbarId}
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed
                ? "Expand navigation card"
                : "Collapse navigation card"
            }
            className="timeline-card-toggle"
            onClick={onToggleCollapse}
            type="button"
          >
            <svg
              aria-hidden="true"
              className={`timeline-card-toggle__icon ${
                isCollapsed ? "timeline-card-toggle__icon--collapsed" : ""
              }`}
              viewBox="0 0 12 8"
            >
              <path d="M1.5 1.5 6 6 10.5 1.5" />
            </svg>
          </button>
        )}
      </div>

      {shouldRenderToolbar && (
        <div
          aria-hidden={isCollapsed}
          className="timeline-toolbar-collapse"
          id={toolbarId}
          ref={toolbarRef}
        >
          <div className="timeline-toolbar">
            <div className="timeline-controls timeline-controls--primary">
              <button
                aria-label="Previous"
                className="timeline-button"
                disabled={!canGoPrevious}
                onClick={onPrevious}
                type="button"
              >
                <span aria-hidden="true" className="timeline-button__icon">
                  <TimelineArrowIcon direction="left" />
                </span>
                <span aria-hidden="true" className="timeline-button__label">
                  Back
                </span>
              </button>
              <button
                aria-label="Next"
                className="timeline-button"
                disabled={!canGoNext}
                onClick={onNext}
                type="button"
              >
                <span aria-hidden="true" className="timeline-button__label">
                  Next
                </span>
                <span aria-hidden="true" className="timeline-button__icon">
                  <TimelineArrowIcon direction="right" />
                </span>
              </button>
            </div>

            <div className="timeline-controls timeline-controls--icon-actions">
              <button
                aria-label={isPlaying ? "Pause" : "Play"}
                className="timeline-button timeline-button--icon-only"
                onClick={onTogglePlayback}
                type="button"
              >
                <span aria-hidden="true" className="timeline-button__icon">
                  <TimelinePlayPauseIcon isPlaying={isPlaying} />
                </span>
              </button>
              <button
                aria-label="Reset"
                className="timeline-button timeline-button--icon-only timeline-button--secondary"
                onClick={onReset}
                type="button"
              >
                <span aria-hidden="true" className="timeline-button__icon">
                  <TimelineResetIcon />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="timeline-slider-grid">
        <button
          aria-label="Previous day"
          className="timeline-button timeline-button--icon-only timeline-button--secondary timeline-button--slider-step"
          disabled={!canStepDayBackward}
          onClick={onStepDayBackward}
          type="button"
        >
          <span aria-hidden="true" className="timeline-button__icon">
            <TimelineArrowIcon direction="left" />
          </span>
        </button>
        <input
          aria-label="Ephemeris day offset"
          className="timeline-slider"
          max={maxDayOffset}
          min={minDayOffset}
          onChange={onSliderChange}
          step={1}
          type="range"
          value={dayOffset}
        />
        <button
          aria-label="Next day"
          className="timeline-button timeline-button--icon-only timeline-button--secondary timeline-button--slider-step"
          disabled={!canStepDayForward}
          onClick={onStepDayForward}
          type="button"
        >
          <span aria-hidden="true" className="timeline-button__icon">
            <TimelineArrowIcon direction="right" />
          </span>
        </button>

        <div className="timeline-scale timeline-scale--slider">
          <span>{minDayOffset}d</span>
          <span>Now</span>
          <span>+{maxDayOffset}d</span>
        </div>
      </div>
    </div>
  );
});
