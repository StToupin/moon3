import { memo } from "react";
import type { MoonDistanceSeriesReply } from "../api/ephemeris";
import { useCollapsibleTransition } from "../hooks/useCollapsibleTransition";
import { MoonDistanceChart } from "./MoonDistanceChart";
import { NavigationCard, type NavigationCardProps } from "./NavigationCard";

type SidebarNavigationCardProps = Omit<
  NavigationCardProps,
  "cameraStateTestId" | "className"
>;

interface AppSidebarProps {
  isMoonDistanceCollapsed: boolean;
  isMoonDistanceCollapsible: boolean;
  isLoadingMoonDistance: boolean;
  moonDistanceError: Error | null;
  moonDistanceSeries: MoonDistanceSeriesReply | null | undefined;
  navigationCardProps: SidebarNavigationCardProps;
  onToggleMoonDistance: () => void;
}

export const AppSidebar = memo(function AppSidebar({
  isMoonDistanceCollapsed,
  isMoonDistanceCollapsible,
  isLoadingMoonDistance,
  moonDistanceError,
  moonDistanceSeries,
  navigationCardProps,
  onToggleMoonDistance,
}: AppSidebarProps) {
  const { ref: contentRef, shouldRender: shouldRenderContent } =
    useCollapsibleTransition(
      !isMoonDistanceCollapsible || !isMoonDistanceCollapsed,
    );

  return (
    <aside aria-label="Controls and moon distance" className="app-sidebar" id="app-sidebar">
      <div className="app-sidebar__inner">
        <div className="app-sidebar__content">
          <section
            aria-label="Moon Distance"
            className={`app-sidebar__topbar tab-panel ${
              isMoonDistanceCollapsed ? "tab-panel--collapsed" : ""
            } ${isMoonDistanceCollapsible ? "tab-panel--collapsible" : ""}`}
            id="moon-distance-panel"
            role="region"
          >
            <div className="tab-panel__header">
              <div className="tab-panel__heading">
                <h2>Moon Distance</h2>
              </div>
              {isMoonDistanceCollapsible && (
                <button
                  aria-controls="moon-distance-panel-content"
                  aria-expanded={!isMoonDistanceCollapsed}
                  aria-label={
                    isMoonDistanceCollapsed
                      ? "Expand moon distance card"
                      : "Collapse moon distance card"
                  }
                  className="tab-panel__toggle"
                  onClick={onToggleMoonDistance}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className={`tab-panel__toggle-icon ${
                      isMoonDistanceCollapsed
                        ? "tab-panel__toggle-icon--collapsed"
                        : ""
                    }`}
                    viewBox="0 0 12 8"
                  >
                    <path d="M1.5 1.5 6 6 10.5 1.5" />
                  </svg>
                </button>
              )}
            </div>

            {shouldRenderContent && (
              <div
                aria-hidden={isMoonDistanceCollapsible && isMoonDistanceCollapsed}
                className="tab-panel__collapse"
                id="moon-distance-panel-content"
                ref={contentRef}
              >
                <div className="tab-panel__content">
                  {moonDistanceError && (
                    <div
                      className="tab-panel__message tab-panel__message--error"
                      role="alert"
                    >
                      Error: {moonDistanceError.message}
                    </div>
                  )}

                  {isLoadingMoonDistance && !moonDistanceSeries && (
                    <div className="tab-panel__message">
                      <div className="loader tab-panel__loader"></div>
                      <span>Computing daily Earth-Moon distances&hellip;</span>
                    </div>
                  )}

                  {moonDistanceSeries && <MoonDistanceChart series={moonDistanceSeries} />}
                </div>
              </div>
            )}
          </section>
        </div>

        <NavigationCard
          {...navigationCardProps}
          cameraStateTestId="camera-state"
          className="app-navigation-bar app-navigation-bar--sidebar"
        />
      </div>
    </aside>
  );
});
