/**
 * Pull-to-refresh hook for mobile-native feel.
 * Returns touch handlers and state for a pull-to-refresh indicator.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { haptic } from './useHaptics';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;    // px to pull before triggering (default 80)
  maxPull?: number;      // max px the indicator can travel (default 120)
  resistance?: number;   // drag resistance factor (default 2.5)
  disabled?: boolean;
}

interface PullToRefreshState {
  pulling: boolean;
  refreshing: boolean;
  pullDistance: number;
  progress: number;      // 0..1, reaches 1 at threshold
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
  resistance = 2.5,
  disabled = false,
}: PullToRefreshOptions) {
  const [state, setState] = useState<PullToRefreshState>({
    pulling: false,
    refreshing: false,
    pullDistance: 0,
    progress: 0,
  });

  const startY = useRef(0);
  const currentY = useRef(0);
  const triggered = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || state.refreshing) return;
    // Only activate if scrolled to top
    const scrollTop = containerRef.current?.scrollTop ?? window.scrollY;
    if (scrollTop > 5) return;

    startY.current = e.touches[0].clientY;
    currentY.current = startY.current;
    triggered.current = false;
    setState(s => ({ ...s, pulling: true }));
  }, [disabled, state.refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!state.pulling || disabled || state.refreshing) return;
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    if (delta < 0) {
      setState(s => ({ ...s, pullDistance: 0, progress: 0 }));
      return;
    }

    const adjusted = Math.min(delta / resistance, maxPull);
    const progress = Math.min(adjusted / threshold, 1);

    // Haptic at threshold crossing
    if (progress >= 1 && !triggered.current) {
      triggered.current = true;
      haptic('medium');
    } else if (progress < 1 && triggered.current) {
      triggered.current = false;
    }

    setState(s => ({ ...s, pullDistance: adjusted, progress }));
  }, [state.pulling, disabled, state.refreshing, resistance, maxPull, threshold]);

  const onTouchEnd = useCallback(async () => {
    if (!state.pulling || disabled) return;

    if (state.progress >= 1 && !state.refreshing) {
      setState(s => ({ ...s, pulling: false, refreshing: true, pullDistance: 48 }));
      haptic('success');
      try {
        await onRefresh();
      } finally {
        setState({ pulling: false, refreshing: false, pullDistance: 0, progress: 0 });
      }
    } else {
      setState({ pulling: false, refreshing: false, pullDistance: 0, progress: 0 });
    }
  }, [state.pulling, state.progress, state.refreshing, disabled, onRefresh]);

  return {
    ...state,
    containerRef,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
