import type { ChangeEvent } from "react";

export interface NavigationCardProps {
  cameraStateTestId?: string;
  className?: string;
  canGoNext: boolean;
  canGoPrevious: boolean;
  currentCameraLabel: string;
  currentStep: number;
  dayOffset: number;
  displayDate: string;
  isPlaying: boolean;
  maxDayOffset: number;
  minDayOffset: number;
  onNext: () => void;
  onPrevious: () => void;
  onReset: () => void;
  onSliderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTogglePlayback: () => void;
  totalSteps: number;
}

export function NavigationCard({
  cameraStateTestId,
  className,
  canGoNext,
  canGoPrevious,
  currentCameraLabel,
  currentStep,
  dayOffset,
  displayDate,
  isPlaying,
  maxDayOffset,
  minDayOffset,
  onNext,
  onPrevious,
  onReset,
  onSliderChange,
  onTogglePlayback,
  totalSteps,
}: NavigationCardProps) {
  const timelineClassName = ["hud-card", "hud-card--timeline", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={timelineClassName}>
      <div className="timeline-header">
        <div>
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
      </div>

      <div className="timeline-toolbar">
        <div className="timeline-controls timeline-controls--compact">
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

        <div className="timeline-controls timeline-controls--compact">
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="timeline-button"
            onClick={onTogglePlayback}
            type="button"
          >
            <span aria-hidden="true" className="timeline-button__icon">
              {isPlaying ? "❚❚" : "▶"}
            </span>
            <span aria-hidden="true" className="timeline-button__label">
              {isPlaying ? "Pause" : "Play"}
            </span>
          </button>
          <button
            aria-label="Reset"
            className="timeline-button timeline-button--secondary"
            onClick={onReset}
            type="button"
          >
            <span aria-hidden="true" className="timeline-button__icon">
              ↺
            </span>
            <span aria-hidden="true" className="timeline-button__label">
              Reset
            </span>
          </button>
        </div>
      </div>

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

      <div className="timeline-scale">
        <span>{minDayOffset}d</span>
        <span>Now</span>
        <span>+{maxDayOffset}d</span>
      </div>
    </div>
  );
}
