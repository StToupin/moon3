import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
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
const DESKTOP_SIDEBAR_DEFAULT_WIDTH = 520;
const DESKTOP_SIDEBAR_MIN_WIDTH = 430;
const DESKTOP_SIDEBAR_FLOOR_WIDTH = 320;
const DESKTOP_SCENE_MIN_WIDTH = 320;
const MOBILE_BREAKPOINT_QUERY = "(max-width: 720px)";
const STEP_SEARCH_PARAM = "step";
const APP_HEIGHT_CSS_VARIABLE = "--app-height";

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

function getSidebarResizeBounds() {
  const maxWidth = Math.max(
    DESKTOP_SIDEBAR_FLOOR_WIDTH,
    window.innerWidth - DESKTOP_SCENE_MIN_WIDTH,
  );
  const minWidth = Math.min(DESKTOP_SIDEBAR_MIN_WIDTH, maxWidth);

  return {
    maxWidth,
    minWidth,
  };
}

function clampSidebarWidth(width: number): number {
  const { minWidth, maxWidth } = getSidebarResizeBounds();

  return Math.min(Math.max(width, minWidth), maxWidth);
}

function syncViewportHeightVariable() {
  const nextViewportHeight = Math.round(
    window.visualViewport?.height ?? window.innerHeight,
  );
  document.documentElement.style.setProperty(
    APP_HEIGHT_CSS_VARIABLE,
    `${nextViewportHeight}px`,
  );
}

