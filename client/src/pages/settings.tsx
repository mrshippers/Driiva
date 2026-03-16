import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { ArrowLeft, Bell, Shield, HelpCircle, ChevronRight, Moon, Globe, LogOut, Lock, MessageSquare, ShieldCheck, Plus, Trash2, Loader2 } from 'lucide-react';
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import FeedbackModal from '../components/FeedbackModal';
import { auth } from '../lib/firebase';
import {
  checkBiometricSupport,
  registerBiometricCredential,
  getUserCredentials,
  deleteCredential,
} from '../lib/webauthn';

type NotificationsLevel = 'all' | 'important' | 'off';
type ThemeMode = 'dark' | 'light';

/**
 * PillChip — refined segmented selector chip for settings.
 * Selected: brand-tinted fill with soft inner glow.
 * Unselected: outlined, neutral, reacts on hover/press.
 */
function PillChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'relative px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide',
        'transition-all duration-[150ms] ease-out outline-none select-none',
        'active:scale-[0.93] border',
        active
          ? [
              'bg-emerald-500/[0.18] border-emerald-400/50 text-emerald-300',
              'shadow-[inset_0_1px_0_rgba(52,211,153,0.18),0_0_0_1px_rgba(52,211,153,0.08)]',
            ].join(' ')
          : [
              'bg-white/[0.04] border-white/[0.1] text-white/40',
              'hover:bg-white/[0.09] hover:border-white/[0.22] hover:text-white/70',
            ].join(' '),
      ].join(' ')}
    >
      {active && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle -mt-px" />
      )}
      {label}
    </button>
  );
}

interface PasskeyCredential {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsed: string | null;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { logout, user } = useAuth();

