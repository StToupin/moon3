import { useLayoutEffect, useRef, type RefObject } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Bodies } from "./Bodies";
import type { Cameras, SolarSystem } from "./types";

interface CameraDisplayState {
  display: string;
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
}

interface CameraControllerProps {
  targetState: CameraDisplayState;
  viewName: string;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}

interface CameraSnapshot {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  quaternion: Quaternion;
  fov: number;
}

interface CameraTransition {
  start: CameraSnapshot;
  end: CameraSnapshot;
  elapsed: number;
}

const CAMERA_TRANSITION_DURATION = 0.8;

function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  if (t < 0.5) {
    return 4 * t * t * t;
  }

  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function normalizeUpVector(up: Vector3): Vector3 {
  if (up.lengthSq() === 0) {
    return new Vector3(0, 1, 0);
  }

  return up.normalize();
}

function buildCameraSnapshot(
  position: Vector3,
  target: Vector3,
  up: Vector3,
  fov: number,
): CameraSnapshot {
  const snapshotCamera = new PerspectiveCamera();
  const normalizedUp = normalizeUpVector(up.clone());

  snapshotCamera.position.copy(position);
  snapshotCamera.up.copy(normalizedUp);
  snapshotCamera.lookAt(target);

  return {
    position: position.clone(),
    target: target.clone(),
    up: normalizedUp,
    quaternion: snapshotCamera.quaternion.clone(),
    fov,
  };
}

function captureCameraSnapshot(
  camera: PerspectiveCamera,
  target: Vector3,
): CameraSnapshot {
  return {
    position: camera.position.clone(),
    target: target.clone(),
    up: normalizeUpVector(camera.up.clone()),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
  };
}

function applyCameraSnapshot(
  camera: PerspectiveCamera,
  controls: OrbitControlsImpl | null,
  snapshot: CameraSnapshot,
  syncControls = true,
) {
  camera.position.copy(snapshot.position);
  camera.up.copy(snapshot.up);
  camera.quaternion.copy(snapshot.quaternion);
  camera.fov = snapshot.fov;
  camera.updateProjectionMatrix();

  if (syncControls && controls) {
    controls.target.copy(snapshot.target);
    controls.update();
  }
}

function CameraController({
  targetState,
  viewName,
  controlsRef,
}: CameraControllerProps) {
  const { camera: threeCamera, size } = useThree();
  const camera = threeCamera as PerspectiveCamera;
  const lastViewRef = useRef(viewName);
  const zoomFactorRef = useRef(1);
  const lastTargetRef = useRef<Vector3 | null>(null);
  const lastBaseDistanceRef = useRef<number | null>(null);
  const transitionRef = useRef<CameraTransition | null>(null);
  const hasInitializedRef = useRef(false);
  const mobileFovMultiplier =
    size.width <= 720
      ? viewName === "schematic" || viewName === "solar_system"
        ? 1.35
        : 1.18
      : 1;
  const adjustedFov = targetState.fov * mobileFovMultiplier;

  useFrame((_, delta) => {
    const transition = transitionRef.current;
    if (!transition) {
      return;
    }

    transition.elapsed = Math.min(
      transition.elapsed + delta,
      CAMERA_TRANSITION_DURATION,
    );
    const progress = easeInOutCubic(
      transition.elapsed / CAMERA_TRANSITION_DURATION,
    );

    const position = transition.start.position
      .clone()
      .lerp(transition.end.position, progress);
    const target = transition.start.target
      .clone()
      .lerp(transition.end.target, progress);
    const up = normalizeUpVector(
      transition.start.up.clone().lerp(transition.end.up, progress),
    );
    const quaternion = transition.start.quaternion
      .clone()
      .slerp(transition.end.quaternion, progress);
    const fov = interpolate(transition.start.fov, transition.end.fov, progress);

    applyCameraSnapshot(camera, controlsRef.current, {
      position,
      target,
      up,
      quaternion,
      fov,
    }, false);

    if (progress >= 1) {
      transitionRef.current = null;
      applyCameraSnapshot(camera, controlsRef.current, transition.end);
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
    }
  });

  useLayoutEffect(() => {
    const targetPosition = new Vector3(
      targetState.position[0],
      targetState.position[1],
      targetState.position[2],
    );
    const lookAtTarget = new Vector3(
      targetState.target[0],
      targetState.target[1],
      targetState.target[2],
    );
    const baseDistance = targetPosition.distanceTo(lookAtTarget);
    const viewChanged = viewName !== lastViewRef.current;

    if (viewChanged) {
      zoomFactorRef.current = 1;
    } else if (
      lastTargetRef.current !== null &&
      lastBaseDistanceRef.current !== null
    ) {
      const currentDistance = camera.position.distanceTo(lastTargetRef.current);
      if (lastBaseDistanceRef.current > 0) {
        zoomFactorRef.current = currentDistance / lastBaseDistanceRef.current;
      }
    }

    lastTargetRef.current = lookAtTarget.clone();
    lastBaseDistanceRef.current = baseDistance;

    const direction = targetPosition.clone().sub(lookAtTarget);
    if (direction.lengthSq() === 0) {
      direction.set(0, 0, 1);
    } else {
      direction.normalize();
    }
    const zoomedDistance = baseDistance * zoomFactorRef.current;
    const zoomedPosition = lookAtTarget
      .clone()
      .add(direction.multiplyScalar(zoomedDistance));

    const nextSnapshot = buildCameraSnapshot(
      zoomedPosition,
      lookAtTarget,
      new Vector3(targetState.up[0], targetState.up[1], targetState.up[2]),
      adjustedFov,
    );

    if (!hasInitializedRef.current) {
      applyCameraSnapshot(camera, controlsRef.current, nextSnapshot);
      hasInitializedRef.current = true;
      transitionRef.current = null;
      lastViewRef.current = viewName;
      return;
    }

    if (viewChanged) {
      transitionRef.current = {
        start: captureCameraSnapshot(
          camera,
          controlsRef.current?.target.clone() ?? lookAtTarget.clone(),
        ),
        end: nextSnapshot,
        elapsed: 0,
      };

      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
      lastViewRef.current = viewName;
      return;
    }

    transitionRef.current = null;
    applyCameraSnapshot(camera, controlsRef.current, nextSnapshot);
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }
    lastViewRef.current = viewName;
  }, [adjustedFov, camera, controlsRef, targetState, viewName]);

  return null;
}

