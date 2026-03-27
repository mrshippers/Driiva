/**
 * Shimmer skeleton loading component.
 * Replaces basic animate-pulse with a premium sliding shimmer effect.
 */
import { motion } from 'framer-motion';

interface ShimmerProps {
  className?: string;
  /** Rounded variant: 'sm' | 'md' | 'lg' | 'full' | 'xl' */
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Repeat count for list-style skeletons */
  count?: number;
}

function ShimmerBlock({ className = '', rounded = 'md' }: Omit<ShimmerProps, 'count'>) {
  const radiusMap = {
    sm: 'rounded-sm',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    full: 'rounded-full',
  };

  return (
    <div
      className={`relative overflow-hidden bg-white/[0.06] ${radiusMap[rounded]} ${className}`}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.06) 60%, transparent 100%)',
        }}
        animate={{ x: ['-100%', '200%'] }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          repeatDelay: 0.8,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}

export function Shimmer({ className = '', rounded = 'md', count }: ShimmerProps) {
  if (count && count > 1) {
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <ShimmerBlock key={i} className={className} rounded={rounded} />
        ))}
      </>
    );
  }
  return <ShimmerBlock className={className} rounded={rounded} />;
}

/** Pre-built skeleton patterns for common card layouts */
export function ScoreCardShimmer() {
  return (
    <div className="dashboard-glass-card mb-4 space-y-4">
      <div className="flex items-center justify-between">
        <Shimmer className="h-6 w-32" />
        <Shimmer className="h-5 w-5" rounded="full" />
      </div>
      <div className="flex justify-center">
        <Shimmer className="h-[140px] w-[140px]" rounded="full" />
      </div>
      <Shimmer className="h-4 w-3/4 mx-auto" />
    </div>
  );
}

export function TripCardShimmer() {
  return (
    <div className="dashboard-glass-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Shimmer className="w-10 h-10" rounded="lg" />
          <div className="space-y-2">
            <Shimmer className="h-4 w-32" />
            <Shimmer className="h-3 w-24" />
          </div>
        </div>
        <div className="space-y-1">
          <Shimmer className="h-6 w-8 ml-auto" />
          <Shimmer className="h-3 w-12" />
        </div>
      </div>
      <div className="pt-3 border-t border-white/5 grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Shimmer className="h-3 w-12" />
            <Shimmer className="h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatShimmer() {
  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 text-center space-y-2">
      <Shimmer className="h-7 w-12 mx-auto" />
      <Shimmer className="h-3 w-16 mx-auto" />
    </div>
  );
}
