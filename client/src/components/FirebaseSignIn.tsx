
import { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, User, Lock, Mail } from "lucide-react";
import DriivaLogo from "@/components/DrivvaLogo";
import FloatingStardust from "@/components/FloatingStardust";

interface FirebaseSignInProps {
  onAuthSuccess: (user: any) => void;
}

export default function FirebaseSignIn({ onAuthSuccess }: FirebaseSignInProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!auth) {
        throw new Error('Firebase Auth is not initialized. Check environment configuration.');
      }
      const userCredential = isSignUp 
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      
      const token = await userCredential.user.getIdToken();
      
      // Send token to your backend
      const response = await fetch("/api/auth/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        const user = await response.json();
        onAuthSuccess(user);
        toast({
          title: isSignUp ? "Account created!" : "Welcome back!",
          description: `Signed in as ${user.email}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Authentication failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      if (!auth) {
        throw new Error('Firebase Auth is not initialized. Check environment configuration.');
      }
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();
      
      const response = await fetch("/api/auth/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        const user = await response.json();
        onAuthSuccess(user);
        toast({
          title: "Welcome!",
          description: `Signed in with Google as ${user.email}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Google sign-in failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      <FloatingStardust density={150} />
      
      <div className="absolute inset-0 flex items-center justify-center opacity-10">
        <div className="scale-[8] blur-[2px]" style={{
          filter: 'blur(4px) brightness(0.3)',
        }}>
          <DriivaLogo />
        </div>
      </div>

      <div className="absolute inset-0" style={{
        background: 'radial-gradient(circle at 30% 20%, rgba(139, 69, 19, 0.15) 0%, rgba(184, 115, 51, 0.1) 35%, rgba(123, 31, 162, 0.08) 70%, transparent 100%)',
        backdropFilter: 'blur(1px)',
      }} />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
        >
          <Card className="w-full max-w-md mx-auto" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          }}>
            <CardContent className="p-8">
              <div className="flex justify-center mb-8">
                <DriivaLogo />
              </div>

              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">
                  {isSignUp ? "Join Driiva" : "Welcome to Driiva"}
                </h1>
                <p className="text-sm text-white/80">
                  {isSignUp ? "Create your telematics insurance account" : "Sign in to your telematics insurance account"}
                </p>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/90">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder-white/50"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/90">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder-white/50"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white/80"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-[#8B4513] via-[#B87333] to-[#7B1FA2] hover:from-[#A0522D] hover:via-[#CD853F] hover:to-[#8B5A96]"
                >
                  {isLoading ? "Loading..." : (isSignUp ? "Create Account" : "Sign In")}
                </Button>
              </form>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-white/20" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-transparent px-2 text-white/60">Or continue with</span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full mt-4 bg-white/10 border border-white/20 text-white hover:bg-white/20"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>
              </div>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-white/70 hover:text-white/90"
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
