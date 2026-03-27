/**
 * Pull-to-refresh visual indicator component.
 * Renders a spinning indicator that appears during pull gesture.
 */
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  progress: number;
  refreshing: boolean;
}

export function PullToRefreshIndicator({ pullDistance, progress, refreshing }: PullToRefreshIndicatorProps) {
  if (pullDistance <= 0 && !refreshing) return null;

  return (
    <motion.div
      className="flex items-center justify-center overflow-hidden"
      animate={{ height: pullDistance }}
      transition={refreshing ? { type: 'spring', stiffness: 300, damping: 30 } : { duration: 0 }}
    >
      <motion.div
        className="flex items-center justify-center"
        animate={{
          scale: refreshing ? 1 : Math.min(progress, 1),
          opacity: refreshing ? 1 : Math.min(progress * 1.5, 1),
          rotate: refreshing ? 360 : progress * 270,
        }}
        transition={
          refreshing
            ? { rotate: { duration: 0.8, repeat: Infinity, ease: 'linear' } }
            : { duration: 0 }
        }
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          progress >= 1 || refreshing
            ? 'bg-emerald-500/20 border border-emerald-500/40'
            : 'bg-white/10 border border-white/20'
        }`}>
          {refreshing ? (
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          ) : (
            <motion.svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              className={progress >= 1 ? 'text-emerald-400' : 'text-white/50'}
            >
              <motion.path
                d="M8 2v8M4 6l4-4 4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ rotate: progress >= 1 ? 180 : 0 }}
                style={{ transformOrigin: '50% 50%' }}
              />
            </motion.svg>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
