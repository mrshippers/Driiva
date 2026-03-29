import { useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import driivaLogo from '@/assets/driiva-logo-CLEAR-FINAL.png';

const STORAGE_KEY = 'driiva-first-launch-complete';
const TOTAL_DURATION_MS = 3200;

/**
 * Premium first-launch splash screen.
 * Shows only once ever (localStorage). Subsequent visits skip it entirely.
 */
export default function SplashScreen({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      setVisible(false);
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch { /* quota / private browsing */ }
    }, TOTAL_DURATION_MS);

    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <>
      {children}

      <AnimatePresence>
        {visible && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          >
            {/* Gradient background */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(160deg, #1a0a12 0%, #1c0f1e 20%, #0f172a 50%, #1e293b 80%, #1a0a12 100%)',
              }}
            />

            {/* Animated glow rings */}
            <motion.div
              className="absolute"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 0.15, scale: 1.2 }}
              transition={{ duration: 2, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
              style={{
                width: '140vw',
                height: '140vw',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, rgba(236, 72, 153, 0.15) 40%, transparent 70%)',
              }}
            />
            <motion.div
              className="absolute"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.1, scale: 1 }}
              transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.4 }}
              style={{
                width: '100vw',
                height: '100vw',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 60%)',
              }}
            />

            {/* Floating particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                initial={{
                  opacity: 0,
                  x: (i % 2 === 0 ? -1 : 1) * (30 + i * 20),
                  y: 80 + i * 15,
                }}
                animate={{
                  opacity: [0, 0.4, 0],
                  y: -(100 + i * 40),
                }}
                transition={{
                  duration: 2.5,
                  delay: 0.5 + i * 0.2,
                  ease: 'easeOut',
                }}
                style={{
                  width: 3 + i * 1.5,
                  height: 3 + i * 1.5,
                  background:
                    i % 3 === 0
                      ? 'rgba(16, 185, 129, 0.6)'
                      : i % 3 === 1
                        ? 'rgba(139, 92, 246, 0.5)'
                        : 'rgba(59, 130, 246, 0.5)',
                }}
              />
            ))}

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center gap-6">
              {/* Logo with scale-up + glow */}
              <motion.div
                className="relative"
                initial={{ opacity: 0, scale: 0.6, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  duration: 0.8,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.2,
                }}
              >
                {/* Logo glow */}
                <motion.div
                  className="absolute inset-0 blur-3xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  transition={{ duration: 1.2, delay: 0.6 }}
                  style={{
                    background:
                      'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, transparent 70%)',
                    transform: 'scale(2)',
                  }}
                />
                <img
                  src={driivaLogo}
                  alt="Driiva"
                  className="relative w-64 max-w-[75vw] object-contain"
                  style={{ imageRendering: '-webkit-optimize-contrast' }}
                />
              </motion.div>

              {/* Tagline — staggered word reveal */}
              <motion.div
                className="flex flex-col items-center gap-1"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.15, delayChildren: 1.0 } },
                }}
              >
                <motion.p
                  className="text-white/90 text-lg font-medium tracking-wide"
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
                    },
                  }}
                >
                  Your driving, <em className="text-emerald-400 not-italic font-semibold">rewarded</em>.
                </motion.p>
              </motion.div>

              {/* Subtle loading bar */}
              <motion.div
                className="w-12 h-[2px] rounded-full overflow-hidden mt-2"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4, duration: 0.3 }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, #10B981, #3B82F6)',
                  }}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{
                    delay: 1.4,
                    duration: 1.6,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
