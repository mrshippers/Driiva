import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, Clock,
  Zap, Database, Globe, Brain, TrendingUp, DollarSign,
} from 'lucide-react';
import { collection, query, where, getDocs, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { container, item } from '@/lib/animations';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ============================================================================
// TYPES
// ============================================================================

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  service: string;
  timestamp: string;
  checks?: {
    firestore?: string;
  };
  version?: string;
  region?: string;
}

interface TripMetrics {
  total: number;
  failed: number;
  stuck: number;
  avgLatencyMs: number;
  lastTripAt: Date | null;
  hourlyBreakdown: Array<{ hour: string; count: number; failed: number }>;
}

interface PerformanceMetrics {
  coldStarts: number;
  avgColdStartMs: number;
  p95ColdStartMs: number;
  firestoreLatencyP50: number;
  firestoreLatencyP95: number;
}

interface ClassifierStatus {
  configured: boolean;
  lastSuccess: Date | null;
  avgLatencyMs: number;
  successRate: number;
}

interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  source: 'sentry' | 'watchdog' | 'cloud-monitoring';
}

interface CostTracking {
  aiSpendToday: number;
  aiSpendMonth: number;
  functionsInvocations: number;
  firestoreReads: number;
  firestoreWrites: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toDate(val: Timestamp | { seconds: number } | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  return null;
}

function formatRelative(date: Date | null): string {
  if (!date) return 'Never';
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    fontSize: 12,
    color: '#fff',
  },
  itemStyle: { color: '#94a3b8' },
};

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchSystemHealth(): Promise<SystemHealth> {
  try {
    const res = await fetch('https://europe-west2-driiva.cloudfunctions.net/health');
    if (!res.ok) throw new Error('Health check failed');
    return await res.json();
  } catch {
    return {
      status: 'down',
      service: 'driiva-functions',
      timestamp: new Date().toISOString(),
    };
  }
}

const TRIP_METRICS_ZERO: TripMetrics = {
  total: 0, failed: 0, stuck: 0, avgLatencyMs: 0, lastTripAt: null, hourlyBreakdown: [],
};

async function fetchTripMetrics(): Promise<TripMetrics> {
  if (!db) return TRIP_METRICS_ZERO;

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Total trips in last 24h
    const totalSnap = await getDocs(
      query(
        collection(db, 'trips'),
        where('startedAt', '>=', Timestamp.fromDate(twentyFourHoursAgo)),
      )
    );

    const trips = totalSnap.docs.map(d => d.data());
    const failed = trips.filter(t => t.status === 'failed').length;

    // Stuck trips (in processing for > 1 hour)
    const stuckSnap = await getDocs(
      query(
        collection(db, 'trips'),
        where('status', '==', 'processing'),
        where('startedAt', '<=', Timestamp.fromDate(oneHourAgo)),
        limit(100)
      )
    );

    // Last trip timestamp
    const lastTripSnap = await getDocs(
      query(
        collection(db, 'trips'),
        orderBy('startedAt', 'desc'),
        limit(1)
      )
    );
    const lastTripAt = lastTripSnap.docs[0] ? toDate(lastTripSnap.docs[0].data().startedAt) : null;

    // Hourly breakdown (last 24 hours)
    const hourlyMap = new Map<string, { count: number; failed: number }>();
    trips.forEach(t => {
      const started = toDate(t.startedAt);
      if (started) {
        const hourKey = `${started.getHours()}:00`;
        const entry = hourlyMap.get(hourKey) || { count: 0, failed: 0 };
        entry.count++;
        if (t.status === 'failed') entry.failed++;
        hourlyMap.set(hourKey, entry);
      }
    });

    const hourlyBreakdown = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

    return {
      total: trips.length,
      failed,
      stuck: stuckSnap.size,
      avgLatencyMs: 0, // TODO: Parse from [metric] trip_pipeline logs when available
      lastTripAt,
      hourlyBreakdown,
    };
  } catch {
    return TRIP_METRICS_ZERO;
  }
}

const COST_TRACKING_ZERO: CostTracking = {
  aiSpendToday: 0, aiSpendMonth: 0, functionsInvocations: 0, firestoreReads: 0, firestoreWrites: 0,
};

async function fetchCostTracking(): Promise<CostTracking> {
  if (!db) return COST_TRACKING_ZERO;

  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // AI usage tracking
    const [todaySnap, monthSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'aiUsageTracking'),
          where('calledAt', '>=', Timestamp.fromDate(startOfToday))
        )
      ),
      getDocs(
        query(
          collection(db, 'aiUsageTracking'),
          where('calledAt', '>=', Timestamp.fromDate(startOfMonth))
        )
      ),
    ]);

    const aiSpendToday = todaySnap.docs.reduce((sum, d) => sum + (d.data().estimatedCostCents || 0), 0);
    const aiSpendMonth = monthSnap.docs.reduce((sum, d) => sum + (d.data().estimatedCostCents || 0), 0);

    return {
      aiSpendToday: aiSpendToday / 100, // Convert cents to pounds
      aiSpendMonth: aiSpendMonth / 100,
      functionsInvocations: 0, // TODO: Query Cloud Monitoring API
      firestoreReads: 0, // TODO: Query Cloud Monitoring API
      firestoreWrites: 0, // TODO: Query Cloud Monitoring API
    };
  } catch {
    return COST_TRACKING_ZERO;
  }
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  status?: 'good' | 'warning' | 'critical';
  subtitle?: string;
}

