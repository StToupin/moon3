import type { MoonDistanceSeriesReply } from "../api/ephemeris";
import { MoonDistanceChart } from "./MoonDistanceChart";
import { NavigationCard, type NavigationCardProps } from "./NavigationCard";

type SidebarNavigationCardProps = Omit<
  NavigationCardProps,
  "cameraStateTestId" | "className"
>;

interface AppSidebarProps {
  isLoadingMoonDistance: boolean;
  isOpen: boolean;
  moonDistanceError: Error | null;
  moonDistanceSeries: MoonDistanceSeriesReply | null | undefined;
  navigationCardProps: SidebarNavigationCardProps;
  onCloseSidebar: () => void;
}

export function AppSidebar({
  isLoadingMoonDistance,
  isOpen,
  moonDistanceError,
  moonDistanceSeries,
  navigationCardProps,
  onCloseSidebar,
}: AppSidebarProps) {
  return (
    <aside
      aria-label="Controls and moon distance"
      className={`app-sidebar ${isOpen ? "app-sidebar--open" : ""}`}
      id="app-sidebar"
    >
      <button
        aria-label="Close menu"
        className="sidebar-close-button"
        onClick={onCloseSidebar}
        type="button"
      >
        ×
      </button>

      <div className="app-sidebar__inner">
        <div className="app-sidebar__content">
          <section
            aria-label="Moon Distance"
            className="hud-card tab-panel"
            id="moon-distance-panel"
            role="region"
          >
            <div className="tab-panel__header">
              <div className="tab-panel__heading">
                <h2>Moon Distance</h2>
              </div>
            </div>

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
          </section>
        </div>

        <NavigationCard
          {...navigationCardProps}
          cameraStateTestId="camera-state"
          className="app-navigation-card app-navigation-card--sidebar"
        />
      </div>
    </aside>
  );
}