  const [notificationsLevel, setNotificationsLevel] = useState<NotificationsLevel>(() => {
    const saved = localStorage.getItem('driiva-notifications-level');
    if (saved === 'all' || saved === 'important' || saved === 'off') return saved;
    // Migrate from old boolean key
    return localStorage.getItem('driiva-notifications') === 'false' ? 'off' : 'all';
  });

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return localStorage.getItem('driiva-dark-mode') === 'true' ? 'dark' : 'light';
  });

  const [language] = useState<string>('English');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Passkey management state
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser) return;
    setPasskeysLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const result = await getUserCredentials(token);
      if (result.credentials) {
        setPasskeys(result.credentials as PasskeyCredential[]);
      }
    } catch (e) {
      console.error('[Settings] Failed to load passkeys:', e);
    } finally {
      setPasskeysLoading(false);
    }
  }, []);

  useEffect(() => {
    checkBiometricSupport().then(s => {
      setPasskeySupported(s.supported && s.platformAuthenticator);
      if (s.supported && s.platformAuthenticator) loadPasskeys();
    });
  }, [loadPasskeys]);

  const handleAddPasskey = async () => {
    const email = user?.email || auth?.currentUser?.email;
    if (!email || addingPasskey) return;
    setAddingPasskey(true);
    try {
      const result = await registerBiometricCredential(email);
      if (result.success) await loadPasskeys();
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleRemovePasskey = async (credentialId: string) => {
    const firebaseUser = auth?.currentUser;
    if (!firebaseUser || removingId) return;
    setRemovingId(credentialId);
    try {
      const token = await firebaseUser.getIdToken();
      await deleteCredential(credentialId, token);
      setPasskeys(prev => prev.filter(p => p.id !== credentialId));
    } finally {
      setRemovingId(null);
    }
  };

  useEffect(() => {
    localStorage.setItem('driiva-notifications-level', notificationsLevel);
  }, [notificationsLevel]);

  useEffect(() => {
    const isDark = themeMode === 'dark';
    localStorage.setItem('driiva-dark-mode', String(isDark));
    if (isDark) {
      document.documentElement.style.filter = 'brightness(0.88) contrast(1.05)';
    } else {
      document.documentElement.style.filter = '';
    }
  }, [themeMode]);

  // Apply theme on mount
  useEffect(() => {
    if (localStorage.getItem('driiva-dark-mode') === 'true') {
      document.documentElement.style.filter = 'brightness(0.88) contrast(1.05)';
    }
  }, []);

  return (
    <PageWrapper>
      <div className="pb-12 text-white">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6"
        >
          <button
            onClick={() => window.history.back()}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">Settings</h1>
        </motion.div>

        <div className="space-y-6">
          {/* Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
          >
            <h2 className="text-sm font-medium text-white/60 mb-3 px-1">Preferences</h2>
            <div className="dashboard-glass-card divide-y divide-white/10">
              {/* Notifications */}
              <div className="flex items-center justify-between p-4 rounded-t-xl">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-white/60" />
                  <span className="text-white">Notifications</span>
                </div>
                <div className="flex gap-1.5">
                  <PillChip label="All" active={notificationsLevel === 'all'} onClick={() => setNotificationsLevel('all')} />
                  <PillChip label="Important" active={notificationsLevel === 'important'} onClick={() => setNotificationsLevel('important')} />
                  <PillChip label="Off" active={notificationsLevel === 'off'} onClick={() => setNotificationsLevel('off')} />
                </div>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Moon className="w-5 h-5 text-white/60" />
                  <span className="text-white">Theme</span>
                </div>
                <div className="flex gap-1.5">
                  <PillChip label="Dark" active={themeMode === 'dark'} onClick={() => setThemeMode('dark')} />
                  <PillChip label="Light" active={themeMode === 'light'} onClick={() => setThemeMode('light')} />
                </div>
              </div>

              {/* Language */}
              <div className="flex items-center justify-between p-4 rounded-b-xl">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-white/60" />
                  <span className="text-white">Language</span>
                </div>
                <div className="flex gap-1.5">
                  <PillChip label="EN" active={language === 'English'} onClick={() => {}} />
                  <PillChip label="FR" active={false} onClick={() => {}} />
                  <PillChip label="ES" active={false} onClick={() => {}} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Security — Passkeys */}
          {passkeySupported && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              <h2 className="text-sm font-medium text-white/60 mb-3 px-1">Security</h2>
              <div className="dashboard-glass-card divide-y divide-white/10">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-blue-400" />
                      <div>
                        <span className="text-white font-medium block">Passkeys</span>
                        <span className="text-white/40 text-xs">Sign in with Face ID or fingerprint</span>
                      </div>
                    </div>
                    <button
                      onClick={handleAddPasskey}
                      disabled={addingPasskey}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-400/30 text-blue-300 text-xs font-medium hover:bg-blue-500/25 disabled:opacity-50 transition-colors"
                    >
                      {addingPasskey ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      {addingPasskey ? 'Setting up…' : 'Add passkey'}
                    </button>
                  </div>

                  {passkeysLoading && (
                    <div className="flex items-center gap-2 text-white/40 text-sm py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading passkeys…</span>
                    </div>
                  )}

                  {!passkeysLoading && passkeys.length === 0 && (
                    <p className="text-white/40 text-sm">No passkeys set up yet.</p>
                  )}

                  <AnimatePresence>
                    {passkeys.map(pk => (
                      <motion.div
                        key={pk.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center justify-between py-2"
                      >
                        <div>
                          <span className="text-white text-sm font-medium">
                            {pk.deviceName || 'Biometric Key'}
                          </span>
                          <span className="text-white/40 text-xs block">
                            Added {new Date(pk.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {pk.lastUsed && ` · Last used ${new Date(pk.lastUsed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemovePasskey(pk.id)}
                          disabled={removingId === pk.id}
                          className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                          aria-label="Remove passkey"
                        >
                          {removingId === pk.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {/* Account */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-sm font-medium text-white/60 mb-3 px-1">Account</h2>
            <div className="dashboard-glass-card divide-y divide-white/10">
              <button
                onClick={() => setLocation('/privacy')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors rounded-t-xl"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-white/60" />
                  <span className="text-white">Privacy & Security</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40" />
              </button>
              <button
                onClick={() => setLocation('/trust')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-indigo-400" />
                  <div className="text-left">
                    <span className="text-white block">Trust & Legal</span>
                    <span className="text-white/40 text-xs">FCA, GDPR, your rights</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40" />
              </button>
              <button
                onClick={() => setLocation('/support')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-white/60" />
                  <span className="text-white">Help & Support</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40" />
              </button>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-teal-400" />
                  <div className="text-left">
                    <span className="text-white block">Share Feedback</span>
                    <span className="text-white/40 text-xs">Help us improve Driiva</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40" />
              </button>
              {user?.isAdmin && (
                <button
                  onClick={() => setLocation('/admin')}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors bg-purple-500/5 border-t border-purple-400/20"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-purple-400" />
                    <div className="text-left">
                      <span className="text-white block">Admin Panel</span>
                      <span className="text-purple-300 text-xs">Manage users, trips & system</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-purple-400" />
                </button>
              )}
              <button
                onClick={() => {
                  // Navigate FIRST, then logout — prevents ProtectedRoute
                  // from intercepting and redirecting to /signin
                  setLocation('/');
                  logout();
                }}
                className="w-full flex items-center justify-between p-4 hover:bg-red-500/10 transition-colors rounded-b-xl group"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="w-5 h-5 text-red-400" />
                  <span className="text-red-400 font-medium">Sign Out</span>
                </div>
              </button>
            </div>
          </motion.div>
        </div>
      </div>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <BottomNav />
    </PageWrapper>
  );
}
