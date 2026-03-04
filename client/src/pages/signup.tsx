import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { AlertCircle, Loader2, Eye, EyeOff, ArrowLeft, User, Mail, Lock } from "lucide-react";
import { timing, easing, microInteractions } from "@/lib/animations";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "firebase/auth";
import { doc, setDoc, getDoc, writeBatch } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useParallax } from "@/hooks/useParallax";
import { useToast } from "@/hooks/use-toast";

/**
 * SIGNUP PAGE
 * -----------
 * This page handles REAL Firebase account creation only.
 * NO demo mode - demo is accessed via /demo route.
 * On success, navigates to /home (driver dashboard).
 */

export default function Signup() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { ref: cardRef, style: cardParallaxStyle } = useParallax({ speed: 0.3 });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.fullName.trim()) {
      setError("Please enter your full name");
      return;
    }

    if (!validateEmail(formData.email)) {
      setError("Please enter a valid email address");
      return;
    }

    // Firebase often rejects test domains like @example.com
    const domain = formData.email.split("@")[1]?.toLowerCase() || "";
    if (["example.com", "example.org", "test.com"].includes(domain)) {
      setError("Use a real email address (e.g. Gmail). Test domains like @example.com are not accepted.");
      return;
    }

    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      // Check if Firebase is configured
      if (!isFirebaseConfigured) {
        console.log('[Signup] Firebase not configured');
        setError("Account creation is currently unavailable. Please try the demo mode to explore the app.");
        return;
      }

      if (!auth) {
        setError("Firebase Auth is not initialized. Check your environment configuration.");
        return;
      }

      if (!db) {
        setError("Database is not available. Please try again later.");
        return;
      }

      // Username collision check moved to non-blocking (advisory only)
      // If it fails or times out, we continue anyway - the Cloud Function will handle conflicts
      const localPart = formData.email.split('@')[0]?.toLowerCase() || '';
      if (localPart) {
        try {
          const usernameRef = doc(db, 'usernames', localPart);
          const existing = await Promise.race([
            getDoc(usernameRef),
            new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error('Username check timeout')), 3000)
            )
          ]);
          if (existing && existing.exists()) {
            const existingEmail = (existing.data()?.email as string) || '';
            if (existingEmail.toLowerCase() !== formData.email.toLowerCase()) {
              setError('This username is already taken. Please use a different email or sign in.');
              return;
            }
          }
        } catch (err) {
          // Username check failed or timed out - log but continue
          console.warn('[Signup] Username check failed, proceeding anyway:', err);
        }
      }

      // Wrap entire auth creation in 8-second timeout
      const userCredential = await Promise.race([
        createUserWithEmailAndPassword(auth, formData.email, formData.password),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Sign-up timed out. Please try again or check your connection.')), 8000)
        )
      ]);
      const user = userCredential.user;
      const now = new Date();
      const nowISO = now.toISOString();


      const batch = writeBatch(db);
      batch.set(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: formData.email,
        fullName: formData.fullName,
        onboardingCompleted: false,
        onboardingComplete: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      });
      if (localPart) {
        batch.set(doc(db, 'usernames', localPart), { email: formData.email, uid: user.uid }, { merge: true });
      }
      // Policy is created by the onUserCreate Cloud Function trigger

      await Promise.all([
        updateProfile(user, { displayName: formData.fullName }),
        batch.commit(),
      ]);

      // Set user in context and navigate immediately — no blocking on email send
      setUser({
        id: user.uid,
        email: user.email || formData.email,
        name: formData.fullName,
        onboardingComplete: false,
        emailVerified: false,
      });

      toast({
        title: "Account created!",
        description: "Check your inbox for a verification email, then let's get you set up.",
      });

      setLocation("/quick-onboarding");

      // Fire-and-forget: send verification email in background
      sendEmailVerification(user, {
        url: `${window.location.origin}/verify-email`,
      }).then(
        () => console.log('[Signup] Verification email sent to', user.email),
        (err: any) => console.warn('[Signup] sendEmailVerification failed:', err?.code, err?.message),
      );

    } catch (err: any) {
      console.error("Signup error:", err);

      if (err.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key' ||
          err.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key' ||
          err.message?.includes('api-key-not-valid')) {
        console.error('[Signup] API key rejected by Firebase. Check .env VITE_FIREBASE_API_KEY and Google Cloud API key restrictions.');
        setError(
          "Service configuration error. The Firebase API key is invalid or restricted. " +
          "Please contact the developer or check the API key in Google Cloud Console."
        );
      } else if (err.code === 'auth/email-already-in-use') {
        setError("This email is already registered. Please sign in instead.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password is too weak. Use at least 8 characters with a mix of letters and numbers.");
      } else if (err.code === 'auth/invalid-email') {
        setError("Invalid email address format.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Network error. Please check your connection and try again.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("Email/password sign-up is not enabled. Check Firebase Console → Authentication → Sign-in method.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Too many attempts. Please try again later.");
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen flex flex-col p-6 pt-safe text-white relative z-10">
      <div className="flex items-center justify-between mb-8">
        <motion.button
          onClick={handleBack}
          whileTap={microInteractions.tap}
          transition={{ duration: timing.quick / 1000 }}
          className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 
                   flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
        >
          <span className="text-white">←</span>
        </motion.button>
        <span className="text-sm text-white/50">Step 1 of 2</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: timing.pageTransition / 1000, ease: easing.smoothDecel }}
        className="flex-1"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
        <p className="text-white/60 mb-8">Join thousands of safer drivers</p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-white/70 mb-2 block">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                type="text"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="pl-12 h-14 bg-white/5 border-white/10 text-white placeholder:text-white/40 
                         rounded-xl focus:border-orange-400/50 focus:ring-orange-400/20"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-white/70 mb-2 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="pl-12 h-14 bg-white/5 border-white/10 text-white placeholder:text-white/40 
                         rounded-xl focus:border-orange-400/50 focus:ring-orange-400/20"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-white/70 mb-2 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="pl-12 pr-12 h-14 bg-white/5 border-white/10 text-white placeholder:text-white/40 
                         rounded-xl focus:border-orange-400/50 focus:ring-orange-400/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-white/70 mb-2 block">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="pl-12 pr-12 h-14 bg-white/5 border-white/10 text-white placeholder:text-white/40 
                         rounded-xl focus:border-orange-400/50 focus:ring-orange-400/20"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={isLoading}
            whileTap={microInteractions.tap}
            className="w-full h-14 bg-gradient-to-r from-orange-500 to-orange-600 
                     hover:from-orange-600 hover:to-orange-700 text-white font-semibold 
                     rounded-xl transition-all duration-200 flex items-center justify-center gap-2
                     disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </motion.button>
        </form>

        <div className="mt-8 text-center space-y-3">
          <button
            onClick={() => setLocation("/signin")}
            className="text-orange-400 hover:text-orange-300 font-medium text-sm"
          >
            Sign in
          </button>
          <p className="text-white/50 text-sm">
            Just exploring?{" "}
            <button
              onClick={() => setLocation("/demo")}
              className="text-emerald-400 hover:text-emerald-300 font-medium"
            >
              Try demo mode
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
