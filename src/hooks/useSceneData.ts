import { useEffect, useMemo } from "react";
import { getBody, unflattenMatrix, unflattenOrbit } from "../api/ephemeris";
import type { Cameras, OrbitsData, SolarSystem } from "../components/types";
import {
  useEphemeris,
  useMoonDistanceSeries,
  useOrbits,
  useSpiceDiagnostics,
} from "./useEphemeris";
import type { GeolocationState } from "./useGeolocation";

export interface SolarSystemSceneData {
  cameras: Cameras;
  solarSystem: SolarSystem;
  surfacePoint: [number, number, number];
}

interface UseSceneDataOptions {
  baseTimeMs: number | null;
  deferredIsoDate: string;
  geolocation: GeolocationState;
  isMoonDistanceEnabled: boolean;
  isoDate: string;
}

export function useSceneData({
  baseTimeMs,
  deferredIsoDate,
  geolocation,
  isMoonDistanceEnabled,
  isoDate,
}: UseSceneDataOptions) {
  const ephemerisRequest = useMemo(
    () => ({
      date: deferredIsoDate,
      latitude: geolocation.latitude,
      longitude: geolocation.longitude,
    }),
    [deferredIsoDate, geolocation.latitude, geolocation.longitude],
  );
  const datedRequest = useMemo(
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
  } = useOrbits(datedRequest);
  const {
    data: moonDistanceSeries,
    error: moonDistanceError,
    isLoading: isLoadingMoonDistance,
  } = useMoonDistanceSeries(datedRequest, {
    enabled: isMoonDistanceEnabled,
  });
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

  const solarSystemData = useMemo<SolarSystemSceneData | null>(() => {
    if (!data) {
      return null;
    }

    const sun = getBody(data, "SUN");
    const earth = getBody(data, "EARTH");
    const moon = getBody(data, "MOON");

    if (!sun || !earth || !moon) {
      return null;
    }

    return {
      solarSystem: {
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
      },
      cameras: {
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
      },
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
    baseTimeMs,
    combinedError,
    data,
    deferredIsoDate,
    diagnostics,
    geolocation.error,
    geolocation.isDefault,
    geolocation.latitude,
    geolocation.longitude,
    isoDate,
    orbits,
    solarSystemData,
  ]);

  return {
    combinedError,
    isLoadingEphemeris,
    isLoadingMoonDistance,
    isLoadingOrbits,
    moonDistanceError,
    moonDistanceSeries,
    solarSystemData,
  };
}
