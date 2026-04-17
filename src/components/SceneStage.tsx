import { Suspense, memo, useEffect, useState } from "react";
import type { CameraStateName } from "../cameraViews";
import type { SolarSystemSceneData } from "../hooks/useSceneData";
import { SolarSystemView } from "./SolarSystemView";

const SCENE_LOADING_OVERLAY_DELAY_MS = 180;

interface SceneStageProps {
  currentCameraState: CameraStateName;
  error: Error | null | undefined;
  isLoadingEphemeris: boolean;
  isLoadingOrbits: boolean;
  solarSystemData: SolarSystemSceneData | null;
}

function DelayedSceneFallback() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
    }, SCENE_LOADING_OVERLAY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="loading-overlay">
      <div className="loader"></div>
      <span>Loading 3D scene&hellip;</span>
    </div>
  );
}

export const SceneStage = memo(function SceneStage({
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
        <Suspense fallback={<DelayedSceneFallback />}>
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
});
