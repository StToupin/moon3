import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  CAMERA_STATE_ORDER,
  DEFAULT_CAMERA_STATE,
  formatCameraStateLabel,
  getCameraStateFromStep,
  getCameraStepNumber,
  type CameraStateName,
} from "../cameraViews";

const STEP_SEARCH_PARAM = "step";

export function useCameraStepNavigation() {
  const [currentCameraState, setCurrentCameraState] =
    useState<CameraStateName>(() => {
      const stepParam = new URLSearchParams(window.location.search).get(
        STEP_SEARCH_PARAM,
      );
      return getCameraStateFromStep(stepParam) ?? DEFAULT_CAMERA_STATE;
    });

  const currentCameraIndex = useMemo(
    () => CAMERA_STATE_ORDER.indexOf(currentCameraState),
    [currentCameraState],
  );
  const currentCameraLabel = useMemo(
    () => formatCameraStateLabel(currentCameraState),
    [currentCameraState],
  );
  const currentStep = useMemo(
    () => getCameraStepNumber(currentCameraState),
    [currentCameraState],
  );
  const canGoPrevious = currentCameraIndex > 0;
  const canGoNext = currentCameraIndex < CAMERA_STATE_ORDER.length - 1;

  const handlePreviousCamera = useCallback(() => {
    const previousCameraState = CAMERA_STATE_ORDER[currentCameraIndex - 1];
    if (!previousCameraState) {
      return;
    }

    startTransition(() => {
      setCurrentCameraState(previousCameraState);
    });
  }, [currentCameraIndex]);

  const handleNextCamera = useCallback(() => {
    const nextCameraState = CAMERA_STATE_ORDER[currentCameraIndex + 1];
    if (!nextCameraState) {
      return;
    }

    startTransition(() => {
      setCurrentCameraState(nextCameraState);
    });
  }, [currentCameraIndex]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const nextStep = String(currentStep);

    if (url.searchParams.get(STEP_SEARCH_PARAM) === nextStep) {
      return;
    }

    url.searchParams.set(STEP_SEARCH_PARAM, nextStep);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [currentStep]);

  return {
    canGoNext,
    canGoPrevious,
    currentCameraLabel,
    currentCameraState,
    currentStep,
    onNextCamera: handleNextCamera,
    onPreviousCamera: handlePreviousCamera,
    totalSteps: CAMERA_STATE_ORDER.length,
  };
}
