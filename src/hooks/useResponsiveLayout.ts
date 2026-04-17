import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const APP_HEIGHT_CSS_VARIABLE = "--app-height";
const DESKTOP_SCENE_MIN_WIDTH = 320;
const DESKTOP_SIDEBAR_DEFAULT_WIDTH = 520;
const DESKTOP_SIDEBAR_FLOOR_WIDTH = 320;
const DESKTOP_SIDEBAR_MIN_WIDTH = 430;
const MOBILE_BREAKPOINT_QUERY = "(max-width: 720px)";

interface SidebarResizeBounds {
  maxWidth: number;
  minWidth: number;
}

function getSidebarResizeBounds(): SidebarResizeBounds {
  const maxWidth = Math.max(
    DESKTOP_SIDEBAR_FLOOR_WIDTH,
    window.innerWidth - DESKTOP_SCENE_MIN_WIDTH,
  );
  const minWidth = Math.min(DESKTOP_SIDEBAR_MIN_WIDTH, maxWidth);

  return {
    maxWidth,
    minWidth,
  };
}

function clampSidebarWidth(width: number): number {
  const { minWidth, maxWidth } = getSidebarResizeBounds();

  return Math.min(Math.max(width, minWidth), maxWidth);
}

function syncViewportHeightVariable() {
  const nextViewportHeight = Math.round(
    window.visualViewport?.height ?? window.innerHeight,
  );
  document.documentElement.style.setProperty(
    APP_HEIGHT_CSS_VARIABLE,
    `${nextViewportHeight}px`,
  );
}

export function useResponsiveLayout() {
  const [desktopSidebarWidth, setDesktopSidebarWidth] = useState(() =>
    clampSidebarWidth(DESKTOP_SIDEBAR_DEFAULT_WIDTH),
  );
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches,
  );
  const [isMoonDistanceCollapsed, setIsMoonDistanceCollapsed] = useState(() =>
    window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches,
  );
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarResizeBounds, setSidebarResizeBounds] = useState<SidebarResizeBounds>(
    () => getSidebarResizeBounds(),
  );
  const desktopSidebarWidthRef = useRef(desktopSidebarWidth);

  useEffect(() => {
    desktopSidebarWidthRef.current = desktopSidebarWidth;
  }, [desktopSidebarWidth]);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const syncLayout = (matches: boolean) => {
      setSidebarResizeBounds(getSidebarResizeBounds());
      setIsMobileLayout(matches);
      setIsMoonDistanceCollapsed(matches);
      setIsNavigationCollapsed(false);
      setDesktopSidebarWidth((previous) => clampSidebarWidth(previous));
    };
    const handleChange = (event: MediaQueryListEvent) => {
      syncLayout(event.matches);
    };

    syncLayout(mediaQueryList.matches);
    mediaQueryList.addEventListener("change", handleChange);

    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const handleWindowResize = () => {
      syncViewportHeightVariable();
      setSidebarResizeBounds(getSidebarResizeBounds());
      setDesktopSidebarWidth((previous) => clampSidebarWidth(previous));
    };

    syncViewportHeightVariable();
    window.addEventListener("resize", handleWindowResize);
    window.visualViewport?.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      window.visualViewport?.removeEventListener("resize", handleWindowResize);
      document.documentElement.style.removeProperty(APP_HEIGHT_CSS_VARIABLE);
    };
  }, []);

  const handleToggleMoonDistanceCard = useCallback(() => {
    setIsMoonDistanceCollapsed((previous) => !previous);
  }, []);

  const handleToggleNavigationCard = useCallback(() => {
    setIsNavigationCollapsed((previous) => !previous);
  }, []);

  const handleSidebarResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isMobileLayout) {
        return;
      }

      event.preventDefault();

      const startX = event.clientX;
      const startWidth = desktopSidebarWidthRef.current;

      setIsResizingSidebar(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
        setDesktopSidebarWidth(nextWidth);
      };

      const handlePointerUp = () => {
        setIsResizingSidebar(false);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [isMobileLayout],
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isMobileLayout) {
        return;
      }

      let nextWidth: number | null = null;

      switch (event.key) {
        case "ArrowLeft":
          nextWidth = desktopSidebarWidthRef.current - 24;
          break;
        case "ArrowRight":
          nextWidth = desktopSidebarWidthRef.current + 24;
          break;
        case "Home":
          nextWidth = sidebarResizeBounds.minWidth;
          break;
        default:
          return;
      }

      event.preventDefault();
      setDesktopSidebarWidth(clampSidebarWidth(nextWidth));
    },
    [isMobileLayout, sidebarResizeBounds.minWidth],
  );

  const sidebarGridStyle = useMemo(
    () =>
      isMobileLayout
        ? undefined
        : {
            gridTemplateColumns: `${desktopSidebarWidth}px minmax(0, 1fr)`,
          },
    [desktopSidebarWidth, isMobileLayout],
  );

  return {
    desktopSidebarWidth,
    isMobileLayout,
    isMoonDistanceCollapsed,
    isMoonDistanceQueryEnabled: !isMobileLayout || !isMoonDistanceCollapsed,
    isNavigationCollapsed,
    isResizingSidebar,
    onSidebarResizeKeyDown: handleSidebarResizeKeyDown,
    onSidebarResizeStart: handleSidebarResizeStart,
    onToggleMoonDistanceCard: handleToggleMoonDistanceCard,
    onToggleNavigationCard: handleToggleNavigationCard,
    sidebarGridStyle,
    sidebarResizeBounds,
  };
}
