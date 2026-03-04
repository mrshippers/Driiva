import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mail, CheckCircle2, RefreshCw, LogOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import signinLogo from "@/assets/driiva-logo-CLEAR-FINAL.png";
import { useParallax } from "@/hooks/useParallax";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { sendEmailVerification, reload, applyActionCode } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";

/**
 * VERIFY EMAIL PAGE
 * -----------------
 * 1) If opened with ?mode=verifyEmail&oobCode=XXX (link from email), we apply the
 *    code here using OUR auth/key so verification works even when Firebase's
 *    default link uses an expired key. Set "Action URL" in Firebase Console →
 *    Authentication → Templates → Email address verification to this page URL.
 * 2) Otherwise: resend verification, check status, sign out.
 */

function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

// Same allowlist as AuthContext — if user is admin, bail out to dashboard immediately.
const ADMIN_EMAILS_ENV = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { user, logout, markEmailVerified } = useAuth();

  // Admin emails never need to verify — send straight to monitoring/dashboard.
  useEffect(() => {
    if (!user?.email) return;
    if (user.isAdmin === true || ADMIN_EMAILS_ENV.includes(user.email.toLowerCase())) {
      setLocation("/admin/monitoring");
    }
  }, [user?.email, user?.isAdmin, setLocation]);
  const { toast } = useToast();
  const { ref: cardRef, style: cardParallaxStyle } = useParallax({ speed: 0.3 });

  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [resentAt, setResentAt] = useState<Date | null>(null);
  const [linkState, setLinkState] = useState<"idle" | "applying" | "success" | "error">("idle");
  const linkHandled = useRef(false);

  // Handle email link: ?mode=verifyEmail&oobCode=XXX — apply with our key so we never hit Firebase's broken link
  useEffect(() => {
    const mode = getQueryParam("mode");
    const oobCode = getQueryParam("oobCode");
    if (mode !== "verifyEmail" || !oobCode || !auth || !isFirebaseConfigured || linkHandled.current) return;
    linkHandled.current = true;
    const localAuth = auth;

    setLinkState("applying");
    applyActionCode(localAuth, oobCode)
      .then(() => {
        setLinkState("success");
        toast({ title: "Email verified!", description: "Taking you to the app." });
        markEmailVerified();
        if (localAuth.currentUser) reload(localAuth.currentUser).finally(() => setLocation("/dashboard"));
        else setLocation("/dashboard");
      })
      .catch(() => {
        setLinkState("error");
        toast({ title: "Link expired or invalid", description: "Request a new verification email below.", variant: "destructive" });
      });
  }, [setLocation, toast]);

  const handleResend = async () => {
    if (!auth?.currentUser) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }

    // Rate-limit resend: once per 60 seconds
    if (resentAt && Date.now() - resentAt.getTime() < 60_000) {
      const remaining = Math.ceil((60_000 - (Date.now() - resentAt.getTime())) / 1000);
      toast({
        title: "Please wait",
        description: `You can resend in ${remaining} seconds.`,
      });
      return;
    }

    setIsSending(true);
    try {
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/verify-email`,
      });
      setResentAt(new Date());
      toast({
        title: "Email sent",
        description: "Check your inbox (and spam folder) for the verification link.",
      });
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      let msg = "Failed to send email. Please try again.";
      if (firebaseErr.code === "auth/too-many-requests") {
        msg = "Too many attempts. Please wait before trying again.";
      }
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!auth?.currentUser) {
      toast({
        title: "Not signed in",
        description: "Please sign in again, then tap this button.",
        variant: "destructive",
      });
      return;
    }

    setIsChecking(true);
    try {
      // Reload the Firebase user to pick up email verification status
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        markEmailVerified();
        toast({ title: "Email verified!", description: "Welcome to Driiva." });
        setLocation("/dashboard");
      } else {
        toast({
          title: "Not verified yet",
          description: "Click the link in your email, then try again.",
        });
      }
    } catch {
      toast({ title: "Error", description: "Could not check status. Try again.", variant: "destructive" });
    } finally {
      setIsChecking(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setLocation("/signin");
  };

  // Temporary session-level bypass — lets the user access the app without verifying.
  // ProtectedRoute respects this flag so it won't redirect back here.
  const handleSkipForNow = () => {
    sessionStorage.setItem('driiva-skip-email-verification', 'true');
    // If onboarding not complete, go to quick-onboarding so we never mount dashboard and show its spinner (H4 fix).
    setLocation(user?.onboardingComplete === true ? '/dashboard' : '/quick-onboarding');
  };

  // Processing link from email
  if (linkState === "applying") {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/80">Verifying your email…</p>
        </div>
      </div>
    );
  }

  if (linkState === "success") {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
          <p className="text-white font-medium">Email verified. Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
          className="w-full max-w-sm"
        >
          {linkState === "error" && (
            <p className="text-center text-amber-400 text-sm mb-4">That link didn’t work. Request a new one below.</p>
          )}
          <Card
            ref={cardRef}
            className="w-full parallax-content"
            style={{
              background: "rgba(20, 20, 30, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(20px)",
              borderRadius: "20px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              ...cardParallaxStyle,
            }}
          >
            <CardContent className="px-5 py-6">
              {/* Logo */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.3 }}
                className="flex flex-col items-center mb-5"
              >
                <img src={signinLogo} alt="Driiva" className="h-10 w-auto mb-3" />

                <div className="w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-3">
                  <Mail className="w-8 h-8 text-cyan-400" />
                </div>

                <h1 className="text-lg font-semibold text-white mb-1">Verify your email</h1>
                <p className="text-center text-white/60 text-sm">
                  We sent a verification link to{" "}
                  <span className="text-white/80 font-medium">{user?.email ?? "your email"}</span>.
                  Click the link to continue.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-3"
              >
                {/* Primary action: check verification */}
                <button
                  onClick={handleCheckVerification}
                  disabled={isChecking}
                  className="hero-cta-primary hero-cta-blue w-full"
                  style={{ maxWidth: "100%" }}
                >
                  {isChecking ? (
                    <div className="flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      <span>Checking...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>I've verified my email</span>
                    </div>
                  )}
                </button>

                {/* Secondary: resend */}
                <button
                  onClick={handleResend}
                  disabled={isSending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "rgba(255, 255, 255, 0.85)",
                  }}
                >
                  {isSending ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full"
                    />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>{isSending ? "Sending..." : "Resend verification email"}</span>
                </button>

                <div className="text-center pt-1 space-y-2">
                  <button
                    type="button"
                    onClick={handleSkipForNow}
                    className="flex items-center gap-1.5 mx-auto text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    Skip for now — verify later
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex items-center gap-1.5 mx-auto text-xs text-white/30 hover:text-white/50 transition-colors"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign out and use a different account
                  </button>
                </div>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
