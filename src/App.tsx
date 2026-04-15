import {
  Suspense,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getBody, unflattenMatrix, unflattenOrbit } from "./api/ephemeris";
import {
  CAMERA_STATE_ORDER,
  formatCameraStateLabel,
  SolarSystemView,
  type CameraStateName,
} from "./components/SolarSystemView";
import type { Cameras, OrbitsData, SolarSystem } from "./components/types";
import { useEphemeris, useOrbits, useSpiceDiagnostics } from "./hooks/useEphemeris";
import { useGeolocation } from "./hooks/useGeolocation";

const MIN_DAY_OFFSET = -365;
const MAX_DAY_OFFSET = 365;
const PLAYBACK_INTERVAL_MS = 100;
const PLAYBACK_STEP_DAYS = 1;
const DEFAULT_CAMERA_STATE: CameraStateName = "moon";
const STEP_SEARCH_PARAM = "step";

declare global {
  interface Window {
    __wasmSpiceDebug?: unknown;
  }
}

function getCameraStateFromStep(stepParam: string | null): CameraStateName | null {
  if (stepParam === null) {
    return null;
  }

  const parsedStep = Number(stepParam);
  if (!Number.isInteger(parsedStep)) {
    return null;
  }

  return CAMERA_STATE_ORDER[parsedStep - 1] ?? null;
}

