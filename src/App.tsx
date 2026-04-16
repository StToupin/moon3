import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getBody, unflattenMatrix, unflattenOrbit } from "./api/ephemeris";
import { AppSidebar } from "./components/AppSidebar";
import { NavigationCard } from "./components/NavigationCard";
import { SceneStage } from "./components/SceneStage";
import {
  CAMERA_STATE_ORDER,
  formatCameraStateLabel,
  type CameraStateName,
} from "./components/SolarSystemView";
import type { Cameras, OrbitsData, SolarSystem } from "./components/types";
import {
  useEphemeris,
  useMoonDistanceSeries,
  useOrbits,
  useSpiceDiagnostics,
} from "./hooks/useEphemeris";
import { useGeolocation } from "./hooks/useGeolocation";

const MIN_DAY_OFFSET = -365;
const MAX_DAY_OFFSET = 365;
const PLAYBACK_INTERVAL_MS = 100;
const PLAYBACK_STEP_DAYS = 1;
const DEFAULT_CAMERA_STEP = 4;
const DEFAULT_CAMERA_STATE: CameraStateName =
  CAMERA_STATE_ORDER[DEFAULT_CAMERA_STEP - 1] ?? "moon";
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
  const moonDistanceRequest = useMemo(
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
  const {
    data: moonDistanceSeries,
    error: moonDistanceError,
    isLoading: isLoadingMoonDistance,
  } = useMoonDistanceSeries(moonDistanceRequest);
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
  const handleOpenSidebar = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);
  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const currentCameraIndex = CAMERA_STATE_ORDER.indexOf(currentCameraState);
  const currentCameraLabel = formatCameraStateLabel(currentCameraState);
  const currentStep = currentCameraIndex + 1;
  const handlePreviousCamera = useCallback(() => {
    setCurrentCameraState(CAMERA_STATE_ORDER[currentCameraIndex - 1]);
  }, [currentCameraIndex]);
  const handleNextCamera = useCallback(() => {
    setCurrentCameraState(CAMERA_STATE_ORDER[currentCameraIndex + 1]);
  }, [currentCameraIndex]);
  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((previous) => !previous);
  }, []);
  const handleResetTimeline = useCallback(() => {
    setDayOffset(0);
    setIsPlaying(false);
  }, []);
  const navigationCardProps = {
    canGoNext: currentCameraIndex < CAMERA_STATE_ORDER.length - 1,
    canGoPrevious: currentCameraIndex > 0,
    currentCameraLabel,
    currentStep,
    dayOffset,
    displayDate,
    isPlaying,
    maxDayOffset: MAX_DAY_OFFSET,
    minDayOffset: MIN_DAY_OFFSET,
    onNext: handleNextCamera,
    onPrevious: handlePreviousCamera,
    onReset: handleResetTimeline,
    onSliderChange: handleSliderChange,
    onTogglePlayback: handleTogglePlayback,
    totalSteps: CAMERA_STATE_ORDER.length,
  };

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

  useEffect(() => {
    if (!isSidebarOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarOpen]);

  return (
    <main className="ephemeris-page">
      <div className="solar-system-container">
        <button
          aria-controls="app-sidebar"
          aria-label="Open menu"
          className={`sidebar-menu-button ${isSidebarOpen ? "sidebar-menu-button--hidden" : ""}`}
          onClick={handleOpenSidebar}
          type="button"
        >
          <span aria-hidden="true" className="sidebar-menu-button__icon">
            ≡
          </span>
          <span className="sidebar-menu-button__label">Menu</span>
        </button>

        <button
          aria-label="Close menu overlay"
          className={`sidebar-backdrop ${isSidebarOpen ? "sidebar-backdrop--visible" : ""}`}
          onClick={handleCloseSidebar}
          tabIndex={isSidebarOpen ? 0 : -1}
          type="button"
        />

        <AppSidebar
          isLoadingMoonDistance={isLoadingMoonDistance}
          isOpen={isSidebarOpen}
          moonDistanceError={moonDistanceError}
          moonDistanceSeries={moonDistanceSeries}
          navigationCardProps={navigationCardProps}
          onCloseSidebar={handleCloseSidebar}
        />

        <SceneStage
          currentCameraState={currentCameraState}
          error={combinedError}
          isLoadingEphemeris={isLoadingEphemeris}
          isLoadingOrbits={isLoadingOrbits}
          solarSystemData={solarSystemData}
        />

        {!isSidebarOpen && (
          <div className="mobile-bottom-bar">
            <NavigationCard
              className="app-navigation-card app-navigation-card--mobile"
              {...navigationCardProps}
            />
          </div>
        )}
      </div>
    </main>
  );
}
