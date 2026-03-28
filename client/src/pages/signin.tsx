import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Mail, Lock, ArrowLeft, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import signinLogo from "@/assets/driiva-logo-CLEAR-FINAL.png";
import { useParallax } from "@/hooks/useParallax";
import { useAuth } from "../contexts/AuthContext";
import { auth, db, isFirebaseConfigured, googleProvider } from "@/lib/firebase";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import WelcomeBackOverlay from "@/components/WelcomeBackOverlay";
import BiometricAuth from "@/components/BiometricAuth";

const LAST_USER_KEY = 'driiva-last-user';

interface LastUserData {
  name: string;
  email: string;
  score?: number;
  lastTrip?: string;
}

/**
 * SIGN-IN PAGE
 * ------------
 * This page handles REAL Firebase authentication only.
 * NO demo accounts - demo mode is accessed via /demo route.
 */

function getLastUser(): LastUserData | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLastUser(data: LastUserData) {
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(data));
}

export default function SignIn() {
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  const [, setLocation] = useLocation();

  const [lastUser] = useState<LastUserData | null>(getLastUser);
  const isReturningUser = lastUser !== null;

  const [emailOrUsername, setEmailOrUsername] = useState(lastUser?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { toast } = useToast();
  const { ref: cardRef, style: cardParallaxStyle } = useParallax({ speed: 0.3 });
  const { setUser } = useAuth();
  const errorRef = useRef<HTMLDivElement>(null);

  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const [welcomeData, setWelcomeData] = useState<{ name: string; score?: number; lastTrip?: string } | null>(null);
  const pendingDestination = useRef<string | null>(null);

  const dismissOverlay = useCallback(() => {
    if (pendingDestination.current) {
      setLocation(pendingDestination.current);
      pendingDestination.current = null;
    }
  }, [setLocation]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setConnectionStatus('unavailable');
    } else {
      setConnectionStatus('connected');
    }
  }, []);

  // Scroll error into view when it appears
  useEffect(() => {
    if (loginError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [loginError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoginError(null);

    if (!emailOrUsername.trim() || !password.trim()) {
      setLoginError('Please enter both email or username and password');
      toast({ title: "Missing credentials", description: "Please enter both email or username and password", variant: "destructive" });
      return;
    }

    // Show loading immediately so user sees feedback
    setIsLoading(true);
    setLoginError(null);

    // Resolve to email so johndoe and johndoe@abc.com map to the same user
    let email: string;
    const raw = emailOrUsername.trim();
    if (raw.includes('@')) {
      email = raw;
    } else {
      const usernameKey = raw.toLowerCase();
      if (db) {
        try {
          const usernameSnap = await getDoc(doc(db, 'usernames', usernameKey));
          if (usernameSnap.exists() && usernameSnap.data()?.email) {
            email = usernameSnap.data()!.email as string;
          } else {
            email = `${raw}@driiva.co.uk`;
          }
        } catch {
          email = `${raw}@driiva.co.uk`;
        }
      } else {
        email = `${raw}@driiva.co.uk`;
      }
    }

    if (!isFirebaseConfigured || !auth) {
      setIsLoading(false);
      setLoginError('Sign-in is currently unavailable. Please try demo mode.');
      toast({ title: "Service unavailable", description: "Try demo mode instead.", variant: "destructive" });
      return;
    }

    try {
      // Firebase auth only — AuthContext's onAuthStateChanged handles the rest.
      // No redundant Firestore reads here. This eliminates 5-10s of post-auth delay.
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const displayName = user.displayName || user.email?.split('@')[0] || 'User';

      // Quick non-blocking Firestore read for welcome overlay data only.
      // This does NOT block navigation — AuthContext resolves user state independently.
      let score: number | undefined;
      let lastTripLabel: string | undefined;
      let onboardingComplete = false;
      try {
        if (db) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const d = userDoc.data();
            onboardingComplete = d?.onboardingComplete === true;
            score = d?.drivingProfile?.score ?? d?.drivingScore;
            const recent = d?.recentTrips;
            if (Array.isArray(recent) && recent.length > 0) {
              const last = recent[0];
              lastTripLabel = last.from && last.to ? `${last.from} → ${last.to}` : last.date;
            }
          }
        }
      } catch {
        // Non-critical — welcome overlay just won't show score/trip
      }

      saveLastUser({ name: displayName, email: user.email || email, score, lastTrip: lastTripLabel });

      if (onboardingComplete) {
        pendingDestination.current = "/dashboard";
        setWelcomeData({ name: displayName, score, lastTrip: lastTripLabel });
        setShowWelcomeOverlay(true);
      } else {
        // AuthContext's onAuthStateChanged will set user + onboardingComplete.
        // ProtectedRoute will redirect to /quick-onboarding if needed.
        setLocation("/dashboard");
      }

    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      console.error('[SignIn] Authentication failed:', err);
      let errorMessage = "Invalid email or password. Try demo mode if you don't have an account yet.";

      if (err.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key' ||
        err.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key' ||
        err.message?.includes('api-key-not-valid')) {
        errorMessage = "Service configuration error. The Firebase API key is invalid or restricted.";
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = "Invalid email address format.";
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = "Invalid email or password. Use one of the test accounts or try demo mode.";
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = "Too many attempts. Please try again later.";
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = "Network error. Check your connection and try again.";
      }

      setLoginError(errorMessage);
      toast({
        title: "Sign in failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      setLoginError('Google Sign-In is currently unavailable.');
      return;
    }

    setIsLoading(true);
    setLoginError(null);

    try {
      // Firebase auth only — AuthContext handles the rest via onAuthStateChanged.
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const gDisplayName = user.displayName || user.email?.split('@')[0] || 'User';

      saveLastUser({ name: gDisplayName, email: user.email || '' });

      // Navigate to dashboard — ProtectedRoute + AuthContext handle onboarding/verify redirects.
      pendingDestination.current = "/dashboard";
      setWelcomeData({ name: gDisplayName });
      setShowWelcomeOverlay(true);

    } catch (error: any) {
      console.error('[SignIn] Google sign-in failed:', error);

      // User closed the popup — not an error worth showing
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        setIsLoading(false);
        return;
      }

      let errorMessage = "Google sign-in failed. Please try again.";
      if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = "An account already exists with this email using a different sign-in method.";
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = "Network error. Please check your connection.";
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = "Pop-up was blocked by your browser. Please allow pop-ups for this site.";
      }

      setLoginError(errorMessage);
      toast({
        title: "Google sign-in failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex items-center justify-center px-5 py-12">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          onClick={() => setLocation("/welcome")}
          className="absolute top-6 left-4 z-20 flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-200"
          aria-label="Back to welcome"
        >
          <ArrowLeft className="w-5 h-5 text-white/90" />
        </motion.button>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            delay: 0.2,
          }}
          className="w-full max-w-sm"
        >
          <Card
            ref={cardRef}
            className="w-full parallax-content"
            style={{
              background: 'rgba(20, 20, 30, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
              borderRadius: '20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              ...cardParallaxStyle,
            }}>
            <CardContent className="px-5 py-5">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                  delay: 0.4,
                }}
                className="flex flex-col items-center mb-4"
              >
                {isReturningUser ? (
                  <>
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/20">
                      <span className="text-white font-bold text-2xl">
                        {lastUser.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <h2 className="text-white text-lg font-bold mb-0.5">
                      Welcome back, {lastUser.name.split(' ')[0]}
                    </h2>
                    <p className="text-center text-white/50 text-sm">
                      Sign in to continue
                    </p>
                  </>
                ) : (
                  <>
                    <img
                      src={signinLogo}
                      alt="Driiva"
                      className="h-10 w-auto mb-2"
                    />
                    <p className="text-center text-white/70 text-sm">
                      Sign in to your telematics insurance account
                    </p>
                  </>
                )}

                {connectionStatus === 'unavailable' && (
                  <div className="mt-3 px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30">
                    Service Unavailable
                  </div>
                )}
                {connectionStatus === 'connected' && !isReturningUser && (
                  <div className="mt-3 px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Connected
                  </div>
                )}
              </motion.div>

              <motion.form
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white/80">
                    Email or username
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
                    <Input
                      type="text"
                      value={emailOrUsername}
                      onChange={(e) => {
                        setEmailOrUsername(e.target.value);
                        setLoginError(null);
                      }}
                      className="signin-input pl-10"
                      placeholder="e.g. you@example.com or driiva1"
                      required
                      autoComplete="username email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white/80">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setLoginError(null);
                      }}
                      className="signin-input pl-10 pr-10"
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end -mt-2">
                  <button
                    type="button"
                    onClick={() => setLocation("/forgot-password")}
                    className="text-xs text-white/50 hover:text-cyan-400 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                {loginError && (
                  <motion.div
                    ref={errorRef}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                    style={{
                      background: 'rgba(220, 38, 38, 0.15)',
                      border: '1px solid rgba(220, 38, 38, 0.3)',
                    }}
                  >
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-red-300 text-sm">{loginError}</span>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || connectionStatus === 'unavailable'}
                  className="hero-cta-primary hero-cta-blue w-full"
                  style={{ maxWidth: '100%' }}
                  aria-label="Sign in to account"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <LogIn className="w-4 h-4" />
                      <span>Sign In</span>
                    </div>
                  )}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-white/15" />
                  <span className="text-white/40 text-xs uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-white/15" />
                </div>

                {/* Google Sign-In */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || connectionStatus === 'unavailable'}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'rgba(255, 255, 255, 0.9)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  }}
                  aria-label="Continue with Google"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                {isReturningUser && (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 h-px bg-white/15" />
                      <span className="text-white/40 text-xs uppercase tracking-wider">or</span>
                      <div className="flex-1 h-px bg-white/15" />
                    </div>
                    <BiometricAuth
                      email={emailOrUsername || lastUser?.email || ''}
                      onSuccess={(userData) => {
                        // Firebase session is already established inside BiometricAuth
                        // via signInWithCustomToken — we just need to update React state.
                        setUser({
                          id: userData.firebaseUid || userData.id,
                          email: userData.email,
                          name: userData.displayName || userData.firstName || 'User',
                          onboardingComplete: true,
                          emailVerified: true,
                        });
                        pendingDestination.current = '/dashboard';
                        setWelcomeData({ name: userData.displayName || userData.firstName || 'User' });
                        setShowWelcomeOverlay(true);
                      }}
                    />
                  </>
                )}

                {/* Links */}
                <div className="text-center space-y-2 pt-2">
                  <p className="text-white/50 text-sm">
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setLocation("/signup")}
                      className="text-cyan-400 hover:text-cyan-300 font-medium"
                    >
                      Sign up
                    </button>
                  </p>
                  <p className="text-white/50 text-sm">
                    Just exploring?{" "}
                    <button
                      type="button"
                      onClick={() => setLocation("/demo")}
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Try demo mode
                    </button>
                  </p>
                  {isReturningUser && (
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem(LAST_USER_KEY);
                        setEmailOrUsername('');
                        window.location.reload();
                      }}
                      className="text-white/30 hover:text-white/50 text-xs transition-colors"
                    >
                      Not {lastUser.name.split(' ')[0]}? Switch account
                    </button>
                  )}
                </div>
              </motion.form>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {showWelcomeOverlay && welcomeData && (
        <WelcomeBackOverlay
          name={welcomeData.name}
          score={welcomeData.score}
          lastTrip={welcomeData.lastTrip}
          onDismiss={dismissOverlay}
        />
      )}
    </div>
  );
}
