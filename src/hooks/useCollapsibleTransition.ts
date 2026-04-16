import { useEffect, useLayoutEffect, useRef, useState } from "react";

const COLLAPSE_TRANSITION =
  "height 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
const COLLAPSED_TRANSFORM = "translateY(-8px)";

function applyExpandedStyles(node: HTMLElement) {
  node.style.height = "auto";
  node.style.opacity = "1";
  node.style.overflow = "visible";
  node.style.pointerEvents = "auto";
  node.style.transform = "translateY(0)";
  node.style.transition = "none";
  node.style.visibility = "visible";
}

function applyCollapsedStyles(node: HTMLElement) {
  node.style.height = "0px";
  node.style.opacity = "0";
  node.style.overflow = "hidden";
  node.style.pointerEvents = "none";
  node.style.transform = COLLAPSED_TRANSFORM;
  node.style.transition = "none";
  node.style.visibility = "hidden";
}

export function useCollapsibleTransition(isExpanded: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(isExpanded);
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isExpanded) {
      setShouldRender(true);
    }
  }, [isExpanded]);

  useLayoutEffect(() => {
    const node = ref.current;

    if (isInitialRender.current) {
      isInitialRender.current = false;

      if (!node) {
        return;
      }

      if (isExpanded) {
        applyExpandedStyles(node);
      } else {
        applyCollapsedStyles(node);
      }
      return;
    }

    if (!node || !shouldRender) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      if (isExpanded) {
        applyExpandedStyles(node);
      } else {
        applyCollapsedStyles(node);
        setShouldRender(false);
      }
      return;
    }

    let frameId = 0;
    const startHeight = node.getBoundingClientRect().height;

    node.style.pointerEvents = "none";
    node.style.transition = "none";
    node.style.visibility = "visible";
    node.style.height = `${startHeight}px`;
    node.style.overflow = "hidden";

    if (isExpanded) {
      node.style.opacity = "0";
      node.style.transform = COLLAPSED_TRANSFORM;
    } else {
      node.style.opacity = "1";
      node.style.transform = "translateY(0)";
    }

    node.getBoundingClientRect();

    const targetHeight = isExpanded ? node.scrollHeight : 0;
    frameId = window.requestAnimationFrame(() => {
      node.style.transition = COLLAPSE_TRANSITION;
      node.style.height = `${targetHeight}px`;
      node.style.opacity = isExpanded ? "1" : "0";
      node.style.transform = isExpanded ? "translateY(0)" : COLLAPSED_TRANSFORM;
    });

    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== node || event.propertyName !== "height") {
        return;
      }

      if (isExpanded) {
        applyExpandedStyles(node);
      } else {
        applyCollapsedStyles(node);
        setShouldRender(false);
      }
    };

    node.addEventListener("transitionend", handleTransitionEnd);

    return () => {
      window.cancelAnimationFrame(frameId);
      node.removeEventListener("transitionend", handleTransitionEnd);
    };
  }, [isExpanded, shouldRender]);

  return {
    ref,
    shouldRender,
  };
}
