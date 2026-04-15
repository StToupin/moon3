export interface BodyState {
  position: [number, number, number];
  rotationMatrix: number[][];
  radii: [number, number, number];
  orbit?: [number, number, number][];
}

export interface OrbitsData {
  EARTH: [number, number, number][];
  MOON: [number, number, number][];
}

export interface SolarSystem {
  SUN: BodyState;
  EARTH: BodyState;
  MOON: BodyState;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

export interface Cameras {
  sun: CameraState;
  earth: CameraState;
  moon: CameraState;
}
