import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { BarChart3, Wallet, Trophy, ChevronRight } from "lucide-react";
import driivaLogo from '@/assets/driiva-logo-CLEAR-FINAL.png';
import { useAuth } from '@/contexts/AuthContext';

const features = [
  { icon: BarChart3, title: "Track Your Driving", description: "Real-time feedback on every trip" },
  { icon: Wallet, title: "Earn Refunds", description: "Safe driving = money back at renewal" },
  { icon: Trophy, title: "Unlock Rewards", description: "Achievements, streaks, and community challenges" },
];

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [currentCard, setCurrentCard] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const [returningUser] = useState<{ name: string; email: string } | null>(() => {
    try {
      const raw = localStorage.getItem('driiva-last-user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  // Auto-redirect authenticated users who have completed onboarding
  useEffect(() => {
    if (!authLoading && user?.onboardingComplete) {
      setLocation('/dashboard');
    }
  }, [authLoading, user, setLocation]);

  // Navigate to the demo page - demo mode is activated there, NOT here
  const goToDemo = () => {
    setLocation('/demo');
  };

  const handleContinueAs = () => {
    if (user?.onboardingComplete) {
      setLocation('/dashboard');
    } else {
      setLocation('/signin');
    }
  };

  const handleNext = useCallback(() => {
    setCurrentCard((prev) => (prev + 1) % features.length);
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentCard((prev) => (prev - 1 + features.length) % features.length);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    setTouchStart(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev]);

  useEffect(() => {
    const interval = setInterval(handleNext, 5000);
    return () => clearInterval(interval);
  }, [handleNext]);

  const CurrentIcon = features[currentCard].icon;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Floating orbs – behind content, on top of gradient background */}
      <div className="hero-orb-container hero-orb-container-welcome" aria-hidden>
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>
      <div className="relative z-10 max-w-md mx-auto px-4 pt-16 min-h-screen flex flex-col text-white">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col items-center w-full"
        >
          <div className="w-full max-w-[400px] h-24 overflow-hidden flex items-center justify-center self-center shrink-0">
            <img 
              src={driivaLogo} 
              alt="Driiva" 
              className="max-w-full max-h-full w-auto h-auto object-contain object-center scale-[1.4] origin-center border-0 border-none overflow-visible"
              style={{ imageRendering: '-webkit-optimize-contrast', borderImage: 'none' }}
            />
          </div>
          <div 
            className="flex flex-col items-center justify-center -mt-1 text-center box-content tracking-normal leading-5 w-full"
            style={{ verticalAlign: 'middle' }}
          >
            <p className="text-white text-base font-semibold mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              AI-<span className="text-white/60">powered</span>. Community-driven.
            </p>
            <p className="text-white text-sm font-medium leading-5" style={{ fontFamily: 'Inter, sans-serif' }}>Your driving, <em>rewarded.</em></p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col items-center mt-12"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="region"
          aria-label="Feature carousel"
        >
          <div 
            className="welcome-card-new max-w-md backdrop-blur-sm bg-black/20 border border-white/10 rounded-3xl" 
            style={{ boxShadow: '0 0 60px rgba(139, 92, 246, 0.15), 0 0 120px rgba(236, 72, 153, 0.08)' }}
            aria-live="polite"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentCard}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="welcome-card-content"
              >
                <CurrentIcon className="welcome-card-icon" />
                <h3 className="welcome-card-title">{features[currentCard].title}</h3>
                <p className="welcome-card-desc">{features[currentCard].description}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-center gap-1 mt-4">
            <button
              onClick={handlePrev}
              className="text-white/30 hover:text-white/60 transition-colors"
              aria-label="Previous slide"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            
            <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 100 120"
                fill="white"
                className="w-full h-full select-none"
                aria-hidden="true"
              >
                <polygon points="25,120 45,0 70,0 58,52 68,52 80,0 100,0 75,120 55,120 65,62 55,62 45,120" />
              </svg>
            </div>
            
            <button
              onClick={handleNext}
              className="text-white/30 hover:text-white/60 transition-colors"
              aria-label="Next slide"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col items-center gap-3 pb-20 mt-6"
        >
          {returningUser && (
            <button
              onClick={handleContinueAs}
              className="w-full max-w-[280px] flex items-center justify-between gap-3 px-5 py-3 rounded-2xl text-sm font-medium transition-all duration-200 mb-1"
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: 'rgba(255, 255, 255, 0.95)',
              }}
              aria-label={`Continue as ${returningUser.name}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{returningUser.name.charAt(0).toUpperCase()}</span>
                </div>
                <span>Continue as {returningUser.name.split(' ')[0]}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-400" />
            </button>
          )}

          <button
            onClick={() => setLocation('/signup')}
            className="hero-cta-primary hero-cta-green"
            aria-label="Get Started"
          >
            Get Started
          </button>

          <button
            onClick={goToDemo}
            className="hero-cta-primary hero-cta-blue"
            aria-label="Test Driiva"
          >
            Test Driiva
          </button>

          <button
            onClick={() => setLocation('/signin')}
            className="hero-cta-tertiary"
            aria-label="Sign in to existing account"
          >
            Sign In
          </button>
        </motion.div>
      </div>

      {/* Fixed Footer Navigation */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 pb-safe border-0 border-none shadow-none outline-none bg-transparent">
        <div className="relative flex items-center justify-center gap-2 py-2.5 px-4">
          <button 
            onClick={() => setLocation('/privacy')} 
            className="text-white/60 hover:text-white text-xs transition"
          >
            Policy
          </button>
          <span className="text-white/20">|</span>
          <button 
            onClick={() => setLocation('/support')} 
            className="text-white/60 hover:text-white text-xs transition"
          >
            FAQs
          </button>
          <span className="text-white/20">|</span>
          <button 
            onClick={() => setLocation('/terms')} 
            className="text-white/60 hover:text-white text-xs transition"
          >
            Terms
          </button>
          <span 
            className="absolute right-3 bottom-1 text-white/35 text-[10px] italic"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            driiva © 2026
          </span>
        </div>
      </footer>
    </div>
  );
}