export type CameraStateName =
  | "schematic"
  | "solar_system"
  | "earth_moon"
  | "earth"
  | "moon";

export const CAMERA_STATE_ORDER: CameraStateName[] = [
  "schematic",
  "solar_system",
  "earth_moon",
  "earth",
  "moon",
];

export function formatCameraStateLabel(state: CameraStateName): string {
  switch (state) {
    case "schematic":
      return "Schematic (not to scale)";
    case "solar_system":
      return "Solar system";
    case "earth_moon":
      return "Earth and Moon";
    case "earth":
      return "Earth";
    case "moon":
      return "Moon";
  }
}

export interface SolarSystemViewProps {
  solarSystem: SolarSystem;
  cameras: Cameras;
  surfacePoint: [number, number, number];
  currentState: CameraStateName;
}

export function SolarSystemView({
  solarSystem,
  cameras,
  surfacePoint,
  currentState,
}: SolarSystemViewProps) {
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const currentStep = CAMERA_STATE_ORDER.indexOf(currentState) + 1;

  const cameraStates: Record<CameraStateName, CameraDisplayState> = {
    schematic: {
      display: formatCameraStateLabel("schematic"),
      position: cameras.sun.position,
      target: cameras.sun.target,
      up: cameras.sun.up,
      fov: 70,
    },
    solar_system: {
      display: formatCameraStateLabel("solar_system"),
      position: cameras.sun.position,
      target: cameras.sun.target,
      up: cameras.sun.up,
      fov: 70,
    },
    earth_moon: {
      display: formatCameraStateLabel("earth_moon"),
      position: cameras.earth.position,
      target: cameras.earth.target,
      up: cameras.earth.up,
      fov: 70,
    },
    earth: {
      display: formatCameraStateLabel("earth"),
      position: cameras.moon.position,
      target: surfacePoint,
      up: [
        solarSystem.EARTH.rotationMatrix[0][2],
        solarSystem.EARTH.rotationMatrix[1][2],
        solarSystem.EARTH.rotationMatrix[2][2],
      ],
      fov: 70,
    },
    moon: {
      display: formatCameraStateLabel("moon"),
      position: cameras.moon.position,
      target: cameras.moon.target,
      up: cameras.moon.up,
      fov: 1,
    },
  };

  const schematicMode = currentState === "schematic";
  const showEarthTexture =
    currentStep === 1 || currentStep === 3 || currentStep === 4;
  const showSunTexture = currentStep === 1;
  const showOrbits = currentStep <= 3;

  return (
    <div className="scene-shell">
      <Canvas
        camera={{
          position: cameraStates.solar_system.position,
          fov: cameraStates.solar_system.fov,
          up: cameraStates.solar_system.up,
          near: 1000,
          far: 1000000000,
        }}
        dpr={[1, 1.75]}
        style={{ width: "100%", height: "100%", background: "black" }}
      >
        <CameraController
          controlsRef={orbitControlsRef}
          targetState={cameraStates[currentState]}
          viewName={currentState}
        />
        <OrbitControls
          ref={orbitControlsRef}
          target={cameraStates[currentState].target}
        />
        <ambientLight intensity={0.1} />
        <pointLight
          position={solarSystem.SUN.position}
          intensity={100000000000000000}
          distance={0}
          decay={2}
        />
        <Bodies
          solarSystem={solarSystem}
          schematicMode={schematicMode}
          hideEarth={currentState === "moon"}
          showEarthTexture={showEarthTexture}
          showSunTexture={showSunTexture}
          showOrbits={showOrbits}
        />
        <mesh position={surfacePoint} scale={[20, 20, 20]}>
          <meshBasicMaterial color="red" />
          <sphereGeometry args={[1, 16, 16]} />
        </mesh>
      </Canvas>
    </div>
  );
}
