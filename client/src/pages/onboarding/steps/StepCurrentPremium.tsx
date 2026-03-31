import { motion } from 'framer-motion';
import { Wallet, ChevronRight } from 'lucide-react';
import type { OnboardingStepProps } from '../types';

interface StepCurrentPremiumProps extends OnboardingStepProps {
  currentPremiumPounds: string;
  setCurrentPremiumPounds: (value: string) => void;
}

export function StepCurrentPremium({
  nextStep,
  prevStep,
  currentPremiumPounds,
  setCurrentPremiumPounds,
}: StepCurrentPremiumProps) {
  return (
    <motion.div
      key="step9"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
        <Wallet className="w-12 h-12 text-emerald-400" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">What's your current premium?</h1>
      <p className="text-white/60 mb-8 max-w-sm mx-auto">
        We'll show you how much you could save with Driiva.
      </p>

      <div className="mb-4 relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">&pound;</span>
        <input
          type="number"
          value={currentPremiumPounds}
          onChange={(e) => setCurrentPremiumPounds(e.target.value)}
          placeholder="e.g. 1200"
          min="0"
          className="w-full pl-8 pr-4 py-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/60 focus:bg-white/10 transition-all text-sm"
        />
      </div>

      <button
        onClick={nextStep}
        className="w-full mb-8 py-2 text-sm text-white/40 hover:text-white/60 transition-colors"
      >
        I don't know / Skip
      </button>

      <div className="flex gap-3">
        <button
          onClick={prevStep}
          className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-xl transition-colors"
        >
          Back
        </button>
        <button
          onClick={nextStep}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          Continue
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
