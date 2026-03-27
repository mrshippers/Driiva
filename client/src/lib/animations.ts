export const timing = {
  quick: 0.15,
  interaction: 0.2,
  cardEntrance: 0.35,
  pageTransition: 0.3,
  counter: 1.2,
  loop: 1.5,
  shimmer: 2,
} as const;

export const easing = {
  button: [0.25, 0.1, 0.25, 1] as const,
  elastic: [0.34, 1.56, 0.64, 1] as const,
  smoothDecel: [0.16, 1, 0.3, 1] as const,
  material: [0.4, 0, 0.2, 1] as const,
  /** iOS-style spring approximation */
  iosSpring: [0.25, 0.46, 0.45, 0.94] as const,
} as const;

/** Spring presets for motion components */
export const springs = {
  /** Quick response for taps and selections */
  snappy: { type: 'spring' as const, stiffness: 500, damping: 30 },
  /** Smooth transitions for layout changes */
  smooth: { type: 'spring' as const, stiffness: 300, damping: 30 },
  /** Bouncy for playful elements */
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 15 },
  /** Heavy for modals and sheets */
  heavy: { type: 'spring' as const, stiffness: 200, damping: 25, mass: 1.2 },
  /** Nav indicator */
  nav: { type: 'spring' as const, stiffness: 400, damping: 28 },
};

export const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
};

export const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    }
  }
};

export const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: timing.cardEntrance, ease: easing.smoothDecel }
  }
};

export const microInteractions = {
  tap: { scale: 0.97 },
  hover: { scale: 1.02 },
  hoverSubtle: { scale: 1.01 },
  hoverShift: { x: 4 },
  press: { scale: 0.95 },
  /** Card press for mobile */
  cardPress: { scale: 0.98, y: 1 },
};

export const entranceVariants = {
  fadeUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: timing.cardEntrance, ease: easing.smoothDecel }
  },
  scaleIn: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { duration: timing.cardEntrance, ease: easing.elastic }
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: timing.pageTransition, ease: easing.button }
  },
  slideUp: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: easing.smoothDecel }
  },
};

export const loopAnimations = {
  pulse: {
    animate: { scale: [1, 1.02, 1] },
    transition: { duration: timing.shimmer, repeat: Infinity, ease: "easeInOut" }
  },
  glow: {
    animate: { opacity: [0.5, 1, 0.5] },
    transition: { duration: timing.loop, repeat: Infinity, ease: "easeInOut" }
  },
  shimmer: {
    initial: { x: '-100%' },
    animate: { x: '200%' },
    transition: { duration: timing.shimmer, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }
  },
  breathe: {
    animate: { scale: [1, 1.03, 1], opacity: [0.7, 1, 0.7] },
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
  },
};
