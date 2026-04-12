import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authenticate, sanitizeInput } from '@/utils/auth';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function SignIn() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});

  const validateForm = () => {
    const newErrors: { username?: string; password?: string } = {};
    
    if (!username) {
      newErrors.username = 'Username is required';
    } else if (username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const sanitizedUsername = sanitizeInput(username);
      const sanitizedPassword = sanitizeInput(password);

      const user = await authenticate({
        username: sanitizedUsername,
        password: sanitizedPassword
      });

      await login(user.email, sanitizedPassword);
      
      toast({
        title: "Welcome back!",
        description: `Signed in as ${user.firstName} ${user.lastName}`,
      });

      setLocation('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Handle specific error types
      if (error.message.includes('Too many')) {
        toast({
          title: "Too many attempts",
          description: "Please wait a few minutes before trying again",
          variant: "destructive",
        });
      } else if (error.message.includes('Invalid')) {
        setErrors({ password: 'Invalid username or password' });
      } else {
        toast({
          title: "Sign in failed",
          description: error.message || "Please check your credentials and try again",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="driiva-gradient-bg" aria-hidden />
      <div className="glass-morphism rounded-3xl p-8 w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Welcome Back
          </h1>
          <p className="text-gray-300">Sign in to your Driiva account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="username" className="text-white mb-2 block">
              Username
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className={`bg-white/10 border-white/20 text-white placeholder:text-gray-400 ${
                errors.username ? 'border-red-500' : ''
              }`}
              disabled={isLoading}
              autoComplete="username"
            />
            {errors.username && (
              <p className="text-red-400 text-sm mt-1">{errors.username}</p>
            )}
          </div>

          <div>
            <Label htmlFor="password" className="text-white mb-2 block">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={`bg-white/10 border-white/20 text-white placeholder:text-gray-400 ${
                errors.password ? 'border-red-500' : ''
              }`}
              disabled={isLoading}
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="text-red-400 text-sm mt-1">{errors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Dev credentials: <span className="text-white">driiva1 / driiva1</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}