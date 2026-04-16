import {
  bodvrd,
  formatSpiceTime,
  getSpiceDiagnostics as getRuntimeDiagnostics,
  getSpiceRuntime,
  latrec,
  pxform,
  spkez,
  srfrec,
  str2et,
  type Matrix3,
  type SpiceDiagnostics,
  type Vector3Tuple,
} from "./runtime";

type Runtime = Awaited<ReturnType<typeof getSpiceRuntime>>;

const REFERENCE_FRAME = "ECLIPJ2000";
const SUN_ID = 10;
const EARTH_ID = 399;
const MOON_ID = 301;
const SUN_FRAME = "IAU_SUN";
const EARTH_FRAME = "IAU_EARTH";
const MOON_FRAME = "IAU_MOON";
const AU_KM = 149597870.7;
const MOON_ORBITAL_PERIOD_SECONDS = 27.32 * 24 * 60 * 60;
const EARTH_ORBITAL_PERIOD_SECONDS = 365.25 * 24 * 60 * 60;
const ORBIT_STEPS = 360;
const DISTANCE_SERIES_DAY_RANGE = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

type BodyName = "SUN" | "EARTH" | "MOON";

interface BodyInfo {
  id: number;
  frame: string;
  name: BodyName;
}

interface BodyPosition {
  position: Vector3Tuple;
  rotationMatrix: Matrix3;
  radii: Vector3Tuple;
}

export interface CameraPosition {
  position: number[];
  target: number[];
  up: number[];
}

export interface BodyData {
  name: BodyName;
  positionKm: number[];
  rotationMatrix: number[];
  radiiKm: number[];
}

export interface OrbitData {
  name: "EARTH" | "MOON";
  points: number[];
}

export interface EphemerisReply {
  timestamp: string;
  bodies: BodyData[];
  sunCamera: CameraPosition;
  earthCamera: CameraPosition;
  moonCamera: CameraPosition;
  surfacePoint: number[];
}

export interface OrbitsReply {
  orbits: OrbitData[];
}

export interface MoonDistanceSample {
  dayOffset: number;
  timestamp: string;
  distanceKm: number;
}

export interface MoonDistanceSeriesReply {
  referenceTimestamp: string;
  samples: MoonDistanceSample[];
}

const BODY_INFOS: Record<BodyName, BodyInfo> = {
  SUN: { id: SUN_ID, frame: SUN_FRAME, name: "SUN" },
  EARTH: { id: EARTH_ID, frame: EARTH_FRAME, name: "EARTH" },
  MOON: { id: MOON_ID, frame: MOON_FRAME, name: "MOON" },
};

const orbitCache = new Map<string, Promise<OrbitsReply>>();
const moonDistanceCache = new Map<string, Promise<MoonDistanceSeriesReply>>();

function parseDate(dateString: string): Date {
  const parsedDate = new Date(dateString);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  return parsedDate;
}

