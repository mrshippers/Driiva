/**
 * Collapsible scroll header component (iOS large title pattern).
 * Shows a large title that shrinks into a compact bar on scroll.
 */
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface ScrollHeaderProps {
  /** Large title text */
  title: string;
  /** Subtitle below the title */
  subtitle?: string;
  /** 0 = expanded, 1 = collapsed */
  progress: number;
  /** Right-side actions (buttons, avatar, etc.) */
  actions?: ReactNode;
  /** Left-side element (logo, back button) */
  leading?: ReactNode;
  /** Children rendered below the header */
  children?: ReactNode;
}

export function ScrollHeader({
  title,
  subtitle,
  progress,
  actions,
  leading,
}: ScrollHeaderProps) {
  const isCollapsed = progress > 0.5;

  return (
    <div className="sticky top-0 z-30 -mx-4 px-4" style={{ willChange: 'transform' }}>
      {/* Compact bar background — fades in on scroll */}
      <motion.div
        className="absolute inset-0 border-b border-white/[0.06]"
        style={{
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
        animate={{ opacity: progress }}
        transition={{ duration: 0 }}
      />

      <div className="relative flex items-center justify-between py-3">
        {/* Leading (logo / back button) */}
        <div className="flex items-center gap-3">
          {leading}

          {/* Compact title — slides in as large title fades out */}
          <motion.span
            className="text-base font-semibold text-white"
            animate={{
              opacity: isCollapsed ? 1 : 0,
              x: isCollapsed ? 0 : -10,
            }}
            transition={{ duration: 0.15 }}
          >
            {title}
          </motion.span>
        </div>

        {/* Right actions */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Large title section — collapses away */}
      <motion.div
        animate={{
          height: isCollapsed ? 0 : 'auto',
          opacity: isCollapsed ? 0 : 1,
          marginBottom: isCollapsed ? 0 : 16,
        }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden"
      >
        <h1 className="text-[28px] font-bold text-white tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>
        )}
      </motion.div>
    </div>
  );
}
