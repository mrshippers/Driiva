/**
 * Scroll-linked collapsible header hook (iOS large title pattern).
 * Tracks scroll position and returns interpolation values for a shrinking header.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface ScrollHeaderOptions {
  /** Distance in px over which the header collapses (default 60) */
  collapseDistance?: number;
}

interface ScrollHeaderState {
  /** 0 = fully expanded, 1 = fully collapsed */
  progress: number;
  /** Current scroll position */
  scrollY: number;
  /** Whether user is scrolling down */
  scrollingDown: boolean;
}

export function useScrollHeader({ collapseDistance = 60 }: ScrollHeaderOptions = {}) {
  const [state, setState] = useState<ScrollHeaderState>({
    progress: 0,
    scrollY: 0,
    scrollingDown: false,
  });
  const lastScrollY = useRef(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const scrollTop = (e.target as HTMLElement).scrollTop;
    const progress = Math.min(scrollTop / collapseDistance, 1);
    const scrollingDown = scrollTop > lastScrollY.current;
    lastScrollY.current = scrollTop;

    setState({ progress, scrollY: scrollTop, scrollingDown });
  }, [collapseDistance]);

  return {
    ...state,
    onScroll,
    // Derived convenience values
    headerOpacity: 1 - state.progress,
    titleScale: 1 - state.progress * 0.15,
    /** Background opacity for the compact header bar */
    barOpacity: state.progress,
  };
}
