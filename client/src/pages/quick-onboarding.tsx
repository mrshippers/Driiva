/**
 * QUICK ONBOARDING PAGE
 * =====================
 * A multi-step onboarding flow that must be completed before accessing the dashboard.
 * 
 * Steps:
 *   1.  Welcome — Explain what Driiva does
 *   2.  Data Consent — GDPR-compliant explicit opt-in for telematics data
 *   3.  Location — Request GPS permission and test a single read
 *   4.  Annual Mileage
 *   5.  Age + Postcode
 *   6.  Vehicle Details (make, model, year)
 *   7.  Referral Source
 *   8.  Current Insurer
 *   9.  Current Premium
 *   10. Confirm — User acknowledges "drive to earn rewards" concept
 *   11. Celebration
 * 
 * On completion, sets `onboardingCompleted: true` in Firestore.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { 
  MapPin, 
  Car, 
  ChevronRight, 
  Check, 
  Loader2, 
  Shield,
  Wallet,
  Users,
  Navigation,
  AlertCircle,
  Sparkles,
  UserRound,
  ShieldCheck,
  X,
} from 'lucide-react';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import driivaLogo from '@/assets/driiva-logo-CLEAR-FINAL.png';
import { FinancialPromotionDisclaimer } from '@/components/FinancialPromotionDisclaimer';
import { checkBiometricSupport, checkHasPasskey, registerBiometricCredential } from '@/lib/webauthn';

const TOTAL_STEPS = 12;

interface GpsTestResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  error?: string;
}

export default function QuickOnboarding() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading, setUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  // GPS state
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [gpsResult, setGpsResult] = useState<GpsTestResult | null>(null);

  // Data consent (GDPR explicit opt-in — step 2)
  const [dataConsentGiven, setDataConsentGiven] = useState(false);

  // Soft onboarding data
  const [annualMileage, setAnnualMileage] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [postcode, setPostcode] = useState<string>('');
  const [vehicleMake, setVehicleMake] = useState<string>('');
  const [vehicleModel, setVehicleModel] = useState<string>('');
  const [vehicleYear, setVehicleYear] = useState<string>('');
  const [noClaimsYears, setNoClaimsYears] = useState<number | null>(null);
  const [referralSource, setReferralSource] = useState<string>('');
  const [currentInsurer, setCurrentInsurer] = useState<string>('');
  const [currentPremiumPounds, setCurrentPremiumPounds] = useState<string>('');

  // Use AuthContext instead of a separate onAuthStateChanged listener.
  // AuthContext already tracks the user and their onboarding status,
  // so we avoid a redundant Firebase + Firestore round-trip.
  useEffect(() => {
    if (authLoading) return; // Wait for AuthContext to resolve

    // Check demo mode
    const isDemoMode = sessionStorage.getItem('driiva-demo-mode') === 'true';
    if (isDemoMode) {
      setLocation('/dashboard');
      return;
    }

    if (!user) {
      // Not logged in, redirect to signin
      setLocation('/signin');
      return;
    }

    // If user already completed onboarding, skip to dashboard
    if (user.onboardingComplete) {
      setLocation('/dashboard');
      return;
    }
    // Otherwise, user needs onboarding — let them through
  }, [user, authLoading, setLocation]);

  /**
   * Persist GDPR data consent to Firestore when user grants it.
   */
  const persistDataConsent = async () => {
    const firebaseUser = auth?.currentUser;
    if (firebaseUser && isFirebaseConfigured && db) {
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          dataConsentGiven: true,
          dataConsentTimestamp: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.error('[QuickOnboarding] Failed to persist data consent:', err);
      }
    }
  };

  /**
   * Test GPS by requesting a single position read
   */
  const testGpsPermission = async () => {
    setGpsStatus('testing');
    setGpsResult(null);

    try {
      // First check if geolocation is available
      if (!navigator.geolocation) {
        setGpsStatus('error');
        setGpsResult({ success: false, error: 'GPS not available on this device' });
        return;
      }

      // Request a single position
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          }
        );
      });

      setGpsStatus('success');
      setGpsResult({
        success: true,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy),
      });
    } catch (error: any) {
      setGpsStatus('error');
      
      let errorMessage = 'Could not get your location';
      if (error.code === 1) {
        errorMessage = 'Location permission denied. Please enable it in your browser settings.';
      } else if (error.code === 2) {
        errorMessage = 'Location unavailable. Please check your device settings.';
      } else if (error.code === 3) {
        errorMessage = 'Location request timed out. Please try again.';
      }
      
      setGpsResult({ success: false, error: errorMessage });
    }
  };

  /**
   * Persist onboarding completion to backend, then advance to celebration step.
   */
  const handleComplete = async () => {
    if (!confirmed) return;

    setIsLoading(true);

    const firebaseUser = auth?.currentUser;
    if (firebaseUser) {
      try {
        const token = await firebaseUser.getIdToken();
        await fetch('/api/profile/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          credentials: 'include',
          body: JSON.stringify({ onboardingComplete: true }),
        });
      } catch (err) {
        console.error('[QuickOnboarding] Failed to update onboarding in PostgreSQL:', err);
      }
    }

    try {
      if (firebaseUser && isFirebaseConfigured && db) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        await setDoc(userDocRef, {
          onboardingCompleted: true,
          onboardingComplete: true,
          gpsPermissionGranted: gpsStatus === 'success',
          dataConsentGiven: dataConsentGiven,
          dataConsentTimestamp: dataConsentGiven ? new Date().toISOString() : null,
          annualMileage: annualMileage || null,
          age: age ? Number(age) : null,
          postcode: postcode ? postcode.trim().toUpperCase() : null,
          vehicle: (vehicleMake || vehicleModel || vehicleYear) ? {
            make: vehicleMake || null,
            model: vehicleModel || null,
            year: vehicleYear ? Number(vehicleYear) : null,
          } : null,
          noClaimsYears: noClaimsYears !== null ? noClaimsYears : null,
          referralSource: referralSource || null,
          currentInsurer: currentInsurer || null,
          currentPremiumPounds: currentPremiumPounds ? Number(currentPremiumPounds) : null,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (err) {
      console.error('[QuickOnboarding] Failed to update Firestore:', err);
    }

    setIsLoading(false);
    nextStep();
  };

  const goToDashboard = useCallback(() => {
    setUser(prev => prev ? { ...prev, onboardingComplete: true } : null);
    setLocation('/dashboard');
  }, [setLocation, setUser]);

  /**
   * Handle navigation between steps
   */
  const nextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Show loading only while AuthContext is resolving (typically instant after signup)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-safe bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 flex flex-col relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
        {/* Progress indicator (hidden on celebration step) */}
        {currentStep < 12 && (
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i + 1 <= currentStep 
                      ? 'bg-emerald-500 w-5' 
                      : 'bg-white/20 w-3.5'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-white/50 flex-shrink-0 ml-3">Step {currentStep} of 11</span>
          </div>
        )}

        {/* Step content */}
        <div className="flex-1 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {/* STEP 1: Welcome / Explain Driiva */}
            {currentStep === 1 && (
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
            )}

            {/* STEP 2: Data Consent (GDPR explicit opt-in) */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                  <Shield className="w-12 h-12 text-indigo-400" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-3">Your Data, Your Control</h1>
                <p className="text-white/60 mb-6 max-w-sm mx-auto">
                  Before we begin, here's exactly what Driiva collects and why.
                </p>

                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 mb-5 text-left">
                  <h3 className="text-white font-medium mb-3 text-sm">What we collect</h3>
                  <ul className="space-y-2.5">
                    {[
                      { label: 'GPS location', detail: 'During active trips only' },
                      { label: 'Accelerometer & gyroscope', detail: 'Braking, acceleration, cornering' },
                      { label: 'Speed & heading', detail: 'Safety scoring & route context' },
                      { label: 'Trip metadata', detail: 'Start/end time, duration, distance' },
                    ].map((item) => (
                      <li key={item.label} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="text-white text-sm">{item.label}</span>
                          <span className="text-white/40 text-sm"> — {item.detail}</span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-indigo-300 font-medium">Retention</div>
                      <div className="text-white/60 text-xs">Raw GPS: 90 days rolling</div>
                      <div className="text-white/60 text-xs">Scores: policy lifetime</div>
                    </div>
                    <div>
                      <div className="text-xs text-indigo-300 font-medium">Who sees it</div>
                      <div className="text-white/60 text-xs">Driiva + underwriting partner</div>
                      <div className="text-white/60 text-xs">Never sold to third parties</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setLocation('/trust')}
                  className="text-indigo-400 hover:text-indigo-300 text-xs font-medium mb-5 block mx-auto"
                >
                  Read full Trust Centre →
                </button>

                <label className="flex items-start gap-3 cursor-pointer mb-6 text-left bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={dataConsentGiven}
                      onChange={(e) => setDataConsentGiven(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                      dataConsentGiven
                        ? 'bg-indigo-500 border-indigo-500'
                        : 'border-white/30 bg-transparent hover:border-white/50'
                    }`}>
                      {dataConsentGiven && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </div>
                  <span className="text-white/80 text-sm">
                    I consent to Driiva collecting my driving data as described above for the purpose of calculating my driving score and insurance pricing.
                  </span>
                </label>

                <div className="flex gap-3">
                  <button
                    onClick={prevStep}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-xl transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => { persistDataConsent(); nextStep(); }}
                    disabled={!dataConsentGiven}
                    className={`flex-1 font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                      dataConsentGiven
                        ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                        : 'bg-white/10 text-white/40 cursor-not-allowed'
                    }`}
                  >
                    Continue
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: GPS Permission Test */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center">
                  <MapPin className="w-12 h-12 text-emerald-400" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-3">Enable Location Access</h1>
                <p className="text-white/60 mb-8 max-w-sm mx-auto">
                  Driiva uses GPS to track your trips and calculate your safety score. 
                  Your location data is encrypted and never sold.
                </p>

                {/* GPS Test Result */}
                {gpsStatus === 'idle' && (
                  <button
                    onClick={testGpsPermission}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 mb-4"
                  >
                    <Navigation className="w-5 h-5" />
                    Test Location Access
                  </button>
                )}

                {gpsStatus === 'testing' && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-4">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
                    <p className="text-white/60">Testing GPS access...</p>
                  </div>
                )}

                {gpsStatus === 'success' && gpsResult && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mb-4">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 mb-3">
                      <Check className="w-6 h-6" />
                      <span className="font-medium">GPS Working!</span>
                    </div>
                    <p className="text-white/50 text-sm">
                      Location detected with {gpsResult.accuracy}m accuracy
                    </p>
                  </div>
                )}

                {gpsStatus === 'error' && gpsResult && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-4">
                    <div className="flex items-center justify-center gap-2 text-amber-400 mb-3">
                      <AlertCircle className="w-6 h-6" />
                      <span className="font-medium">GPS Issue</span>
                    </div>
                    <p className="text-white/60 text-sm mb-4">{gpsResult.error}</p>
                    <button
                      onClick={testGpsPermission}
                      className="text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                <p className="text-white/40 text-xs mb-6">
                  You can continue without GPS, but trip tracking will be limited.
                </p>

                {/* Navigation buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={prevStep}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-xl transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={nextStep}
                    className={`flex-1 font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                      gpsStatus === 'success'
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        : 'bg-white/10 hover:bg-white/15 text-white/80'
                    }`}
                  >
                    Continue
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: Annual Mileage */}
            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                  <Car className="w-12 h-12 text-blue-400" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-3">How much do you drive?</h1>
                <p className="text-white/60 mb-8 max-w-sm mx-auto">
                  This helps us personalise your insurance estimate.
                </p>

                <div className="grid grid-cols-1 gap-3 mb-8">
                  {['Under 5,000', '5,000–10,000', '10,000–15,000', '15,000+', 'Not sure'].map((option) => (
                    <button
                      key={option}
                      onClick={() => setAnnualMileage(option)}
                      className={`w-full py-3.5 px-4 rounded-xl text-sm font-medium text-left transition-all border ${
                        annualMileage === option
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                          : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {option} miles/year
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
                    {annualMileage ? 'Continue' : 'Skip'}
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 5: Age + Postcode */}
            {currentStep === 5 && (
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
            )}

            {/* STEP 6: Vehicle Details */}
            {currentStep === 6 && (
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
            )}

            {/* STEP 7: No-Claims Bonus */}
            {currentStep === 7 && (
              <motion.div
                key="step7-ncb"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                  <Shield className="w-12 h-12 text-blue-400" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-3">No-Claims Bonus</h1>
                <p className="text-white/60 mb-8 max-w-sm mx-auto">
                  How many years of no-claims bonus do you have? Each year reduces your premium.
                </p>

                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[0, 1, 2, 3, 4, 5].map((years) => (
                    <button
                      key={years}
                      onClick={() => setNoClaimsYears(years)}
                      className={`py-4 rounded-xl text-sm font-semibold transition-all border ${
                        noClaimsYears === years
                          ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
                          : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="block text-xl font-bold mb-0.5">{years === 5 ? '5+' : years}</span>
                      <span className="text-xs opacity-70">{years === 0 ? 'none' : years === 1 ? 'year' : 'years'}</span>
                    </button>
                  ))}
                </div>

                {noClaimsYears !== null && noClaimsYears > 0 && (
                  <p className="text-emerald-400 text-sm mb-6">
                    {Math.min(noClaimsYears * 10, 50)}% NCB discount applied to your quote
                  </p>
                )}

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
                    {noClaimsYears !== null ? 'Continue' : 'Skip'}
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 8: Referral Source */}
            {currentStep === 8 && (
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
            )}

            {/* STEP 9: Current Insurer */}
            {currentStep === 9 && (
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
            )}

            {/* STEP 10: Current Premium */}
            {currentStep === 10 && (
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
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">£</span>
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
            )}

            {/* STEP 11: Confirm Understanding */}
            {currentStep === 11 && (
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
            )}
            {/* STEP 12: Celebration — You're all set! */}
            {currentStep === 12 && (
              <CelebrationStep onContinue={goToDashboard} userName={user?.name} userEmail={user?.email} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function CelebrationStep({ onContinue, userName, userEmail }: {
  onContinue: () => void;
  userName?: string;
  userEmail?: string;
}) {
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
                {isRegistering ? 'Setting up…' : 'Enable passkey'}
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
              <span className="text-sm font-medium">Taking you to your dashboard…</span>
            </motion.div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
