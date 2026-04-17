/**
 * Auth Context — mirrors client/src/contexts/AuthContext.tsx
 * Uses @react-native-firebase/auth instead of the web Firebase SDK.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as SecureStore from 'expo-secure-store';

interface User {
  id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  emailVerified?: boolean;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_CACHE_KEY = 'driiva-auth-cache';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load cached user for instant render
  useEffect(() => {
    SecureStore.getItemAsync(AUTH_CACHE_KEY).then((cached) => {
      if (cached) {
        try { setUser(JSON.parse(cached)); } catch {}
      }
    });
  }, []);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (firebaseUser: FirebaseAuthTypes.User | null) => {
      if (firebaseUser) {
        const userData = await resolveUser(firebaseUser);
        setUser(userData);
        SecureStore.setItemAsync(AUTH_CACHE_KEY, JSON.stringify(userData));
      } else {
        setUser(null);
        SecureStore.deleteItemAsync(AUTH_CACHE_KEY);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await auth().signInWithEmailAndPassword(email, password);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const { user: fbUser } = await auth().createUserWithEmailAndPassword(email, password);
    await fbUser.updateProfile({ displayName: name });
    // Create Firestore user doc
    await firestore().collection('users').doc(fbUser.uid).set({
      email,
      fullName: name,
      displayName: name,
      onboardingComplete: false,
      createdAt: firestore.FieldValue.serverTimestamp(),
      createdBy: 'mobile-app',
    });
  }, []);

  const logout = useCallback(async () => {
    await auth().signOut();
    await SecureStore.deleteItemAsync(AUTH_CACHE_KEY);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await auth().sendPasswordResetEmail(email);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Resolve Firebase user to Driiva user shape
async function resolveUser(fbUser: FirebaseAuthTypes.User): Promise<User> {
  const doc = await firestore().collection('users').doc(fbUser.uid).get();
  const data = doc.data();

  return {
    id: fbUser.uid,
    name: data?.displayName || data?.fullName || fbUser.displayName || 'Driver',
    email: fbUser.email || '',
    onboardingComplete: data?.onboardingComplete ?? false,
    emailVerified: fbUser.emailVerified,
    isAdmin: data?.isAdmin ?? false,
  };
}