export default function App() {
  const [dayOffset, setDayOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [desktopSidebarWidth, setDesktopSidebarWidth] = useState(() =>
    clampSidebarWidth(DESKTOP_SIDEBAR_DEFAULT_WIDTH),
  );
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches,
  );
  const [isMoonDistanceCollapsed, setIsMoonDistanceCollapsed] = useState(() =>
    window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches,
  );
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
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

  useEffect(() => {
    const mediaQueryList = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
      setIsMoonDistanceCollapsed(event.matches);
      setIsNavigationCollapsed(false);
      setDesktopSidebarWidth((previous) => clampSidebarWidth(previous));
    };

    setIsMobileLayout(mediaQueryList.matches);
    setIsMoonDistanceCollapsed(mediaQueryList.matches);
    setIsNavigationCollapsed(false);
    setDesktopSidebarWidth((previous) => clampSidebarWidth(previous));
    mediaQueryList.addEventListener("change", handleChange);

    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  const desktopSidebarWidthRef = useRef(desktopSidebarWidth);

  useEffect(() => {
    desktopSidebarWidthRef.current = desktopSidebarWidth;
  }, [desktopSidebarWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      syncViewportHeightVariable();
      setDesktopSidebarWidth((previous) => clampSidebarWidth(previous));
    };

    syncViewportHeightVariable();
    window.addEventListener("resize", handleWindowResize);
    window.visualViewport?.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.visualViewport?.removeEventListener("resize", handleWindowResize);
      document.documentElement.style.removeProperty(APP_HEIGHT_CSS_VARIABLE);
    };
  }, []);

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
    const previousDebugState = window.__wasmSpiceDebug as
      | { liveCamera?: unknown }
      | undefined;

    window.__wasmSpiceDebug = {
      liveCamera: previousDebugState?.liveCamera ?? null,
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
  const handleStepDayBackward = useCallback(() => {
    setDayOffset((previous) => Math.max(previous - 1, MIN_DAY_OFFSET));
    setIsPlaying(false);
  }, []);
  const handleStepDayForward = useCallback(() => {
    setDayOffset((previous) => Math.min(previous + 1, MAX_DAY_OFFSET));
    setIsPlaying(false);
  }, []);
  const currentCameraIndex = CAMERA_STATE_ORDER.indexOf(currentCameraState);
  const currentCameraLabel = formatCameraStateLabel(currentCameraState);
  const currentStep = currentCameraIndex + 1;
  const handlePreviousCamera = useCallback(() => {
    const previousCameraState = CAMERA_STATE_ORDER[currentCameraIndex - 1];
    if (!previousCameraState) {
      return;
    }

    startTransition(() => {
      setCurrentCameraState(previousCameraState);
    });
  }, [currentCameraIndex]);
  const handleNextCamera = useCallback(() => {
    const nextCameraState = CAMERA_STATE_ORDER[currentCameraIndex + 1];
    if (!nextCameraState) {
      return;
    }

    startTransition(() => {
      setCurrentCameraState(nextCameraState);
    });
  }, [currentCameraIndex]);
  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((previous) => !previous);
  }, []);
  const handleResetTimeline = useCallback(() => {
    setDayOffset(0);
    setIsPlaying(false);
  }, []);
  const handleToggleMoonDistanceCard = useCallback(() => {
    setIsMoonDistanceCollapsed((previous) => !previous);
  }, []);
  const handleToggleNavigationCard = useCallback(() => {
    setIsNavigationCollapsed((previous) => !previous);
  }, []);
  const handleSidebarResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isMobileLayout) {
        return;
      }

      event.preventDefault();

      const startX = event.clientX;
      const startWidth = desktopSidebarWidthRef.current;

      setIsResizingSidebar(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
        setDesktopSidebarWidth(nextWidth);
      };

      const handlePointerUp = () => {
        setIsResizingSidebar(false);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [isMobileLayout],
  );
  const handleSidebarResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isMobileLayout) {
        return;
      }

      let nextWidth: number | null = null;

      switch (event.key) {
        case "ArrowLeft":
          nextWidth = desktopSidebarWidthRef.current - 24;
          break;
        case "ArrowRight":
          nextWidth = desktopSidebarWidthRef.current + 24;
          break;
        case "Home":
          nextWidth = DESKTOP_SIDEBAR_MIN_WIDTH;
          break;
        default:
          return;
      }

      event.preventDefault();
      setDesktopSidebarWidth(clampSidebarWidth(nextWidth));
    },
    [isMobileLayout],
  );
  const navigationCardProps = {
    canGoNext: currentCameraIndex < CAMERA_STATE_ORDER.length - 1,
    canGoPrevious: currentCameraIndex > 0,
    canStepDayForward: dayOffset < MAX_DAY_OFFSET,
    canStepDayBackward: dayOffset > MIN_DAY_OFFSET,
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
    onStepDayBackward: handleStepDayBackward,
    onStepDayForward: handleStepDayForward,
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

  return (
    <main className="ephemeris-page">
      <div
        className={`solar-system-container ${
          isResizingSidebar ? "solar-system-container--resizing" : ""
        }`}
        style={
          isMobileLayout
            ? undefined
            : {
                gridTemplateColumns: `${desktopSidebarWidth}px minmax(0, 1fr)`,
              }
        }
      >
        <div className="app-sidebar-shell">
          <AppSidebar
            isMoonDistanceCollapsed={isMobileLayout && isMoonDistanceCollapsed}
            isMoonDistanceCollapsible={isMobileLayout}
            isLoadingMoonDistance={isLoadingMoonDistance}
            moonDistanceError={moonDistanceError}
            moonDistanceSeries={moonDistanceSeries}
            navigationCardProps={navigationCardProps}
            onToggleMoonDistance={handleToggleMoonDistanceCard}
          />

          {!isMobileLayout && (
            <div
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              aria-valuemax={getSidebarResizeBounds().maxWidth}
              aria-valuemin={getSidebarResizeBounds().minWidth}
              aria-valuenow={Math.round(desktopSidebarWidth)}
              className="sidebar-resize-handle"
              data-testid="sidebar-resize-handle"
              onKeyDown={handleSidebarResizeKeyDown}
              onPointerDown={handleSidebarResizeStart}
              role="separator"
              tabIndex={0}
            >
              <span aria-hidden="true" className="sidebar-resize-handle__grip" />
            </div>
          )}
        </div>

        <SceneStage
          currentCameraState={currentCameraState}
          error={combinedError}
          isLoadingEphemeris={isLoadingEphemeris}
          isLoadingOrbits={isLoadingOrbits}
          solarSystemData={solarSystemData}
        />

        <div className="mobile-bottom-bar">
          <NavigationCard
            className="app-navigation-card app-navigation-card--mobile"
            isCollapsed={isMobileLayout && isNavigationCollapsed}
            isCollapsible={isMobileLayout}
            onToggleCollapse={handleToggleNavigationCard}
            {...navigationCardProps}
          />
        </div>
      </div>
    </main>
  );
}
