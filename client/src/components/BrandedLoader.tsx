import { motion } from 'framer-motion';
import driivaLogo from '@/assets/driiva-logo-CLEAR-FINAL.png';
import gradientBackground from '@/assets/gradient-background.png';

/**
 * Full-screen branded loader shown while auth state is resolving or lazy
 * pages are loading. Uses the same dark gradient + logo treatment as
 * SplashScreen to prevent any white flash during hydration.
 *
 * `data-app-loading` is how this screen tells the visual gates it is up. They
 * knew about skeleton bars and not about this, so a route still loading behind
 * this loader could be measured as though it had rendered: see BUSY_SELECTOR in
 * tests/qa-session.mjs. Keep the attribute if this markup is reworked.
 */
export default function BrandedLoader() {
  return (
    <div
      data-app-loading
      className="fixed inset-0 z-[9998] flex items-center justify-center"
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${gradientBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Ambient orbs */}
      <div className="hero-orb-container" aria-hidden>
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>

      {/* Logo with subtle pulse */}
      <motion.img
        src={driivaLogo}
        alt="Driiva"
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10 w-56 max-w-[70vw] object-contain"
        style={{ imageRendering: '-webkit-optimize-contrast' }}
      />
    </div>
  );
}
