import { motion } from 'framer-motion';
import { Users, ChevronRight } from 'lucide-react';
import type { OnboardingStepProps } from '../types';

interface StepReferralSourceProps extends OnboardingStepProps {
  referralSource: string;
  setReferralSource: (value: string) => void;
}

export function StepReferralSource({
  nextStep,
  prevStep,
  referralSource,
  setReferralSource,
}: StepReferralSourceProps) {
  return (
    <motion.div
      key="step7"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center">
        <Users className="w-12 h-12 text-pink-400" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">How did you find us?</h1>
      <p className="text-white/60 mb-8 max-w-sm mx-auto">
        We'd love to know how you heard about Driiva.
      </p>

      <div className="grid grid-cols-1 gap-3 mb-8">
        {['Social media', 'Friend or family', 'Search engine', 'Comparison site', 'Other'].map((option) => (
          <button
            key={option}
            onClick={() => setReferralSource(option)}
            className={`w-full py-3.5 px-4 rounded-xl text-sm font-medium text-left transition-all border ${
              referralSource === option
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

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
          {referralSource ? 'Continue' : 'Skip'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