function toVector3(values: number[]): Vector3Tuple {
  if (values.length !== 3) {
    throw new Error(`Expected a 3-element vector, received ${values.length}`);
  }

  return [values[0], values[1], values[2]];
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function flattenMatrix(matrix: Matrix3): number[] {
  return matrix.flat();
}

function flattenOrbit(points: Vector3Tuple[]): number[] {
  return points.flat();
}

function vectorAdd(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vectorSub(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vectorLength(vector: Vector3Tuple): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function mxv(matrix: Matrix3, vector: Vector3Tuple): Vector3Tuple {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function mtxv(matrix: Matrix3, vector: Vector3Tuple): Vector3Tuple {
  return [
    matrix[0][0] * vector[0] + matrix[1][0] * vector[1] + matrix[2][0] * vector[2],
    matrix[0][1] * vector[0] + matrix[1][1] * vector[1] + matrix[2][1] * vector[2],
    matrix[0][2] * vector[0] + matrix[1][2] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function computeBodyPosition(
  runtime: Runtime,
  et: number,
  bodyInfo: BodyInfo,
): BodyPosition {
  const position = spkez(runtime, bodyInfo.id, et, REFERENCE_FRAME, 0).positionKm;
  const rotationMatrix = pxform(runtime, bodyInfo.frame, REFERENCE_FRAME, et);
  const radii = toVector3(bodvrd(runtime, bodyInfo.name, "RADII", 3));

  return {
    position,
    rotationMatrix,
    radii,
  };
}

function computeBodyPositions(
  runtime: Runtime,
  et: number,
): Record<BodyName, BodyPosition> {
  return {
    SUN: computeBodyPosition(runtime, et, BODY_INFOS.SUN),
    EARTH: computeBodyPosition(runtime, et, BODY_INFOS.EARTH),
    MOON: computeBodyPosition(runtime, et, BODY_INFOS.MOON),
  };
}

function computeCameras(
  runtime: Runtime,
  latitude: number,
  longitude: number,
  bodyPositions: Record<BodyName, BodyPosition>,
  et: number,
) {
  const sunPos = bodyPositions.SUN.position;
  const earthPos = bodyPositions.EARTH.position;
  const moonPos = bodyPositions.MOON.position;
  const earthRotation = bodyPositions.EARTH.rotationMatrix;
  const earthRadius = bodyPositions.EARTH.radii[0];

  const sunCamera = {
    position: [sunPos[0], sunPos[1], sunPos[2] + 1.5 * AU_KM],
    target: [...sunPos],
    up: [0, 1, 0],
  };

  const equatorialOffset: Vector3Tuple = [0, 0, 800000];
  const eclipticOffset = mtxv(earthRotation, equatorialOffset);
  const earthCamera = {
    position: vectorAdd(earthPos, eclipticOffset),
    target: [...earthPos],
    up: [0, 0, 1],
  };

  const latitudeRadians = degToRad(latitude);
  const longitudeRadians = degToRad(longitude);
  const aboveSurfacePosition = latrec(
    runtime,
    earthRadius + 4000,
    longitudeRadians,
    latitudeRadians,
  );
  const earthToEclipticRotation = pxform(
    runtime,
    EARTH_FRAME,
    REFERENCE_FRAME,
    et,
  );
  const eclipticAboveSurfacePosition = mxv(
    earthToEclipticRotation,
    aboveSurfacePosition,
  );

  const surfacePointLocal = srfrec(
    runtime,
    EARTH_ID,
    longitudeRadians,
    latitudeRadians,
  );
  const surfacePointEcliptic = mxv(earthRotation, surfacePointLocal);
  const surfacePoint = vectorAdd(earthPos, surfacePointEcliptic);
  const upVector = mxv(earthRotation, surfacePointLocal);

  const moonCamera = {
    position: vectorAdd(earthPos, eclipticAboveSurfacePosition),
    target: [...moonPos],
    up: [...upVector],
  };

  return {
    sunCamera,
    earthCamera,
    moonCamera,
    surfacePoint,
  };
}

function computeOrbitEtValues(
  runtime: Runtime,
  date: Date,
  orbitalPeriodSeconds: number,
): number[] {
  return Array.from({ length: ORBIT_STEPS }, (_, index) => {
    const offsetSeconds = Math.trunc((index * orbitalPeriodSeconds) / ORBIT_STEPS);
    const pointDate = new Date(date.getTime() - offsetSeconds * 1000);
    return str2et(runtime, formatSpiceTime(pointDate));
  });
}

function computeOrbitPoints(
  runtime: Runtime,
  bodyId: number,
  etValues: number[],
): Vector3Tuple[] {
  return etValues.map((et) => spkez(runtime, bodyId, et, REFERENCE_FRAME, 0).positionKm);
}

export async function getEphemeris(request: {
  date: string;
  latitude: number;
  longitude: number;
}): Promise<EphemerisReply> {
  const date = parseDate(request.date);
  const runtime = await getSpiceRuntime();
  const et = str2et(runtime, formatSpiceTime(date));
  const bodyPositions = computeBodyPositions(runtime, et);
  const cameraData = computeCameras(
    runtime,
    request.latitude,
    request.longitude,
    bodyPositions,
    et,
  );

  return {
    timestamp: date.toISOString(),
    bodies: (["SUN", "EARTH", "MOON"] as const).map((name) => ({
      name,
      positionKm: [...bodyPositions[name].position],
      rotationMatrix: flattenMatrix(bodyPositions[name].rotationMatrix),
      radiiKm: [...bodyPositions[name].radii],
    })),
    sunCamera: cameraData.sunCamera,
    earthCamera: cameraData.earthCamera,
    moonCamera: cameraData.moonCamera,
    surfacePoint: [...cameraData.surfacePoint],
  };
}

async function buildOrbitsReply(date: Date): Promise<OrbitsReply> {
  const runtime = await getSpiceRuntime();
  const earthEtValues = computeOrbitEtValues(
    runtime,
    date,
    EARTH_ORBITAL_PERIOD_SECONDS,
  );
  const earthOrbit = computeOrbitPoints(runtime, EARTH_ID, earthEtValues);

  const moonEtValues = computeOrbitEtValues(
    runtime,
    date,
    MOON_ORBITAL_PERIOD_SECONDS,
  );
  const moonPositions = computeOrbitPoints(runtime, MOON_ID, moonEtValues);
  const earthPositionsAtMoonTimes = computeOrbitPoints(
    runtime,
    EARTH_ID,
    moonEtValues,
  );

  const referenceEarthPosition = earthOrbit[0];
  const moonOrbit = moonPositions.map((moonPosition, index) => {
    const delta = vectorSub(earthPositionsAtMoonTimes[index], referenceEarthPosition);
    return vectorSub(moonPosition, delta);
  });

  return {
    orbits: [
      { name: "EARTH", points: flattenOrbit(earthOrbit) },
      { name: "MOON", points: flattenOrbit(moonOrbit) },
    ],
  };
}

export async function getOrbits(request: {
  date: string;
}): Promise<OrbitsReply> {
  const date = parseDate(request.date);
  const cacheKey = date.toISOString().slice(0, 16);

  const cached = orbitCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const orbitPromise = buildOrbitsReply(date).catch((error) => {
    orbitCache.delete(cacheKey);
    throw error;
  });

  orbitCache.set(cacheKey, orbitPromise);
  return orbitPromise;
}

async function buildMoonDistanceSeriesReply(
  date: Date,
): Promise<MoonDistanceSeriesReply> {
  const runtime = await getSpiceRuntime();
  const samples = Array.from(
    { length: DISTANCE_SERIES_DAY_RANGE * 2 + 1 },
    (_, index) => {
      const dayOffset = index - DISTANCE_SERIES_DAY_RANGE;
      const sampleDate = new Date(date.getTime() + dayOffset * DAY_MS);
      const et = str2et(runtime, formatSpiceTime(sampleDate));
      const moonPositionRelativeToEarth = spkez(
        runtime,
        MOON_ID,
        et,
        REFERENCE_FRAME,
        EARTH_ID,
      ).positionKm;

      return {
        dayOffset,
        timestamp: sampleDate.toISOString(),
        distanceKm: vectorLength(moonPositionRelativeToEarth),
      };
    },
  );

  return {
    referenceTimestamp: date.toISOString(),
    samples,
  };
}

export async function getMoonDistanceSeries(request: {
  date: string;
}): Promise<MoonDistanceSeriesReply> {
  const date = parseDate(request.date);
  const cacheKey = date.toISOString();

  const cached = moonDistanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const moonDistancePromise = buildMoonDistanceSeriesReply(date).catch((error) => {
    moonDistanceCache.delete(cacheKey);
    throw error;
  });

  moonDistanceCache.set(cacheKey, moonDistancePromise);
  return moonDistancePromise;
}

export async function getSpiceDiagnostics(): Promise<SpiceDiagnostics> {
  return getRuntimeDiagnostics();
}
