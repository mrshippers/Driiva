import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft, Car, TrendingUp, Users, Trophy, Play, Loader2 } from "lucide-react";
import signinLogo from "@/assets/driiva-logo-CLEAR-FINAL.png";
import { calculateAnnualPremium, DEMO_PRICING_INPUTS } from "@/lib/pricingEngine";

/**
 * DEMO PAGE
 * ---------
 * This page activates demo mode and navigates to the dashboard.
 * It does NOT call Firebase Auth at all - completely isolated demo experience.
 * 
 * UI matches the signin/signup design system with glassmorphic cards.
 */

// Demo user data — premium is computed deterministically from the pricing engine.
// Same inputs always produce the same price (age 28, 2022 VW Golf, 2yr NCB, London E1, score 82).
const DEMO_ANNUAL_PREMIUM = calculateAnnualPremium(DEMO_PRICING_INPUTS);

const DEMO_USER_DATA = {
  id: 'demo-user-1',
  email: 'demo@driiva.co.uk',
  name: 'Demo Driver',
  drivingScore: 82,
  premiumAmount: DEMO_ANNUAL_PREMIUM,
  totalMiles: 1247,
  projectedRefund: Math.round(DEMO_ANNUAL_PREMIUM * 0.042 * 100) / 100,
  trips: [
    { id: 1, from: 'Home', to: 'Office', score: 92, distance: 12.4, date: '2026-02-04' },
    { id: 2, from: 'Office', to: 'Grocery', score: 88, distance: 3.2, date: '2026-02-03' },
    { id: 3, from: 'Grocery', to: 'Home', score: 95, distance: 4.1, date: '2026-02-02' }
  ],
  poolTotal: 105000,
  poolShare: Math.round(DEMO_ANNUAL_PREMIUM * 0.042 * 100) / 100,
  safetyFactor: 0.85,
  // Profile inputs for pricing engine (stored in sessionStorage for checkout preview)
  vehicle: { make: 'Volkswagen', model: 'Golf', year: DEMO_PRICING_INPUTS.vehicleYear },
  age: DEMO_PRICING_INPUTS.age,
  noClaimsYears: DEMO_PRICING_INPUTS.noClaimsYears,
  postcode: DEMO_PRICING_INPUTS.postcode,
};

const features = [
  {
    icon: Car,
    title: 'Trip Tracking',
    description: 'Real-time monitoring of your driving habits',
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
  },
  {
    icon: TrendingUp,
    title: 'Driving Score',
    description: 'Get scored on safety and efficiency',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
  },
  {
    icon: Users,
    title: 'Community Pool',
    description: 'Share rewards with safe drivers',
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
  },
  {
    icon: Trophy,
    title: 'Earn Rewards',
    description: 'Get refunds for safe driving',
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
  },
];

export default function Demo() {
  const [, setLocation] = useLocation();
  const [isEntering, setIsEntering] = useState(false);

  /**
   * Enter demo mode - NO Firebase calls here!
   * Sets localStorage flags and navigates to dashboard.
   * Uses requestAnimationFrame for minimal delay (just enough for button feedback).
   */
  const enterDemoMode = () => {
    setIsEntering(true);
    
    // Set demo mode flags in localStorage
    sessionStorage.setItem('driiva-demo-mode', 'true');
    sessionStorage.setItem('driiva-demo-user', JSON.stringify(DEMO_USER_DATA));
    
    // Navigate next frame — instant feel while allowing button animation
    requestAnimationFrame(() => {
      setLocation('/dashboard');
    });
  };

  return (
    <div className="min-h-screen pt-safe text-white relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex items-center justify-center px-5 py-12">
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          onClick={() => setLocation('/')}
          className="absolute top-6 left-4 z-20 flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-200"
          aria-label="Back to welcome"
        >
          <ArrowLeft className="w-5 h-5 text-white/90" />
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            delay: 0.2,
          }}
          className="w-full max-w-sm"
        >
          <div className="dashboard-glass-card w-full px-5 py-6">
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                  delay: 0.4,
                }}
                className="flex flex-col items-center mb-5"
              >
                <img
                  src={signinLogo}
                  alt="Driiva"
                  className="h-10 w-auto mb-2"
                />
                <h1 className="text-xl font-bold text-white mb-1">Try Driiva Demo</h1>
                <p className="text-center text-white/70 text-sm">
                  Experience the app with sample data
                </p>
                <div className="mt-3 px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  No Account Required
                </div>
              </motion.div>

              {/* Feature List */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-3 mb-6"
              >
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10"
                    >
                      <div className={`w-10 h-10 ${feature.bg} rounded-lg flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${feature.color}`} />
                      </div>
                      <div>
                        <h3 className="font-medium text-white text-sm">{feature.title}</h3>
                        <p className="text-xs text-white/60">{feature.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="space-y-3"
              >
                <button
                  onClick={enterDemoMode}
                  disabled={isEntering}
                  className="hero-cta-primary hero-cta-blue w-full"
                  style={{ maxWidth: '100%' }}
                  aria-label="Enter demo mode"
                >
                  {isEntering ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Entering Demo...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Play className="w-5 h-5" />
                      <span>Enter Demo Mode</span>
                    </div>
                  )}
                </button>

                {/* Links */}
                <div className="text-center space-y-2 pt-2">
                  <p className="text-white/50 text-sm">
                    Ready to join?{" "}
                    <button
                      type="button"
                      onClick={() => setLocation('/signup')}
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Create account
                    </button>
                  </p>
                  <button
                    type="button"
                    onClick={() => setLocation('/signin')}
                    className="text-cyan-400 hover:text-cyan-300 font-medium text-sm"
                  >
                    Sign in
                  </button>
                </div>
              </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
