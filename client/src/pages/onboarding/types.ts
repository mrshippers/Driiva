/**
 * Shared prop types for onboarding step components.
 */

export interface OnboardingStepProps {
  nextStep: () => void;
  prevStep: () => void;
}

export interface GpsTestResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  error?: string;
}
