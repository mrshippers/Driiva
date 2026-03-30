import { motion } from 'framer-motion';
import { Shield, ChevronRight } from 'lucide-react';
import type { OnboardingStepProps } from '../types';

interface StepCurrentInsurerProps extends OnboardingStepProps {
  currentInsurer: string;
  setCurrentInsurer: (value: string) => void;
}

export function StepCurrentInsurer({
  nextStep,
  prevStep,
  currentInsurer,
  setCurrentInsurer,
}: StepCurrentInsurerProps) {
  return (
    <motion.div
      key="step8"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
        <Shield className="w-12 h-12 text-amber-400" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">Who insures you now?</h1>
      <p className="text-white/60 mb-8 max-w-sm mx-auto">
        Your current insurer helps us compare your savings.
      </p>

      <div className="mb-4">
        <input
          type="text"
          value={currentInsurer}
          onChange={(e) => setCurrentInsurer(e.target.value)}
          placeholder="e.g. Admiral, Aviva, Direct Line..."
          className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/60 focus:bg-white/10 transition-all text-sm"
        />
      </div>

      <button
        onClick={() => { setCurrentInsurer('none'); nextStep(); }}
        className="w-full mb-8 py-2 text-sm text-white/40 hover:text-white/60 transition-colors"
      >
        I don't have insurance / Skip
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
