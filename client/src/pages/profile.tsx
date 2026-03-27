import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import PolicyDownload from "@/components/PolicyDownload";
import ExportDataButton from "@/components/ExportDataButton";
import DeleteAccount from "@/components/DeleteAccount";
import { ChevronDown, Bell, Pencil, Check, X, Loader2, Shield } from "lucide-react";
import { timing, easing } from "@/lib/animations";
import { useAuth } from '../contexts/AuthContext';
import { useDashboardData } from '@/hooks/useDashboardData';

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white/[0.08] rounded ${className}`} />
  );
}

function DetailRow({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-white/60">{label}</span>
      {loading ? (
        <Skeleton className="h-4 w-28" />
      ) : (
        <span className="text-sm font-medium text-white text-right">{value}</span>
      )}
    </div>
  );
}

function StatCard({ value, label, loading }: { value: string | number; label: string; loading?: boolean }) {
  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 text-center">
      {loading ? (
        <>
          <Skeleton className="h-7 w-12 mx-auto mb-2" />
          <Skeleton className="h-3 w-16 mx-auto" />
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-white mb-1">{value}</p>
          <p className="text-xs text-white/50">{label}</p>
        </>
      )}
    </div>
  );
}

function PolicyFeature({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-white/50">{description}</p>
      </div>
    </div>
  );
}

function CoverageTypeSection({ currentScore, coverageType, premiumAmount, loading }: { currentScore: number; coverageType: string | null; premiumAmount: number; loading?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const projectedRefund = currentScore >= 70 && premiumAmount > 0
    ? ((currentScore - 70) / 30 * 10 + 5) / 100 * premiumAmount
    : 0;

  if (loading) {
    return (
      <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }

  return (
    <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors min-h-[56px]"
      >
        <span className="text-sm text-white/60">Coverage Type</span>
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 font-medium">{coverageType ?? 'Not active'}</span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4 text-emerald-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: easing.smoothDecel }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.08]">
              <p className="text-sm text-white/50 mb-4">Full coverage with extras</p>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-white/80 uppercase tracking-wide">
                  What's Included
                </h4>

                <PolicyFeature icon="✅" title="Collision Coverage" description="Damage to your vehicle from accidents" />
                <PolicyFeature icon="✅" title="Comprehensive Coverage" description="Theft, vandalism, weather damage" />
                <PolicyFeature icon="✅" title="Third-Party Liability" description="Up to £20M coverage for injuries & property" />
                <PolicyFeature icon="✅" title="Personal Injury Protection" description="Medical expenses for you and passengers" />
                <PolicyFeature icon="✅" title="Roadside Assistance" description="24/7 emergency breakdown service" />
                <PolicyFeature icon="✅" title="Courtesy Car" description="Replacement vehicle during repairs" />
                <PolicyFeature icon="✅" title="Legal Expenses" description="Up to £100,000 legal cover" />
              </div>

              <div className="mt-4 p-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/60">Voluntary Excess</span>
                  <span className="text-sm font-medium text-white/40">—</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Compulsory Excess</span>
                  <span className="text-sm font-medium text-white/40">—</span>
                </div>
                <div className="mt-2 pt-2 border-t border-white/[0.05] flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">Total Excess</span>
                  <span className="text-base font-semibold text-white/40">—</span>
                </div>
              </div>

              {currentScore >= 70 && (
                <div className="mt-4 flex items-start gap-2 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <span className="text-base">ℹ️</span>
                  <div>
                    <p className="text-xs text-emerald-300 font-medium mb-1">Policy Benefits</p>
                    <p className="text-xs text-emerald-200/70">
                      Your safe driving score of {currentScore} could reduce your premium by up to £{projectedRefund.toFixed(2)} at renewal.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface EditableFields {
  displayName: string;
  phoneNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [locationTracking, setLocationTracking] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: dashboardData, loading, error, refresh } = useDashboardData(user?.id ?? null);

  const [editFields, setEditFields] = useState<EditableFields>({
    displayName: '',
    phoneNumber: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
  });

  const startEditing = useCallback(() => {
    setEditFields({
      displayName: dashboardData?.displayName || user?.name || '',
      phoneNumber: dashboardData?.phoneNumber || '',
      vehicleMake: dashboardData?.vehicle?.make || '',
      vehicleModel: dashboardData?.vehicle?.model || '',
      vehicleYear: dashboardData?.vehicle?.year ? String(dashboardData.vehicle.year) : '',
    });
    setSaveError(null);
    setIsEditing(true);
  }, [dashboardData, user]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setSaveError(null);
  }, []);

  const saveChanges = useCallback(async () => {
    if (!user?.id || !db) return;
    setSaving(true);
    setSaveError(null);

    try {
      const userRef = doc(db, 'users', user.id);
      const updates: Record<string, any> = {
        updatedAt: Timestamp.now(),
        updatedBy: user.id,
      };

      if (editFields.displayName.trim()) {
        updates.displayName = editFields.displayName.trim();
      }
      if (editFields.phoneNumber.trim()) {
        updates.phoneNumber = editFields.phoneNumber.trim();
      }
      if (editFields.vehicleMake.trim() || editFields.vehicleModel.trim() || editFields.vehicleYear.trim()) {
        const yearNum = parseInt(editFields.vehicleYear, 10);
        updates.vehicle = {
          make: editFields.vehicleMake.trim() || null,
          model: editFields.vehicleModel.trim() || null,
          year: !isNaN(yearNum) && yearNum > 1900 && yearNum <= new Date().getFullYear() + 1 ? yearNum : null,
          color: null,
          vin: null,
        };
      }

      await updateDoc(userRef, updates);
      setIsEditing(false);
      refresh();
    } catch (err) {
      console.error('[Profile] Save error:', err);
      setSaveError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user, editFields, refresh]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const handleLogout = () => {
    setShowDropdown(false);
    setLocation("/");
    logout();
  };

  const firstName = user?.name?.split(' ')[0] ?? '';
  const lastName = user?.name?.split(' ').slice(1).join(' ') ?? '';
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`
    : (firstName ? firstName[0] : (user?.email?.[0] ?? '?')).toUpperCase();
  const greetingName = firstName || user?.email?.split('@')[0] || 'Driver';
  const avatarInitial = (user?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase();

  const currentScore = dashboardData?.drivingScore ?? 0;
  const totalTrips = dashboardData?.totalTrips ?? 0;
  const totalMiles = dashboardData?.totalMiles ?? 0;
  const premiumAmount = dashboardData?.premiumAmount
    ? dashboardData.premiumAmount.toFixed(2)
    : '—';
  const policyNumber = dashboardData?.policyNumber ?? null;
  const memberId = user?.id ? `DRV-${user.id.slice(0, 8).toUpperCase()}` : '—';
  const displayPolicyNumber = policyNumber ?? memberId;
  const scoreBreakdown = dashboardData?.scoreBreakdown;
  const memberSince = dashboardData?.memberSince ?? '—';

  if (error && !dashboardData) {
    return (
      <PageWrapper>
        <div className="pb-24 text-white flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <span className="text-4xl">⚠️</span>
          <p className="text-white/70 text-sm font-medium">Something went wrong loading your profile.</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-medium hover:bg-emerald-500/30 transition-colors min-h-[44px]"
          >
            Try Again
          </button>
        </div>
        <BottomNav />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="pb-24 text-white space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between"
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-700/30 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Driiva" className="w-full h-full object-cover" />
            </div>
            <div style={{ marginTop: '2px' }}>
              <h1 className="text-xl font-bold text-white">Driiva</h1>
              <p className="text-sm text-white/50">{getGreeting()}, {greetingName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            <button className="p-2 rounded-full hover:bg-white/5 transition-colors">
              <Bell className="w-5 h-5 text-white/60" />
            </button>

            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">{avatarInitial}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showDropdown && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowDropdown(false)}
                    className="fixed inset-0 z-40"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-12 right-0 w-56 z-50 backdrop-blur-2xl bg-[#1a1a2e]/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="p-4">
                      <p className="text-xs text-white/50 mb-1">Member ID</p>
                      <p className="text-sm font-medium text-white">{displayPolicyNumber}</p>
                    </div>
                    <div className="border-t border-white/10">
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-white/5 transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Profile</h2>
          {!isEditing ? (
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors min-h-[44px]"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-white/50 hover:text-white rounded-lg transition-colors min-h-[44px]"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors min-h-[44px] disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save
              </button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
            {saveError}
          </div>
        )}

        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
          <div className="flex flex-col items-center text-center mb-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4 border-2 border-emerald-500/60"
              style={{
                background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 70%, transparent 100%)',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.15), inset 0 0 20px rgba(16, 185, 129, 0.1)'
              }}
            >
              {loading ? (
                <Skeleton className="w-10 h-6 rounded" />
              ) : (
                <span className="text-2xl font-semibold text-white/80">{initials.toUpperCase()}</span>
              )}
            </div>
            {loading ? (
              <>
                <Skeleton className="h-6 w-36 mb-2" />
                <Skeleton className="h-4 w-48" />
              </>
            ) : isEditing ? (
              <>
                <input
                  type="text"
                  value={editFields.displayName}
                  onChange={(e) => setEditFields(f => ({ ...f, displayName: e.target.value }))}
                  className="text-xl font-semibold text-white mb-1 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-1.5 text-center w-48 focus:outline-none focus:border-emerald-500/50"
                  placeholder="Your name"
                />
                <p className="text-sm text-white/50">{user?.email || '—'}</p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-white mb-1">
                  {dashboardData?.displayName || user?.name || user?.email?.split('@')[0] || 'Driver'}
                </h2>
                <p className="text-sm text-white/50">{user?.email || '—'}</p>
              </>
            )}
          </div>

          <div className="flex gap-2 mt-2">
            <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <span className="text-xs text-white/50">Score</span>
              {loading ? (
                <Skeleton className="h-4 w-8" />
              ) : (
                <span className="text-sm font-semibold text-white">{totalTrips === 0 ? '—' : currentScore}</span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <span className="text-xs text-white/50">Trips</span>
              {loading ? (
                <Skeleton className="h-4 w-8" />
              ) : (
                <span className="text-sm font-semibold text-white">{totalTrips}</span>
              )}
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span>📋</span>
            Account Details
          </h3>

          <div className="space-y-1">
            <DetailRow label="Email" value={user?.email || '—'} loading={loading} />

            {isEditing ? (
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-white/60">Phone</span>
                <input
                  type="tel"
                  value={editFields.phoneNumber}
                  onChange={(e) => setEditFields(f => ({ ...f, phoneNumber: e.target.value }))}
                  className="text-sm font-medium text-white text-right bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 w-40 focus:outline-none focus:border-emerald-500/50"
                  placeholder="+44 7..."
                />
              </div>
            ) : (
              <DetailRow label="Phone" value={dashboardData?.phoneNumber || '—'} loading={loading} />
            )}

            <DetailRow label="Premium" value={premiumAmount !== '—' ? `£${premiumAmount}` : '—'} loading={loading} />
            <DetailRow label="Member ID" value={displayPolicyNumber} loading={loading} />
            <DetailRow label="Member since" value={memberSince} loading={loading} />
            {(loading || dashboardData?.age) && (
              <DetailRow label="Age" value={dashboardData?.age ? String(dashboardData.age) : '—'} loading={loading} />
            )}
            {(loading || dashboardData?.postcode) && (
              <DetailRow label="Postcode" value={dashboardData?.postcode ?? '—'} loading={loading} />
            )}
            {(loading || dashboardData?.annualMileage) && (
              <DetailRow label="Annual Mileage" value={dashboardData?.annualMileage ?? '—'} loading={loading} />
            )}
            {(loading || dashboardData?.currentInsurer) && (
              <DetailRow label="Current Insurer" value={dashboardData?.currentInsurer ?? '—'} loading={loading} />
            )}
          </div>
        </div>

        {/* Vehicle Information */}
        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span>🚗</span>
            Vehicle
          </h3>

          {isEditing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Make</span>
                <input
                  type="text"
                  value={editFields.vehicleMake}
                  onChange={(e) => setEditFields(f => ({ ...f, vehicleMake: e.target.value }))}
                  className="text-sm font-medium text-white text-right bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 w-40 focus:outline-none focus:border-emerald-500/50"
                  placeholder="e.g. Toyota"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Model</span>
                <input
                  type="text"
                  value={editFields.vehicleModel}
                  onChange={(e) => setEditFields(f => ({ ...f, vehicleModel: e.target.value }))}
                  className="text-sm font-medium text-white text-right bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 w-40 focus:outline-none focus:border-emerald-500/50"
                  placeholder="e.g. Corolla"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Year</span>
                <input
                  type="number"
                  value={editFields.vehicleYear}
                  onChange={(e) => setEditFields(f => ({ ...f, vehicleYear: e.target.value }))}
                  className="text-sm font-medium text-white text-right bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 w-24 focus:outline-none focus:border-emerald-500/50"
                  placeholder="2024"
                  min="1980"
                  max={new Date().getFullYear() + 1}
                />
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : dashboardData?.vehicle?.make ? (
            <div className="space-y-1">
              <DetailRow label="Make" value={dashboardData.vehicle.make} />
              <DetailRow label="Model" value={dashboardData.vehicle.model || '--'} />
              <DetailRow label="Year" value={dashboardData.vehicle.year ? String(dashboardData.vehicle.year) : '--'} />
            </div>
          ) : (
            <p className="text-sm text-white/50">
              No vehicle added yet. Tap Edit to add your car details.
            </p>
          )}
        </div>

        <CoverageTypeSection
          currentScore={currentScore}
          coverageType={dashboardData?.coverageType ?? null}
          premiumAmount={dashboardData?.premiumAmount ?? 0}
          loading={loading}
        />

        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span>📊</span>
            Driving Statistics
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <StatCard value={totalMiles > 0 ? totalMiles.toFixed(1) : '—'} label="Total Miles" loading={loading} />
            <StatCard value={totalTrips} label="Total Trips" loading={loading} />
            <StatCard value={scoreBreakdown ? scoreBreakdown.braking : '—'} label="Braking Score" loading={loading} />
            <StatCard value={scoreBreakdown ? scoreBreakdown.speed : '—'} label="Speed Score" loading={loading} />
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span>⚙️</span>
            Preferences
          </h3>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-2">
              <div>
                <div className="text-sm font-medium text-white">Location Tracking</div>
                <div className="text-xs text-white/50">Required for trip recording</div>
              </div>
              <motion.button
                onClick={() => setLocationTracking(!locationTracking)}
                className={`w-12 h-7 rounded-full transition-colors duration-200 relative ${locationTracking ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-md"
                  animate={{ left: locationTracking ? 24 : 4 }}
                  transition={{ duration: timing.interaction / 1000, ease: easing.button }}
                />
              </motion.button>
            </div>
            <div className="flex justify-between items-center py-2">
              <div>
                <div className="text-sm font-medium text-white">Push Notifications</div>
                <div className="text-xs text-white/50">Trip summaries and alerts</div>
              </div>
              <motion.button
                onClick={() => setPushNotifications(!pushNotifications)}
                className={`w-12 h-7 rounded-full transition-colors duration-200 relative ${pushNotifications ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-md"
                  animate={{ left: pushNotifications ? 24 : 4 }}
                  transition={{ duration: timing.interaction / 1000, ease: easing.button }}
                />
              </motion.button>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span>🔒</span>
            Privacy & Data
          </h3>

          <p className="text-xs text-white/40 mb-3">
            Your data is used only for your score and refund. We don't sell it. Trip data is encrypted in transit and at rest.
          </p>

          <button
            onClick={() => setLocation('/trust')}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors mb-3"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <div className="text-left">
                <p className="text-sm font-medium text-white">Trust Centre</p>
                <p className="text-xs text-white/50">FCA · GDPR · Your Rights</p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-indigo-300 -rotate-90" />
          </button>

          <div className="space-y-3">
            <PolicyDownload
              userId={user?.id ? parseInt(user.id, 10) || 0 : 0}
              userData={{
                id: 0,
                email: user?.email || '',
                username: user?.name || '',
                premiumAmount: premiumAmount,
                policyNumber: displayPolicyNumber
              } as any}
              policyNumber={displayPolicyNumber}
            />
            <ExportDataButton userId={user?.id ?? ''} />
            <div className="border-t border-white/5 pt-3">
              <DeleteAccount userId={user?.id ?? ''} />
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
