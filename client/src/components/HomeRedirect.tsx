/**
 * HOME REDIRECT
 * =============
 * Legacy /home route: redirect to /dashboard if authenticated (or demo mode),
 * otherwise to / (welcome) so unauthenticated users don't hit signin.
 */
import { useLayoutEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

export function HomeRedirect() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isDemoMode = typeof window !== 'undefined' && sessionStorage.getItem('driiva-demo-mode') === 'true';

  useLayoutEffect(() => {
    if (user || isDemoMode) {
      setLocation('/dashboard');
    } else {
      setLocation('/');
    }
  }, [user, isDemoMode, setLocation]);

  return null;
}
