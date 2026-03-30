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
 *   7.  No-Claims Bonus
 *   8.  Referral Source
 *   9.  Current Insurer
 *   10. Current Premium
 *   11. Confirm — User acknowledges "drive to earn rewards" concept
 *   12. Celebration
 *
 * On completion, sets `onboardingCompleted: true` in Firestore.
 */

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { GpsTestResult } from './onboarding/types';

// Step components
import { StepWelcome } from './onboarding/steps/StepWelcome';
import { StepDataConsent } from './onboarding/steps/StepDataConsent';
import { StepGpsPermission } from './onboarding/steps/StepGpsPermission';
import { StepAnnualMileage } from './onboarding/steps/StepAnnualMileage';
import { StepAgePostcode } from './onboarding/steps/StepAgePostcode';
import { StepVehicleDetails } from './onboarding/steps/StepVehicleDetails';
import { StepNoClaimsBonus } from './onboarding/steps/StepNoClaimsBonus';
import { StepReferralSource } from './onboarding/steps/StepReferralSource';
import { StepCurrentInsurer } from './onboarding/steps/StepCurrentInsurer';
import { StepCurrentPremium } from './onboarding/steps/StepCurrentPremium';
import { StepConfirm } from './onboarding/steps/StepConfirm';
import { StepCelebration } from './onboarding/steps/StepCelebration';

const TOTAL_STEPS = 12;

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
    } catch (error: unknown) {
      setGpsStatus('error');

      let errorMessage = 'Could not get your location';
      const geoError = error as GeolocationPositionError;
      if (geoError.code === 1) {
        errorMessage = 'Location permission denied. Please enable it in your browser settings.';
      } else if (geoError.code === 2) {
        errorMessage = 'Location unavailable. Please check your device settings.';
      } else if (geoError.code === 3) {
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
    if (user) setUser({ ...user, onboardingComplete: true });
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
            {currentStep === 1 && (
              <StepWelcome nextStep={nextStep} />
            )}
            {currentStep === 2 && (
              <StepDataConsent
                nextStep={nextStep}
                prevStep={prevStep}
                dataConsentGiven={dataConsentGiven}
                setDataConsentGiven={setDataConsentGiven}
                persistDataConsent={persistDataConsent}
              />
            )}
            {currentStep === 3 && (
              <StepGpsPermission
                nextStep={nextStep}
                prevStep={prevStep}
                gpsStatus={gpsStatus}
                gpsResult={gpsResult}
                testGpsPermission={testGpsPermission}
              />
            )}
            {currentStep === 4 && (
              <StepAnnualMileage
                nextStep={nextStep}
                prevStep={prevStep}
                annualMileage={annualMileage}
                setAnnualMileage={setAnnualMileage}
              />
            )}
            {currentStep === 5 && (
              <StepAgePostcode
                nextStep={nextStep}
                prevStep={prevStep}
                age={age}
                setAge={setAge}
                postcode={postcode}
                setPostcode={setPostcode}
              />
            )}
            {currentStep === 6 && (
              <StepVehicleDetails
                nextStep={nextStep}
                prevStep={prevStep}
                vehicleMake={vehicleMake}
                setVehicleMake={setVehicleMake}
                vehicleModel={vehicleModel}
                setVehicleModel={setVehicleModel}
                vehicleYear={vehicleYear}
                setVehicleYear={setVehicleYear}
              />
            )}
            {currentStep === 7 && (
              <StepNoClaimsBonus
                nextStep={nextStep}
                prevStep={prevStep}
                noClaimsYears={noClaimsYears}
                setNoClaimsYears={setNoClaimsYears}
              />
            )}
            {currentStep === 8 && (
              <StepReferralSource
                nextStep={nextStep}
                prevStep={prevStep}
                referralSource={referralSource}
                setReferralSource={setReferralSource}
              />
            )}
            {currentStep === 9 && (
              <StepCurrentInsurer
                nextStep={nextStep}
                prevStep={prevStep}
                currentInsurer={currentInsurer}
                setCurrentInsurer={setCurrentInsurer}
              />
            )}
            {currentStep === 10 && (
              <StepCurrentPremium
                nextStep={nextStep}
                prevStep={prevStep}
                currentPremiumPounds={currentPremiumPounds}
                setCurrentPremiumPounds={setCurrentPremiumPounds}
              />
            )}
            {currentStep === 11 && (
              <StepConfirm
                nextStep={nextStep}
                prevStep={prevStep}
                confirmed={confirmed}
                setConfirmed={setConfirmed}
                isLoading={isLoading}
                handleComplete={handleComplete}
              />
            )}
            {currentStep === 12 && (
              <StepCelebration
                onContinue={goToDashboard}
                userName={user?.name}
                userEmail={user?.email}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