export default function App() {
  const [dayOffset, setDayOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCameraState, setCurrentCameraState] =
    useState<CameraStateName>(() => {
      const stepParam = new URLSearchParams(window.location.search).get(
        STEP_SEARCH_PARAM,
      );
      return getCameraStateFromStep(stepParam) ?? DEFAULT_CAMERA_STATE;
    });
  const geolocation = useGeolocation();
  const baseTimeMs = useMemo(() => {
    const dateParam = new URLSearchParams(window.location.search).get("date");
    if (!dateParam) {
      return null;
    }

    const parsedDate = new Date(dateParam);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
  }, []);

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
    const targetDate = new Date(
      now.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    return targetDate.toISOString();
  }, [baseTimeMs, dayOffset]);

  const deferredIsoDate = useDeferredValue(isoDate);

  const displayDate = useMemo(
    () =>
      new Date(isoDate).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [isoDate],
  );

  const ephemerisRequest = useMemo(
    () => ({
      date: deferredIsoDate,
      latitude: geolocation.latitude,
      longitude: geolocation.longitude,
    }),
    [deferredIsoDate, geolocation.latitude, geolocation.longitude],
  );

  const orbitsRequest = useMemo(
    () => ({ date: deferredIsoDate }),
    [deferredIsoDate],
  );

  const {
    data,
    error: ephemerisError,
    isLoading: isLoadingEphemeris,
  } = useEphemeris(ephemerisRequest);
  const {
    data: orbitsData,
    error: orbitsError,
    isLoading: isLoadingOrbits,
  } = useOrbits(orbitsRequest);
  const { data: diagnostics } = useSpiceDiagnostics();

  const combinedError = ephemerisError ?? orbitsError;

  const orbits = useMemo<OrbitsData | null>(() => {
    if (!orbitsData) {
      return null;
    }

    const earthOrbit = orbitsData.orbits.find((orbit) => orbit.name === "EARTH");
    const moonOrbit = orbitsData.orbits.find((orbit) => orbit.name === "MOON");

    return {
      EARTH: earthOrbit ? unflattenOrbit(earthOrbit.points) : [],
      MOON: moonOrbit ? unflattenOrbit(moonOrbit.points) : [],
    };
  }, [orbitsData]);

  const solarSystemData = useMemo(() => {
    if (!data) {
      return null;
    }

    const sun = getBody(data, "SUN");
    const earth = getBody(data, "EARTH");
    const moon = getBody(data, "MOON");

    if (!sun || !earth || !moon) {
      return null;
    }

    const solarSystem: SolarSystem = {
      SUN: {
        position: sun.positionKm as [number, number, number],
        rotationMatrix: unflattenMatrix(sun.rotationMatrix),
        radii: sun.radiiKm as [number, number, number],
        orbit: [],
      },
      EARTH: {
        position: earth.positionKm as [number, number, number],
        rotationMatrix: unflattenMatrix(earth.rotationMatrix),
        radii: earth.radiiKm as [number, number, number],
        orbit: orbits?.EARTH,
      },
      MOON: {
        position: moon.positionKm as [number, number, number],
        rotationMatrix: unflattenMatrix(moon.rotationMatrix),
        radii: moon.radiiKm as [number, number, number],
        orbit: orbits?.MOON,
      },
    };

    const cameras: Cameras = {
      sun: {
        position: data.sunCamera.position as [number, number, number],
        target: data.sunCamera.target as [number, number, number],
        up: data.sunCamera.up as [number, number, number],
      },
      earth: {
        position: data.earthCamera.position as [number, number, number],
        target: data.earthCamera.target as [number, number, number],
        up: data.earthCamera.up as [number, number, number],
      },
      moon: {
        position: data.moonCamera.position as [number, number, number],
        target: data.moonCamera.target as [number, number, number],
        up: data.moonCamera.up as [number, number, number],
      },
    };

    return {
      solarSystem,
      cameras,
      surfacePoint: data.surfacePoint as [number, number, number],
    };
  }, [data, orbits]);

  useEffect(() => {
    window.__wasmSpiceDebug = {
      status: combinedError
        ? "error"
        : solarSystemData && orbits
          ? "ready"
          : "loading",
      requestedIsoDate: isoDate,
      resolvedIsoDate: deferredIsoDate,
      geolocation: {
        latitude: geolocation.latitude,
        longitude: geolocation.longitude,
        isDefault: geolocation.isDefault,
        error: geolocation.error,
      },
      seededFromQuery: baseTimeMs !== null,
      diagnostics,
      ephemeris: data
        ? {
            timestamp: data.timestamp,
            bodies: data.bodies,
            surfacePoint: data.surfacePoint,
            sunCamera: data.sunCamera,
            earthCamera: data.earthCamera,
            moonCamera: data.moonCamera,
          }
        : null,
      orbits: orbits
        ? {
            earthPoints: orbits.EARTH.length,
            moonPoints: orbits.MOON.length,
            earthFirstPoint: orbits.EARTH[0] ?? null,
            moonFirstPoint: orbits.MOON[0] ?? null,
          }
        : null,
      error: combinedError?.message ?? null,
    };
  }, [
    combinedError,
    data,
    deferredIsoDate,
    diagnostics,
    baseTimeMs,
    geolocation.error,
    geolocation.isDefault,
    geolocation.latitude,
    geolocation.longitude,
    isoDate,
    orbits,
    solarSystemData,
  ]);

  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDayOffset(Number.parseInt(event.target.value, 10));
      setIsPlaying(false);
    },
    [],
  );

  const currentCameraIndex = CAMERA_STATE_ORDER.indexOf(currentCameraState);
  const currentCameraLabel = formatCameraStateLabel(currentCameraState);
  const currentStep = currentCameraIndex + 1;

  useEffect(() => {
    const url = new URL(window.location.href);
    const nextStep = String(currentStep);

    if (url.searchParams.get(STEP_SEARCH_PARAM) === nextStep) {
      return;
    }

    url.searchParams.set(STEP_SEARCH_PARAM, nextStep);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [currentStep]);

  return (
    <main className="ephemeris-page">
      <div className="solar-system-container">
        <div className="scene-stage">
          {combinedError && (
            <div className="error-overlay" role="alert">
              Error: {combinedError.message}
            </div>
          )}

          {(isLoadingEphemeris || isLoadingOrbits) && !solarSystemData && (
            <div className="loading-overlay">
              <div className="loader"></div>
              <span>Loading browser-side ephemeris&hellip;</span>
            </div>
          )}

          {solarSystemData && (
            <Suspense
              fallback={
                <div className="loading-overlay">
                  <div className="loader"></div>
                  <span>Loading 3D scene&hellip;</span>
                </div>
              }
            >
              <SolarSystemView
                solarSystem={solarSystemData.solarSystem}
                cameras={solarSystemData.cameras}
                currentState={currentCameraState}
                surfacePoint={solarSystemData.surfacePoint}
              />
            </Suspense>
          )}
        </div>

        <div className="hud-card hud-card--timeline">
          <div className="timeline-header">
            <div>
              <p className="timeline-view-indicator" data-testid="camera-state">
                {currentCameraLabel.toUpperCase()} ({currentStep}/
                {CAMERA_STATE_ORDER.length})
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
                disabled={currentCameraIndex === 0}
                onClick={() =>
                  setCurrentCameraState(
                    CAMERA_STATE_ORDER[currentCameraIndex - 1],
                  )
                }
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
                disabled={currentCameraIndex === CAMERA_STATE_ORDER.length - 1}
                onClick={() =>
                  setCurrentCameraState(
                    CAMERA_STATE_ORDER[currentCameraIndex + 1],
                  )
                }
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
                onClick={() => setIsPlaying((previous) => !previous)}
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
                onClick={() => {
                  setDayOffset(0);
                  setIsPlaying(false);
                }}
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
            max={MAX_DAY_OFFSET}
            min={MIN_DAY_OFFSET}
            onChange={handleSliderChange}
            step={1}
            type="range"
            value={dayOffset}
          />

          <div className="timeline-scale">
            <span>-365d</span>
            <span>Now</span>
            <span>+365d</span>
          </div>
        </div>
      </div>
    </main>
  );
}
