import { memo, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  getCameraDisplayState,
  getCameraViewSceneOptions,
  getMobileFovMultiplier,
  type CameraDisplayState,
  type CameraStateName,
} from "../cameraViews";
import { Bodies } from "./Bodies";
import type { Cameras, SolarSystem } from "./types";

interface CameraControllerProps {
  targetState: CameraDisplayState;
  viewName: CameraStateName;
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

interface LiveCameraDebugState {
  viewName: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

const CAMERA_TRANSITION_DURATION = 0.8;
const MOBILE_MAX_WIDTH = 720;

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

function toTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function updateLiveCameraDebugState(
  camera: PerspectiveCamera,
  target: Vector3,
  viewName: string,
) {
  const previousDebugState = window.__wasmSpiceDebug as
    | { liveCamera?: LiveCameraDebugState | null }
    | undefined;

  window.__wasmSpiceDebug = {
    ...previousDebugState,
    liveCamera: {
      viewName,
      position: toTuple(camera.position),
      target: toTuple(target),
      fov: camera.fov,
    },
  };
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
  const liveTargetRef = useRef<Vector3 | null>(null);
  const transitionRef = useRef<CameraTransition | null>(null);
  const hasInitializedRef = useRef(false);
  const mobileFovMultiplier =
    size.width <= MOBILE_MAX_WIDTH ? getMobileFovMultiplier(viewName) : 1;
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
    liveTargetRef.current = target.clone();
    updateLiveCameraDebugState(camera, target, viewName);

    if (progress >= 1) {
      transitionRef.current = null;
      applyCameraSnapshot(camera, controlsRef.current, transition.end);
      liveTargetRef.current = transition.end.target.clone();
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
      updateLiveCameraDebugState(camera, transition.end.target, viewName);
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
    const transition = transitionRef.current;

    if (viewChanged) {
      zoomFactorRef.current = 1;
    } else if (
      !transition &&
      lastTargetRef.current !== null &&
      lastBaseDistanceRef.current !== null
    ) {
      const previousTarget = liveTargetRef.current ?? lastTargetRef.current;
      const currentDistance = camera.position.distanceTo(previousTarget);
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
      liveTargetRef.current = nextSnapshot.target.clone();
      updateLiveCameraDebugState(camera, nextSnapshot.target, viewName);
      hasInitializedRef.current = true;
      transitionRef.current = null;
      lastViewRef.current = viewName;
      return;
    }

    if (viewChanged) {
      transitionRef.current = {
        start: captureCameraSnapshot(
          camera,
          liveTargetRef.current?.clone() ??
            controlsRef.current?.target.clone() ??
            lookAtTarget.clone(),
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

    if (transition) {
      transition.end = nextSnapshot;
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
      lastViewRef.current = viewName;
      return;
    }

    transitionRef.current = null;
    applyCameraSnapshot(camera, controlsRef.current, nextSnapshot);
    liveTargetRef.current = nextSnapshot.target.clone();
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }
    updateLiveCameraDebugState(camera, nextSnapshot.target, viewName);
    lastViewRef.current = viewName;
  }, [adjustedFov, camera, controlsRef, targetState, viewName]);

  return null;
}

export interface SolarSystemViewProps {
  solarSystem: SolarSystem;
  cameras: Cameras;
  surfacePoint: [number, number, number];
  currentState: CameraStateName;
}

export const SolarSystemView = memo(function SolarSystemView({
  solarSystem,
  cameras,
  surfacePoint,
  currentState,
}: SolarSystemViewProps) {
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const currentCameraDisplayState = useMemo(
    () =>
      getCameraDisplayState({
        cameras,
        solarSystem,
        state: currentState,
        surfacePoint,
      }),
    [cameras, currentState, solarSystem, surfacePoint],
  );
  const defaultCameraDisplayState = useMemo(
    () =>
      getCameraDisplayState({
        cameras,
        solarSystem,
        state: "solar_system",
        surfacePoint,
      }),
    [cameras, solarSystem, surfacePoint],
  );
  const sceneOptions = useMemo(
    () => getCameraViewSceneOptions(currentState),
    [currentState],
  );

  return (
    <div className="scene-shell">
      <Canvas
        camera={{
          position: defaultCameraDisplayState.position,
          fov: defaultCameraDisplayState.fov,
          up: defaultCameraDisplayState.up,
          near: 1000,
          far: 1000000000,
        }}
        dpr={[1, 1.75]}
        style={{ width: "100%", height: "100%", background: "black" }}
      >
        <CameraController
          controlsRef={orbitControlsRef}
          targetState={currentCameraDisplayState}
          viewName={currentState}
        />
        <OrbitControls
          ref={orbitControlsRef}
          target={currentCameraDisplayState.target}
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
          hideEarth={sceneOptions.hideEarth}
          schematicMode={sceneOptions.schematicMode}
          showEarthTexture={sceneOptions.showEarthTexture}
          showOrbits={sceneOptions.showOrbits}
          showSunTexture={sceneOptions.showSunTexture}
        />
        <mesh position={surfacePoint} scale={[20, 20, 20]}>
          <meshBasicMaterial color="red" />
          <sphereGeometry args={[1, 16, 16]} />
        </mesh>
      </Canvas>
    </div>
  );
});
