import { useLocation } from 'wouter';
import { ArrowLeft, Shield, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { PageWrapper } from '../components/PageWrapper';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { useActivePolicy } from '../hooks/useActivePolicy';
import { DEFAULT_DRIVING_PROFILE } from '../../../shared/firestore-types';
import { projectedRefundCents } from '../../../shared/refundCalculator';

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white/[0.08] rounded ${className}`} />
  );
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  if (!amount) return '—';
  return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getScoreColor(score: number): string {
  if (score < 60) return 'text-red-400';
  if (score < 80) return 'text-amber-400';
  return 'text-emerald-400';
}

function getScoreLabel(score: number): string {
  if (score < 60) return 'Needs Improvement';
  if (score < 80) return 'Above Average';
  return 'Excellent';
}

function calculateProjectedRefund(score: number, premiumCents: number): number {
  return projectedRefundCents(score, premiumCents);
}

export default function PolicyPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const userId = user?.id || null;
  const { userDoc, loading: userLoading, error: userError, refresh: refreshUser } = useUserProfile(userId);
  const { policy, loading: policyLoading, refresh: refreshPolicy } = useActivePolicy(userId);

  const loading = userLoading || policyLoading;
  const error = userError;
  const refresh = () => { refreshUser(); refreshPolicy(); };

  const profile = userDoc?.drivingProfile || DEFAULT_DRIVING_PROFILE;
  const policyNumber = policy?.policyNumber || null;
  const premiumCents = policy?.currentPremiumCents || userDoc?.activePolicy?.premiumCents || 0;
  const premiumAmount = premiumCents / 100;
  const currentScore = Math.round(profile.currentScore);
  const totalTrips = profile.totalTrips;
  const totalMiles = Math.round(profile.totalMiles);
  const projectedRefund = calculateProjectedRefund(profile.currentScore, premiumCents);
  const renewalDate = policy?.renewalDate?.toDate() || userDoc?.activePolicy?.renewalDate?.toDate() || null;

  const refundRate = currentScore >= 70
    ? (((currentScore - 70) / 30 * 10 + 5)).toFixed(2)
    : '0.00';

  const policyStart = renewalDate
    ? new Date(renewalDate.getFullYear() - 1, renewalDate.getMonth(), renewalDate.getDate())
    : null;

  if (error && !userDoc) {
    return (
      <PageWrapper>
        <div className="pb-24 text-white flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <span className="text-4xl">⚠️</span>
          <p className="text-white/70 text-sm font-medium">Could not load policy details.</p>
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
      <div className="pb-24 text-white">
        <button
          onClick={() => setLocation('/dashboard')}
          className="flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold">Insurance Policy Details</h1>
          </div>

          <div className="grid gap-6 mb-8">
            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.05] rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-3 text-blue-300">Policy Information</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Policy Number:</span>
                  {loading ? (
                    <Skeleton className="h-5 w-32" />
                  ) : (
                    <span className="text-white">{policyNumber ?? '—'}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Policy Start:</span>
                  {loading ? (
                    <Skeleton className="h-5 w-36" />
                  ) : (
                    <span className="text-white">{formatDate(policyStart)}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Renewal Date:</span>
                  {loading ? (
                    <Skeleton className="h-5 w-36" />
                  ) : (
                    <span className="text-white">{formatDate(renewalDate)}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Annual Premium:</span>
                  {loading ? (
                    <Skeleton className="h-5 w-24" />
                  ) : (
                    <span className="text-white font-semibold">{formatCurrency(premiumAmount)}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Projected Refund:</span>
                  {loading ? (
                    <Skeleton className="h-5 w-24" />
                  ) : (
                    <span className="text-green-400 font-semibold">
                      {projectedRefund > 0 ? formatCurrency(projectedRefund) : '—'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.05] rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-3 text-purple-300">Coverage Details</h3>
              <div className="space-y-3">
                {['Comprehensive Coverage', 'Third Party Liability', 'Personal Injury Protection', 'Telematics Monitoring', '24/7 Roadside Assistance'].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.05] rounded-xl p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4 text-orange-300 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Driiva Telematics Program
            </h3>
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="text-center">
                    <Skeleton className="h-8 w-12 mx-auto mb-2" />
                    <Skeleton className="h-3 w-16 mx-auto mb-1" />
                    <Skeleton className="h-3 w-20 mx-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${getScoreColor(currentScore)}`}>
                    {totalTrips > 0 ? currentScore : '—'}
                  </div>
                  <div className="text-sm text-gray-400">Current Score</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {totalTrips > 0 ? getScoreLabel(currentScore) : 'No trips yet'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{refundRate}%</div>
                  <div className="text-sm text-gray-400">Refund Rate</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {projectedRefund > 0 ? `${formatCurrency(projectedRefund)} projected` : '—'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">{totalTrips}</div>
                  <div className="text-sm text-gray-400">Monitored Trips</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {totalMiles > 0 ? `${totalMiles.toLocaleString()} miles` : '—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Refund timeline trust line */}
          <div className="backdrop-blur-xl bg-emerald-500/[0.06] border border-emerald-500/[0.15] rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-200/80 text-center">
              Refunds are calculated at the end of each period and paid out within 14 days of the period close.
            </p>
          </div>

          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.05] rounded-xl p-6">
            <h3 className="text-xl font-semibold mb-4 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Important Policy Terms
            </h3>
            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <h4 className="font-semibold text-white mb-2">Telematics Requirements</h4>
                <p>Your driving data is collected via mobile app GPS and sensors. Maintaining a score of 70+ qualifies you for refunds ranging from 5% to 15% of your annual premium.</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Refund Calculation</h4>
                <p>Refunds are calculated monthly based on your personal driving score (80% weight) and community pool performance (20% weight). Refunds are processed quarterly.</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Data Privacy</h4>
                <p>All driving data is encrypted and used solely for insurance scoring purposes. You can request data export or deletion at any time through your profile settings.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
