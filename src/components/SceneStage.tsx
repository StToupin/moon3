import { Suspense } from "react";
import { SolarSystemView, type CameraStateName } from "./SolarSystemView";
import type { Cameras, SolarSystem } from "./types";

interface SolarSystemSceneData {
  cameras: Cameras;
  solarSystem: SolarSystem;
  surfacePoint: [number, number, number];
}

interface SceneStageProps {
  currentCameraState: CameraStateName;
  error: Error | null | undefined;
  isLoadingEphemeris: boolean;
  isLoadingOrbits: boolean;
  solarSystemData: SolarSystemSceneData | null;
}

export function SceneStage({
  currentCameraState,
  error,
  isLoadingEphemeris,
  isLoadingOrbits,
  solarSystemData,
}: SceneStageProps) {
  return (
    <div className="scene-stage">
      {error && (
        <div className="error-overlay" role="alert">
          Error: {error.message}
        </div>
      )}

      {(isLoadingEphemeris || isLoadingOrbits) && !solarSystemData && (
        <div className="loading-overlay">
          <div className="loader"></div>
          <span>Loading browser-side ephemeris&hellip;</span>
        </div>
      )}

      {solarSystemData && (
        <Suspense
          fallback={
            <div className="loading-overlay">
              <div className="loader"></div>
              <span>Loading 3D scene&hellip;</span>
            </div>
          }
        >
          <SolarSystemView
            cameras={solarSystemData.cameras}
            currentState={currentCameraState}
            solarSystem={solarSystemData.solarSystem}
            surfacePoint={solarSystemData.surfacePoint}
          />
        </Suspense>
      )}
    </div>
  );
}
