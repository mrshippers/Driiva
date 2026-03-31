/**
 * TESTS: Sign-In Page (client/src/pages/signin.tsx)
 * ==================================================
 * Integration tests for the sign-in form: rendering, validation,
 * email/password sign-in, username resolution, error handling,
 * and Firebase-unavailable state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router, Route, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import React from 'react';

// Ensure React is available globally for components that use automatic JSX transform
globalThis.React = React;

// ---------------------------------------------------------------------------
// Mocks -- must be declared before component imports
// ---------------------------------------------------------------------------

const mockSetLocation = vi.fn();

vi.mock('wouter', async () => {
  const actual = await vi.importActual<typeof import('wouter')>('wouter');
  return {
    ...actual,
    useLocation: () => ['/signin', mockSetLocation] as const,
  };
});

const mockSignInWithEmailAndPassword = vi.fn();
const mockSignInWithPopup = vi.fn();

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

const mockDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  getFirestore: vi.fn(),
}));

// Use vi.hoisted so the variable is available inside vi.mock factories
const { mockFirebaseState } = vi.hoisted(() => ({
  mockFirebaseState: { isFirebaseConfigured: true },
}));

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
  db: {},
  get isFirebaseConfigured() { return mockFirebaseState.isFirebaseConfigured; },
  googleProvider: {},
}));

const mockSetUser = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    setUser: mockSetUser,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/hooks/useParallax', () => ({
  useParallax: () => ({
    ref: { current: null },
    style: {},
  }),
}));

vi.mock('@/components/WelcomeBackOverlay', () => ({
  default: () => null,
}));

vi.mock('@/components/BiometricAuth', () => ({
  default: () => null,
}));

// Mock framer-motion: render motion.* as plain elements (follows legal-pages.test.tsx pattern)
vi.mock('framer-motion', () => {
  const makeMotionComponent = (tag: string) => {
    const Comp = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      const { children, initial, animate, transition, exit, whileHover, whileTap, variants, ...rest } = props;
      return React.createElement(tag, { ...rest, ref } as React.HTMLAttributes<HTMLElement>, children as React.ReactNode);
    });
    Comp.displayName = `motion.${tag}`;
    return Comp;
  };
  return {
    motion: {
      div: makeMotionComponent('div'),
      button: makeMotionComponent('button'),
      form: makeMotionComponent('form'),
      span: makeMotionComponent('span'),
      img: makeMotionComponent('img'),
      p: makeMotionComponent('p'),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// Mock logo import
vi.mock('@/assets/driiva-logo-CLEAR-FINAL.png', () => ({
  default: 'logo.png',
}));

// Stub scrollIntoView (not implemented in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Clear localStorage before each test so returning-user branch is not hit
beforeEach(() => {
  localStorage.removeItem('driiva-last-user');
});

// ---------------------------------------------------------------------------
// Import component under test AFTER mocks
// ---------------------------------------------------------------------------

import SignIn from '../pages/signin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSignIn() {
  const { hook } = memoryLocation({ path: '/signin' });
  return render(
    <Router hook={hook}>
      <Switch>
        <Route path="/signin"><SignIn /></Route>
        <Route path="/dashboard"><div data-testid="dashboard">Dashboard</div></Route>
        <Route path="/quick-onboarding"><div data-testid="onboarding">Onboarding</div></Route>
      </Switch>
    </Router>,
  );
}

function makeUserCredential(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      uid: 'uid-123',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true,
      ...overrides,
    },
  };
}

function makeUserDoc(data: Record<string, unknown> = {}) {
  return {
    exists: () => true,
    data: () => ({ onboardingComplete: true, ...data }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sign-in form rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebaseState.isFirebaseConfigured = true;
  });

  it('renders email/username and password fields', () => {
    renderSignIn();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument();
  });

  it('renders "Sign In" button', () => {
    renderSignIn();
    expect(screen.getByRole('button', { name: /sign in to account/i })).toBeInTheDocument();
  });

  it('renders "Forgot password?" link', () => {
    renderSignIn();
    expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
  });

  it('renders Google sign-in button', () => {
    renderSignIn();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });
});

describe('Form validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebaseState.isFirebaseConfigured = true;
  });

  it('shows error when submitting with empty fields', async () => {
    renderSignIn();
    // Use fireEvent.submit to bypass native `required` validation in jsdom
    const form = screen.getByPlaceholderText(/you@example.com/i).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/please enter both email or username and password/i)).toBeInTheDocument();
    });
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('shows error when submitting with only email (no password)', async () => {
    renderSignIn();
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    await userEvent.type(emailInput, 'test@example.com');

    // Use fireEvent.submit to bypass native `required` validation in jsdom
    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/please enter both email or username and password/i)).toBeInTheDocument();
    });
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});

describe('Successful email/password sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebaseState.isFirebaseConfigured = true;
    mockSetLocation.mockClear();
  });

  it('calls signInWithEmailAndPassword with correct email and password', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue(makeUserCredential());
    mockGetDoc.mockResolvedValue(makeUserDoc());

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(), // auth object
        'test@example.com',
        'password123',
      );
    });
  });

  it('shows welcome overlay when user has onboardingComplete: true', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue(makeUserCredential());
    mockGetDoc.mockResolvedValue(makeUserDoc({ onboardingComplete: true }));

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      // When onboardingComplete, the component shows the WelcomeBackOverlay
      // (pendingDestination = /dashboard). setLocation is NOT called directly;
      // instead the overlay's onDismiss triggers it. We verify no immediate redirect.
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalled();
    });
    // Should NOT navigate immediately — overlay handles it
    expect(mockSetLocation).not.toHaveBeenCalledWith('/dashboard');
  });

  it('navigates to /dashboard when user has onboardingComplete: false (ProtectedRoute redirects)', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue(makeUserCredential());
    mockGetDoc.mockResolvedValue(makeUserDoc({ onboardingComplete: false }));

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'test@example.com');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      // Non-onboarded users go to /dashboard; ProtectedRoute handles the
      // redirect to /quick-onboarding based on AuthContext state.
      expect(mockSetLocation).toHaveBeenCalledWith('/dashboard');
    });
  });
});

describe('Username resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebaseState.isFirebaseConfigured = true;
  });

  it('looks up usernames collection when input has no @', async () => {
    // Username doc exists with email
    mockDoc.mockReturnValue('usernames/johndoe');
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ email: 'john@example.com' }),
      })
      .mockResolvedValue(makeUserDoc());

    mockSignInWithEmailAndPassword.mockResolvedValue(makeUserCredential());

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'johndoe');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'usernames', 'johndoe');
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'john@example.com',
        'pw',
      );
    });
  });

  it('falls back to {username}@driiva.co.uk if username doc not found', async () => {
    mockDoc.mockReturnValue('usernames/unknown');
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => false, data: () => null })
      .mockResolvedValue(makeUserDoc());

    mockSignInWithEmailAndPassword.mockResolvedValue(makeUserCredential());

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'unknownuser');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'unknownuser@driiva.co.uk',
        'pw',
      );
    });
  });
});

describe('Error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebaseState.isFirebaseConfigured = true;
  });

  it('shows "Invalid email or password" for auth/invalid-credential', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'bad@example.com');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it('shows "Too many attempts" for auth/too-many-requests', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/too-many-requests' });

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'user@example.com');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
    });
  });

  it('shows timeout message when sign-in takes >10s', async () => {
    // Simulate the timeout by having signInWithEmailAndPassword reject with
    // the same error the component's Promise.race produces after 10s.
    mockSignInWithEmailAndPassword.mockRejectedValue(
      new Error('Sign-in timed out. Please check your connection and try again.'),
    );

    renderSignIn();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'user@example.com');
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in to account/i }));

    await waitFor(() => {
      expect(screen.getByText(/sign-in timed out/i)).toBeInTheDocument();
    });
  });
});

describe('Firebase not configured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebaseState.isFirebaseConfigured = false;
  });

  afterEach(() => {
    mockFirebaseState.isFirebaseConfigured = true;
  });

  it('shows "unavailable" message when isFirebaseConfigured is false', async () => {
    renderSignIn();

    await waitFor(() => {
      expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
    });
  });
});
