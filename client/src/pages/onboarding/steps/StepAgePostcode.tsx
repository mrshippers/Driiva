import { motion } from 'framer-motion';
import { UserRound, ChevronRight } from 'lucide-react';
import type { OnboardingStepProps } from '../types';

interface StepAgePostcodeProps extends OnboardingStepProps {
  age: string;
  setAge: (value: string) => void;
  postcode: string;
  setPostcode: (value: string) => void;
}

export function StepAgePostcode({
  nextStep,
  prevStep,
  age,
  setAge,
  postcode,
  setPostcode,
}: StepAgePostcodeProps) {
  return (
    <motion.div
      key="step5"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
        <UserRound className="w-12 h-12 text-cyan-400" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">About You</h1>
      <p className="text-white/60 mb-8 max-w-sm mx-auto">
        Your age and postcode help us tailor your premium estimate.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="text-white/60 text-xs font-medium text-left block mb-1.5 pl-1">Age</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 25"
            min="17"
            max="99"
            className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/60 focus:bg-white/10 transition-all text-sm"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs font-medium text-left block mb-1.5 pl-1">Postcode</label>
          <input
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder="e.g. SW1A 1AA"
            maxLength={8}
            className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-cyan-400/60 focus:bg-white/10 transition-all text-sm uppercase"
          />
        </div>
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
          {age || postcode ? 'Continue' : 'Skip'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
