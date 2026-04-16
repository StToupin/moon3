import {
  getEphemeris as getEphemerisFromWasm,
  getMoonDistanceSeries as getMoonDistanceSeriesFromWasm,
  getOrbits as getOrbitsFromWasm,
  getSpiceDiagnostics as getSpiceDiagnosticsFromWasm,
  type BodyData,
  type CameraPosition,
  type EphemerisReply,
  type MoonDistanceSample,
  type MoonDistanceSeriesReply,
  type OrbitData,
  type OrbitsReply,
} from "../spice/ephemerisService";
import type { SpiceDiagnostics } from "../spice/runtime";

export type {
  BodyData,
  CameraPosition,
  EphemerisReply,
  MoonDistanceSample,
  MoonDistanceSeriesReply,
  OrbitData,
  OrbitsReply,
  SpiceDiagnostics,
};

export async function getEphemeris(request: {
  date: string;
  latitude: number;
  longitude: number;
}): Promise<EphemerisReply> {
  return getEphemerisFromWasm(request);
}

export async function getOrbits(request: {
  date: string;
}): Promise<OrbitsReply> {
  return getOrbitsFromWasm(request);
}

export async function getMoonDistanceSeries(request: {
  date: string;
}): Promise<MoonDistanceSeriesReply> {
  return getMoonDistanceSeriesFromWasm(request);
}

export async function getSpiceDiagnostics(): Promise<SpiceDiagnostics> {
  return getSpiceDiagnosticsFromWasm();
}

export function getBody(reply: EphemerisReply, name: string): BodyData | undefined {
  return reply.bodies.find((body) => body.name === name);
}

export function unflattenOrbit(flat: number[]): [number, number, number][] {
  const points: [number, number, number][] = [];

  for (let index = 0; index < flat.length; index += 3) {
    points.push([flat[index], flat[index + 1], flat[index + 2]]);
  }

  return points;
}

export function unflattenMatrix(flat: number[]): number[][] {
  return [
    [flat[0], flat[1], flat[2]],
    [flat[3], flat[4], flat[5]],
    [flat[6], flat[7], flat[8]],
  ];
}
