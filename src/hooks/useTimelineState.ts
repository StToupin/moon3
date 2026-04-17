import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

const displayDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
export const MAX_DAY_OFFSET = 365;
export const MIN_DAY_OFFSET = -365;
const PLAYBACK_INTERVAL_MS = 100;
const PLAYBACK_STEP_DAYS = 1;

export function getBaseTimeFromSearch(search: string): number | null {
  const dateParam = new URLSearchParams(search).get("date");
  if (!dateParam) {
    return null;
  }

  const parsedDate = new Date(dateParam);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
}

export function useTimelineState(baseTimeMs: number | null) {
  const [dayOffset, setDayOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const intervalId = window.setInterval(() => {
      startTransition(() => {
        setDayOffset((previous) => {
          const next = previous + PLAYBACK_STEP_DAYS;
          if (next > MAX_DAY_OFFSET) {
            setIsPlaying(false);
            return MAX_DAY_OFFSET;
          }
          return next;
        });
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isPlaying]);

  const isoDate = useMemo(() => {
    const now = new Date(baseTimeMs ?? Date.now());
    const targetDate = new Date(now.getTime() + dayOffset * DAY_IN_MILLISECONDS);
    return targetDate.toISOString();
  }, [baseTimeMs, dayOffset]);
  const deferredIsoDate = useDeferredValue(isoDate);
  const displayDate = useMemo(
    () => displayDateFormatter.format(new Date(isoDate)),
    [isoDate],
  );

  const handleSliderChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDayOffset(Number.parseInt(event.target.value, 10));
    setIsPlaying(false);
  }, []);

  const handleStepDayBackward = useCallback(() => {
    setDayOffset((previous) => Math.max(previous - 1, MIN_DAY_OFFSET));
    setIsPlaying(false);
  }, []);

  const handleStepDayForward = useCallback(() => {
    setDayOffset((previous) => Math.min(previous + 1, MAX_DAY_OFFSET));
    setIsPlaying(false);
  }, []);

  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((previous) => !previous);
  }, []);

  const handleResetTimeline = useCallback(() => {
    setDayOffset(0);
    setIsPlaying(false);
  }, []);

  return {
    dayOffset,
    deferredIsoDate,
    displayDate,
    isoDate,
    isPlaying,
    maxDayOffset: MAX_DAY_OFFSET,
    minDayOffset: MIN_DAY_OFFSET,
    onResetTimeline: handleResetTimeline,
    onSliderChange: handleSliderChange,
    onStepDayBackward: handleStepDayBackward,
    onStepDayForward: handleStepDayForward,
    onTogglePlayback: handleTogglePlayback,
  };
}
