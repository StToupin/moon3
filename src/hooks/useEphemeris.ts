import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getEphemeris,
  getMoonDistanceSeries,
  getOrbits,
  getSpiceDiagnostics,
  type EphemerisReply,
  type MoonDistanceSeriesReply,
  type OrbitsReply,
  type SpiceDiagnostics,
} from "../api/ephemeris";

export interface EphemerisQueryParams {
  date: string;
  latitude: number;
  longitude: number;
}

export interface OrbitsQueryParams {
  date: string;
}

export interface MoonDistanceSeriesQueryParams {
  date: string;
}

export function useEphemeris(params: EphemerisQueryParams) {
  return useQuery<EphemerisReply, Error>({
    queryKey: ["ephemeris", params.date, params.latitude, params.longitude],
    queryFn: () => getEphemeris(params),
    enabled: Boolean(params.date),
    placeholderData: keepPreviousData,
  });
}

export function useOrbits(params: OrbitsQueryParams) {
  return useQuery<OrbitsReply, Error>({
    queryKey: ["orbits", params.date],
    queryFn: () => getOrbits(params),
    enabled: Boolean(params.date),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
  });
}

export function useMoonDistanceSeries(
  params: MoonDistanceSeriesQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery<MoonDistanceSeriesReply, Error>({
    queryKey: ["moon-distance-series", params.date],
    queryFn: () => getMoonDistanceSeries(params),
    enabled: (options?.enabled ?? true) && Boolean(params.date),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
  });
}

export function useSpiceDiagnostics() {
  return useQuery<SpiceDiagnostics, Error>({
    queryKey: ["spice-diagnostics"],
    queryFn: getSpiceDiagnostics,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}
