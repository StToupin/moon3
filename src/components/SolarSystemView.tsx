import { useEffect, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
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
  onTargetUpdate: (target: [number, number, number]) => void;
}

function CameraController({
  targetState,
  viewName,
  onTargetUpdate,
}: CameraControllerProps) {
  const { camera } = useThree();
  const lastViewRef = useRef(viewName);
  const zoomFactorRef = useRef(1);
  const lastTargetRef = useRef<Vector3 | null>(null);
  const lastBaseDistanceRef = useRef<number | null>(null);

  useEffect(() => {
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

    if (viewName !== lastViewRef.current) {
      zoomFactorRef.current = 1;
      lastViewRef.current = viewName;
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

    const direction = targetPosition.clone().sub(lookAtTarget).normalize();
    const zoomedDistance = baseDistance * zoomFactorRef.current;
    const zoomedPosition = lookAtTarget
      .clone()
      .add(direction.multiplyScalar(zoomedDistance));

    camera.position.copy(zoomedPosition);
    camera.up.set(targetState.up[0], targetState.up[1], targetState.up[2]);
    camera.lookAt(lookAtTarget);

    if ("fov" in camera) {
      Object.assign(camera as PerspectiveCamera, { fov: targetState.fov });
    }
    camera.updateProjectionMatrix();
    onTargetUpdate(targetState.target);
  }, [camera, onTargetUpdate, targetState, viewName]);

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
  const [orbitTarget, setOrbitTarget] = useState<[number, number, number]>(
    cameras.moon.target,
  );
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
          targetState={cameraStates[currentState]}
          viewName={currentState}
          onTargetUpdate={setOrbitTarget}
        />
        <OrbitControls target={orbitTarget} />
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
        />
        <mesh position={surfacePoint} scale={[20, 20, 20]}>
          <meshBasicMaterial color="red" />
          <sphereGeometry args={[1, 16, 16]} />
        </mesh>
      </Canvas>
    </div>
  );
}
