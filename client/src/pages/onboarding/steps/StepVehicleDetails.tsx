import { motion } from 'framer-motion';
import { Car, ChevronRight } from 'lucide-react';
import type { OnboardingStepProps } from '../types';

interface StepVehicleDetailsProps extends OnboardingStepProps {
  vehicleMake: string;
  setVehicleMake: (value: string) => void;
  vehicleModel: string;
  setVehicleModel: (value: string) => void;
  vehicleYear: string;
  setVehicleYear: (value: string) => void;
}

export function StepVehicleDetails({
  nextStep,
  prevStep,
  vehicleMake,
  setVehicleMake,
  vehicleModel,
  setVehicleModel,
  vehicleYear,
  setVehicleYear,
}: StepVehicleDetailsProps) {
  return (
    <motion.div
      key="step6"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
        <Car className="w-12 h-12 text-orange-400" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">Your Vehicle</h1>
      <p className="text-white/60 mb-8 max-w-sm mx-auto">
        Vehicle details help us give you a more accurate quote.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="text-white/60 text-xs font-medium text-left block mb-1.5 pl-1">Make</label>
          <input
            type="text"
            value={vehicleMake}
            onChange={(e) => setVehicleMake(e.target.value)}
            placeholder="e.g. Volkswagen"
            className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-orange-400/60 focus:bg-white/10 transition-all text-sm"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs font-medium text-left block mb-1.5 pl-1">Model</label>
          <input
            type="text"
            value={vehicleModel}
            onChange={(e) => setVehicleModel(e.target.value)}
            placeholder="e.g. Golf"
            className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-orange-400/60 focus:bg-white/10 transition-all text-sm"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs font-medium text-left block mb-1.5 pl-1">Year</label>
          <input
            type="number"
            value={vehicleYear}
            onChange={(e) => setVehicleYear(e.target.value)}
            placeholder="e.g. 2021"
            min="1990"
            max="2027"
            className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-orange-400/60 focus:bg-white/10 transition-all text-sm"
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
          {vehicleMake || vehicleModel || vehicleYear ? 'Continue' : 'Skip'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
