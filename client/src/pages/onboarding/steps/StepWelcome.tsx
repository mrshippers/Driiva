import { motion } from 'framer-motion';
import { Shield, Wallet, Users, ChevronRight } from 'lucide-react';
import driivaLogo from '@/assets/driiva-logo-CLEAR-FINAL.png';
import { FinancialPromotionDisclaimer } from '@/components/FinancialPromotionDisclaimer';

interface StepWelcomeProps {
  nextStep: () => void;
}

export function StepWelcome({ nextStep }: StepWelcomeProps) {
  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      {/* Logo */}
      <div className="w-48 h-20 mx-auto mb-6 overflow-hidden">
        <img
          src={driivaLogo}
          alt="Driiva"
          className="w-full h-full object-contain"
        />
      </div>

      <h1 className="text-3xl font-bold text-white mb-3">Welcome to Driiva</h1>
      <p className="text-white/60 mb-8 max-w-sm mx-auto">
        The insurance app that rewards safe driving. Here's how it works:
      </p>

      {/* Feature cards */}
      <div className="space-y-3 mb-8">
        <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-xl text-left">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-medium">AI-Powered Safety</h3>
            <p className="text-white/50 text-sm">Track trips and get a real-time safety score</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-xl text-left">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-medium">Earn Refunds</h3>
            <p className="text-white/50 text-sm">Safe drivers can earn back a portion of their premium at renewal</p>
            <FinancialPromotionDisclaimer className="mt-1" />
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-xl text-left">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-white font-medium">Community Pool</h3>
            <p className="text-white/50 text-sm">Join thousands of drivers sharing rewards</p>
          </div>
        </div>
      </div>

      <button
        onClick={nextStep}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        Continue
        <ChevronRight className="w-5 h-5" />
      </button>
    </motion.div>
  );
}
