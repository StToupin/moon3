import { useId, type ChangeEvent } from "react";
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

export function NavigationCard({
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
  const timelineClassName = ["hud-card", "hud-card--timeline", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={timelineClassName}>
      <div className="timeline-header">
        <div className="timeline-header__details">
          <p className="timeline-view-indicator" data-testid={cameraStateTestId}>
            {currentCameraLabel.toUpperCase()} ({currentStep}/{totalSteps})
          </p>
          <strong>{displayDate}</strong>
          {dayOffset !== 0 && (
            <span className="timeline-offset">
              {dayOffset > 0 ? "+" : ""}
              {dayOffset} days
            </span>
          )}
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
                  ←
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
                  →
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
                  {isPlaying ? "❚❚" : "▶"}
                </span>
              </button>
              <button
                aria-label="Reset"
                className="timeline-button timeline-button--icon-only timeline-button--secondary"
                onClick={onReset}
                type="button"
              >
                <span aria-hidden="true" className="timeline-button__icon">
                  ↺
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
            ←
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
            →
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
}
