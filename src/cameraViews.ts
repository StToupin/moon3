import type { Cameras, SolarSystem } from "./components/types";

export type CameraStateName =
  | "schematic"
  | "solar_system"
  | "earth_moon"
  | "earth"
  | "moon";

export interface CameraDisplayState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
}

export interface CameraViewSceneOptions {
  hideEarth: boolean;
  schematicMode: boolean;
  showEarthTexture: boolean;
  showOrbits: boolean;
  showSunTexture: boolean;
}

interface CameraViewDefinition {
  cameraSource: keyof Cameras;
  fov: number;
  label: string;
  mobileFovMultiplier: number;
  name: CameraStateName;
  scene: CameraViewSceneOptions;
  targetMode: "camera-target" | "surface-point";
  upMode: "camera-up" | "earth-axis";
}

const CAMERA_VIEW_DEFINITIONS = [
  {
    name: "schematic",
    label: "Schematic (not to scale)",
    cameraSource: "sun",
    targetMode: "camera-target",
    upMode: "camera-up",
    fov: 70,
    mobileFovMultiplier: 1.8,
    scene: {
      hideEarth: false,
      schematicMode: true,
      showEarthTexture: true,
      showOrbits: true,
      showSunTexture: true,
    },
  },
  {
    name: "solar_system",
    label: "Solar system",
    cameraSource: "sun",
    targetMode: "camera-target",
    upMode: "camera-up",
    fov: 70,
    mobileFovMultiplier: 1.72,
    scene: {
      hideEarth: false,
      schematicMode: false,
      showEarthTexture: false,
      showOrbits: true,
      showSunTexture: false,
    },
  },
  {
    name: "earth_moon",
    label: "Earth and Moon",
    cameraSource: "earth",
    targetMode: "camera-target",
    upMode: "camera-up",
    fov: 70,
    mobileFovMultiplier: 1.45,
    scene: {
      hideEarth: false,
      schematicMode: false,
      showEarthTexture: true,
      showOrbits: true,
      showSunTexture: false,
    },
  },
  {
    name: "moon",
    label: "Moon",
    cameraSource: "moon",
    targetMode: "camera-target",
    upMode: "camera-up",
    fov: 1,
    mobileFovMultiplier: 1.24,
    scene: {
      hideEarth: true,
      schematicMode: false,
      showEarthTexture: false,
      showOrbits: false,
      showSunTexture: false,
    },
  },
  {
    name: "earth",
    label: "Earth",
    cameraSource: "moon",
    targetMode: "surface-point",
    upMode: "earth-axis",
    fov: 70,
    mobileFovMultiplier: 1.18,
    scene: {
      hideEarth: false,
      schematicMode: false,
      showEarthTexture: true,
      showOrbits: false,
      showSunTexture: false,
    },
  },
] satisfies readonly CameraViewDefinition[];

const CAMERA_VIEW_DEFINITION_BY_NAME = Object.fromEntries(
  CAMERA_VIEW_DEFINITIONS.map((definition) => [definition.name, definition]),
) as Record<CameraStateName, CameraViewDefinition>;

export const CAMERA_STATE_ORDER = CAMERA_VIEW_DEFINITIONS.map(
  (definition) => definition.name,
) as CameraStateName[];

export const DEFAULT_CAMERA_STEP = 4;
export const DEFAULT_CAMERA_STATE: CameraStateName =
  CAMERA_STATE_ORDER[DEFAULT_CAMERA_STEP - 1] ?? "moon";

function getEarthSurfaceUpVector(solarSystem: SolarSystem): [number, number, number] {
  return [
    solarSystem.EARTH.rotationMatrix[0][2],
    solarSystem.EARTH.rotationMatrix[1][2],
    solarSystem.EARTH.rotationMatrix[2][2],
  ];
}

export function formatCameraStateLabel(state: CameraStateName): string {
  return CAMERA_VIEW_DEFINITION_BY_NAME[state].label;
}

export function getCameraStateFromStep(stepParam: string | null): CameraStateName | null {
  if (stepParam === null) {
    return null;
  }

  const parsedStep = Number(stepParam);
  if (!Number.isInteger(parsedStep)) {
    return null;
  }

  return CAMERA_STATE_ORDER[parsedStep - 1] ?? null;
}

export function getCameraStepNumber(state: CameraStateName): number {
  return CAMERA_STATE_ORDER.indexOf(state) + 1;
}

export function getCameraViewSceneOptions(
  state: CameraStateName,
): CameraViewSceneOptions {
  return CAMERA_VIEW_DEFINITION_BY_NAME[state].scene;
}

export function getMobileFovMultiplier(state: CameraStateName): number {
  return CAMERA_VIEW_DEFINITION_BY_NAME[state].mobileFovMultiplier;
}

export function getCameraDisplayState(options: {
  cameras: Cameras;
  solarSystem: SolarSystem;
  state: CameraStateName;
  surfacePoint: [number, number, number];
}): CameraDisplayState {
  const { cameras, solarSystem, state, surfacePoint } = options;
  const definition = CAMERA_VIEW_DEFINITION_BY_NAME[state];
  const camera = cameras[definition.cameraSource];
  const target =
    definition.targetMode === "surface-point" ? surfacePoint : camera.target;
  const up =
    definition.upMode === "earth-axis"
      ? getEarthSurfaceUpVector(solarSystem)
      : camera.up;

  return {
    position: camera.position,
    target,
    up,
    fov: definition.fov,
  };
}