function MetricCard({ label, value, icon, status = 'good', subtitle }: MetricCardProps) {
  const statusColors = {
    good: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
  };

  return (
    <motion.div variants={item} className="dashboard-glass-card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs text-white/40 mb-1">{label}</div>
          <div className={`text-2xl font-bold ${statusColors[status]}`}>
            {value}
          </div>
          {subtitle && (
            <div className="text-xs text-white/30 mt-1">{subtitle}</div>
          )}
        </div>
        <div className="p-2 rounded-lg bg-white/5">
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

interface StatusBadgeProps {
  status: 'healthy' | 'degraded' | 'down';
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    healthy: { label: 'Healthy', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25' },
    degraded: { label: 'Degraded', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25' },
    down: { label: 'Down', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25' },
  };

  const c = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
      {status === 'healthy' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'degraded' && <AlertTriangle className="w-3 h-3" />}
      {status === 'down' && <XCircle className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MonitoringDashboard() {
  const { data: health, isPending: healthPending } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 30000, // 30 seconds
  });

  const { data: tripMetrics, isPending: tripsPending } = useQuery({
    queryKey: ['trip-metrics'],
    queryFn: fetchTripMetrics,
    refetchInterval: 60000, // 1 minute
  });

  const { data: costs, isPending: costsPending } = useQuery({
    queryKey: ['cost-tracking'],
    queryFn: fetchCostTracking,
    refetchInterval: 300000, // 5 minutes
  });

  // Show spinner only while ALL queries are on their very first fetch.
  // If any one resolves (data or error), render the page immediately.
  const isInitialLoad = healthPending && tripsPending && costsPending;

  if (isInitialLoad) {
    return (
      <AdminLayout title="Live Monitoring" subtitle="System health & performance metrics">
        <div className="flex items-center justify-center py-24">
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Live Monitoring" subtitle="Real-time system health & observability">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        {/* System Health */}
        <div className="dashboard-glass-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">System Health</h3>
            <StatusBadge status={health?.status || 'down'} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-xs text-white/40 mb-1">Cloud Functions</div>
              <div className="text-sm font-medium text-white/80">{health?.checks?.firestore || 'Unknown'}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-xs text-white/40 mb-1">Last Trip</div>
              <div className="text-sm font-medium text-white/80">{formatRelative(tripMetrics?.lastTripAt || null)}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-xs text-white/40 mb-1">Region</div>
              <div className="text-sm font-medium text-white/80">{health?.region || 'europe-west2'}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-xs text-white/40 mb-1">Version</div>
              <div className="text-sm font-medium text-white/80">{health?.version || 'unknown'}</div>
            </div>
          </div>
        </div>

        {/* Trip Pipeline Metrics */}
        <div className="dashboard-glass-card">
          <h3 className="text-lg font-semibold mb-6">Trip Pipeline (Last 24h)</h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="Total Processed"
              value={tripMetrics?.total || 0}
              icon={<Activity className="w-4 h-4 text-cyan-400" />}
              status="good"
            />
            <MetricCard
              label="Failed Trips"
              value={tripMetrics?.failed || 0}
              icon={<XCircle className="w-4 h-4 text-red-400" />}
              status={(tripMetrics?.failed || 0) > 5 ? 'critical' : 'good'}
            />
            <MetricCard
              label="Stuck (>1hr)"
              value={tripMetrics?.stuck || 0}
              icon={<Clock className="w-4 h-4 text-amber-400" />}
              status={(tripMetrics?.stuck || 0) > 0 ? 'warning' : 'good'}
            />
            <MetricCard
              label="Avg Latency"
              value={tripMetrics?.avgLatencyMs ? `${tripMetrics.avgLatencyMs}ms` : 'N/A'}
              icon={<Zap className="w-4 h-4 text-purple-400" />}
              status="good"
              subtitle="Pipeline duration"
            />
          </div>

          {tripMetrics?.hourlyBreakdown && tripMetrics.hourlyBreakdown.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tripMetrics.hourlyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Cost Tracking */}
        <div className="dashboard-glass-card">
          <h3 className="text-lg font-semibold mb-6">Cost Tracking</h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard
              label="AI Spend (Today)"
              value={`£${costs?.aiSpendToday.toFixed(2) || '0.00'}`}
              icon={<Brain className="w-4 h-4 text-purple-400" />}
              status="good"
            />
            <MetricCard
              label="AI Spend (Month)"
              value={`£${costs?.aiSpendMonth.toFixed(2) || '0.00'}`}
              icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
              status={((costs?.aiSpendMonth || 0) > 50) ? 'warning' : 'good'}
            />
            <MetricCard
              label="Function Invocations"
              value={costs?.functionsInvocations.toLocaleString() || 'N/A'}
              icon={<Zap className="w-4 h-4 text-amber-400" />}
              status="good"
              subtitle="Billable calls"
            />
          </div>
        </div>

        {/* Coming Soon Placeholders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="dashboard-glass-card opacity-50">
            <h3 className="text-lg font-semibold mb-4">Performance Vitals</h3>
            <div className="text-sm text-white/40">
              Coming soon: Cold start metrics, Firestore latency, Web Vitals from Vercel
            </div>
          </div>

          <div className="dashboard-glass-card opacity-50">
            <h3 className="text-lg font-semibold mb-4">Classifier Status</h3>
            <div className="text-sm text-white/40">
              Coming soon: Python classifier health, latency, success rate
            </div>
          </div>
        </div>

        <div className="dashboard-glass-card opacity-50">
          <h3 className="text-lg font-semibold mb-4">Recent Alerts & Incidents</h3>
          <div className="text-sm text-white/40">
            Coming soon: Sentry issues, Cloud Monitoring alerts, Watchdog warnings
          </div>
        </div>
      </motion.div>
    </AdminLayout>
  );
}
