import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { checkBiometricSupport, checkHasPasskey, registerBiometricCredential } from '@/lib/webauthn';

interface StepCelebrationProps {
  onContinue: () => void;
  userName?: string;
  userEmail?: string;
}

export function StepCelebration({ onContinue, userName, userEmail }: StepCelebrationProps) {
  const [showContent, setShowContent] = useState(false);
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [passkeyDone, setPasskeyDone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowContent(true), 200);
    const t2 = setTimeout(async () => {
      if (!userEmail) {
        onContinue(); return;
      }
      const support = await checkBiometricSupport();
      if (support.supported && support.platformAuthenticator) {
        const already = await checkHasPasskey(userEmail);
        if (!already) {
          setPasskeySupported(true);
          setShowPasskeyPrompt(true);
          return;
        }
      }
      onContinue();
    }, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onContinue, userEmail]);

  const handleSetupPasskey = async () => {
    if (!userEmail || isRegistering) return;
    setIsRegistering(true);
    try {
      const result = await registerBiometricCredential(userEmail);
      if (result.success) {
        setPasskeyDone(true);
        setTimeout(onContinue, 1500);
      } else {
        onContinue();
      }
    } catch {
      onContinue();
    }
  };

  // Suppress unused variable warning — passkeySupported is set for future use
  void passkeySupported;

  return (
    <motion.div
      key="step11"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center text-center min-h-[60vh]"
      onClick={onContinue}
    >
      {/* Animated ring */}
      <motion.div
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
        className="relative mb-8"
      >
        <svg width="120" height="120" viewBox="0 0 120 120" className="drop-shadow-lg">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <motion.circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke="url(#celebGrad)"
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
          <defs>
            <linearGradient id="celebGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
        </svg>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.6 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Check className="w-12 h-12 text-emerald-400" />
        </motion.div>
      </motion.div>

      {showContent && !showPasskeyPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-3"
        >
          <h1 className="text-3xl font-bold text-white">You're all set!</h1>
          <p className="text-white/60 max-w-xs">
            {userName ? `${userName.split(' ')[0]}, your` : 'Your'} dashboard is ready.
            Start driving to earn your first score.
          </p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.6, 1] }}
            transition={{ delay: 0.8, duration: 1.5 }}
            className="flex items-center gap-2 mt-4 text-emerald-400"
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium">Loading your dashboard...</span>
          </motion.div>
        </motion.div>
      )}

      {/* Optional passkey enrollment prompt */}
      {showPasskeyPrompt && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="w-full max-w-xs space-y-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center mb-1">
              <ShieldCheck className="w-7 h-7 text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white">
              {passkeyDone ? 'Passkey enabled!' : 'Enable Face ID / Touch ID?'}
            </h2>
            <p className="text-white/60 text-sm max-w-[240px]">
              {passkeyDone
                ? 'Next time you sign in, use your face or fingerprint — no password needed.'
                : 'Sign in instantly next time with your face or fingerprint. You can skip this and set it up later in Settings.'}
            </p>
          </div>

          {!passkeyDone && (
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSetupPasskey}
                disabled={isRegistering}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {isRegistering ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
                {isRegistering ? 'Setting up\u2026' : 'Enable passkey'}
              </button>
              <button
                onClick={() => onContinue()}
                className="w-full py-3 rounded-xl text-white/50 hover:text-white/70 text-sm transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}

          {passkeyDone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 text-emerald-400"
            >
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">Taking you to your dashboard\u2026</span>
            </motion.div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
