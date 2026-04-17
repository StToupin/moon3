import { useMemo } from "react";
import { AppSidebar } from "./components/AppSidebar";
import { NavigationCard } from "./components/NavigationCard";
import { SceneStage } from "./components/SceneStage";
import { useCameraStepNavigation } from "./hooks/useCameraStepNavigation";
import { useGeolocation } from "./hooks/useGeolocation";
import { useResponsiveLayout } from "./hooks/useResponsiveLayout";
import { useSceneData } from "./hooks/useSceneData";
import { getBaseTimeFromSearch, useTimelineState } from "./hooks/useTimelineState";

declare global {
  interface Window {
    __wasmSpiceDebug?: unknown;
  }
}

export default function App() {
  const baseTimeMs = useMemo(() => getBaseTimeFromSearch(window.location.search), []);
  const geolocation = useGeolocation();
  const timeline = useTimelineState(baseTimeMs);
  const cameraStep = useCameraStepNavigation();
  const layout = useResponsiveLayout();
  const sceneData = useSceneData({
    baseTimeMs,
    deferredIsoDate: timeline.deferredIsoDate,
    geolocation,
    isMoonDistanceEnabled: layout.isMoonDistanceQueryEnabled,
    isoDate: timeline.isoDate,
  });

  const navigationCardProps = useMemo(
    () => ({
      canGoNext: cameraStep.canGoNext,
      canGoPrevious: cameraStep.canGoPrevious,
      canStepDayForward: timeline.dayOffset < timeline.maxDayOffset,
      canStepDayBackward: timeline.dayOffset > timeline.minDayOffset,
      currentCameraLabel: cameraStep.currentCameraLabel,
      currentStep: cameraStep.currentStep,
      dayOffset: timeline.dayOffset,
      displayDate: timeline.displayDate,
      isPlaying: timeline.isPlaying,
      maxDayOffset: timeline.maxDayOffset,
      minDayOffset: timeline.minDayOffset,
      onNext: cameraStep.onNextCamera,
      onPrevious: cameraStep.onPreviousCamera,
      onReset: timeline.onResetTimeline,
      onSliderChange: timeline.onSliderChange,
      onStepDayBackward: timeline.onStepDayBackward,
      onStepDayForward: timeline.onStepDayForward,
      onTogglePlayback: timeline.onTogglePlayback,
      totalSteps: cameraStep.totalSteps,
    }),
    [
      cameraStep.canGoNext,
      cameraStep.canGoPrevious,
      cameraStep.currentCameraLabel,
      cameraStep.currentStep,
      cameraStep.onNextCamera,
      cameraStep.onPreviousCamera,
      cameraStep.totalSteps,
      timeline.dayOffset,
      timeline.displayDate,
      timeline.isPlaying,
      timeline.maxDayOffset,
      timeline.minDayOffset,
      timeline.onResetTimeline,
      timeline.onSliderChange,
      timeline.onStepDayBackward,
      timeline.onStepDayForward,
      timeline.onTogglePlayback,
    ],
  );

  return (
    <main className="ephemeris-page">
      <div
        className={`solar-system-container ${
          layout.isResizingSidebar ? "solar-system-container--resizing" : ""
        }`}
        style={layout.sidebarGridStyle}
      >
        <div className="app-sidebar-shell">
          <AppSidebar
            isMoonDistanceCollapsed={
              layout.isMobileLayout && layout.isMoonDistanceCollapsed
            }
            isMoonDistanceCollapsible={layout.isMobileLayout}
            isLoadingMoonDistance={sceneData.isLoadingMoonDistance}
            moonDistanceError={sceneData.moonDistanceError}
            moonDistanceSeries={sceneData.moonDistanceSeries}
            navigationCardProps={navigationCardProps}
            onToggleMoonDistance={layout.onToggleMoonDistanceCard}
          />

          {!layout.isMobileLayout && (
            <div
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              aria-valuemax={layout.sidebarResizeBounds.maxWidth}
              aria-valuemin={layout.sidebarResizeBounds.minWidth}
              aria-valuenow={Math.round(layout.desktopSidebarWidth)}
              className="sidebar-resize-handle"
              data-testid="sidebar-resize-handle"
              onKeyDown={layout.onSidebarResizeKeyDown}
              onPointerDown={layout.onSidebarResizeStart}
              role="separator"
              tabIndex={0}
            >
              <span aria-hidden="true" className="sidebar-resize-handle__grip" />
            </div>
          )}
        </div>

        <SceneStage
          currentCameraState={cameraStep.currentCameraState}
          error={sceneData.combinedError}
          isLoadingEphemeris={sceneData.isLoadingEphemeris}
          isLoadingOrbits={sceneData.isLoadingOrbits}
          solarSystemData={sceneData.solarSystemData}
        />

        <div className="mobile-bottom-bar">
          <NavigationCard
            className="app-navigation-bar app-navigation-bar--mobile"
            isCollapsed={layout.isMobileLayout && layout.isNavigationCollapsed}
            isCollapsible={layout.isMobileLayout}
            onToggleCollapse={layout.onToggleNavigationCard}
            {...navigationCardProps}
          />
        </div>
      </div>
    </main>
  );
}
