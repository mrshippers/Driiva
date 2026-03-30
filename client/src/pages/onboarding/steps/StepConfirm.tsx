import { motion } from 'framer-motion';
import { Car, Check, Loader2, ChevronRight } from 'lucide-react';
import type { OnboardingStepProps } from '../types';

interface StepConfirmProps extends OnboardingStepProps {
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  isLoading: boolean;
  handleComplete: () => void;
}

export function StepConfirm({
  prevStep,
  confirmed,
  setConfirmed,
  isLoading,
  handleComplete,
}: StepConfirmProps) {
  return (
    <motion.div
      key="step10"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
        <Car className="w-12 h-12 text-purple-400" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">Drive to Earn Rewards</h1>
      <p className="text-white/60 mb-6 max-w-sm mx-auto">
        Every trip you take builds your safety score. The safer you drive, the more you earn.
      </p>

      {/* How it works summary */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 mb-6 text-left">
        <h3 className="text-white font-medium mb-4">Here's what happens:</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-400 text-xs font-bold">1</span>
            </div>
            <p className="text-white/70 text-sm">
              <strong className="text-white">Start a trip</strong> – We track speed, braking, and acceleration
            </p>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-400 text-xs font-bold">2</span>
            </div>
            <p className="text-white/70 text-sm">
              <strong className="text-white">Get scored</strong> – Each trip adds to your overall safety score
            </p>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-purple-400 text-xs font-bold">3</span>
            </div>
            <p className="text-white/70 text-sm">
              <strong className="text-white">Earn refunds</strong> – Higher scores mean bigger refunds at renewal
            </p>
          </li>
        </ul>
      </div>

      {/* Confirmation checkbox */}
      <label className="flex items-start gap-3 cursor-pointer mb-6 text-left bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="relative mt-0.5">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="sr-only"
          />
          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
            confirmed
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-white/30 bg-transparent hover:border-white/50'
          }`}>
            {confirmed && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
        <span className="text-white/80 text-sm">
          I understand that Driiva tracks my driving to calculate my safety score, and that safe driving earns me refunds from the community pool.
        </span>
      </label>

      {/* Navigation buttons */}
      <div className="flex gap-3">
        <button
          onClick={prevStep}
          className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-xl transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleComplete}
          disabled={!confirmed || isLoading}
          className={`flex-1 font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 ${
            confirmed && !isLoading
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Let's Go!
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
