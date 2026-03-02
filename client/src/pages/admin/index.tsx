import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Users, MapPin, Shield, Route, Activity } from 'lucide-react';
import { db } from '@/lib/firebase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { KPICard } from '@/components/admin/KPICard';
import { container } from '@/lib/animations';

interface KPIs {
  totalUsers: number;
  activeUsers: number;
  totalTrips: number;
  avgScore: number;
  totalDistanceKm: number;
}

interface SignupWeek {
  week: string;
  count: number;
}

interface DAUDay {
  date: string;
  count: number;
}

interface PlatformSlice {
  name: string;
  value: number;
}

type SyncHealth = 'green' | 'amber' | 'red';

function toDate(val: Timestamp | { seconds: number } | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  return null;
}

function weekKey(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `W${weekNum}`;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(5, 10);
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

const DONUT_COLORS = ['#22d3ee', '#8b5cf6', '#f59e0b', '#10b981'];

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

export default function AdminOverview() {
  const [kpis, setKpis] = useState<KPIs>({
    totalUsers: 0, activeUsers: 0, totalTrips: 0, avgScore: 0, totalDistanceKm: 0,
  });
  const [signups, setSignups] = useState<SignupWeek[]>([]);
  const [dau, setDau] = useState<DAUDay[]>([]);
  const [platform, setPlatform] = useState<PlatformSlice[]>([]);
  const [syncHealth, setSyncHealth] = useState<SyncHealth>('green');
  const [lastSync, setLastSync] = useState<string>('--');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const users = snap.docs.map((d) => d.data());
      const total = users.length;

      const signupMap = new Map<string, number>();
      const activeSet = new Set<string>();

      users.forEach((u) => {
        const created = toDate(u.createdAt);
        if (created) {
          const wk = weekKey(created);
          signupMap.set(wk, (signupMap.get(wk) || 0) + 1);
        }
      });

      const sortedWeeks = Array.from(signupMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([week, count]) => ({ week, count }));
      setSignups(sortedWeeks);

      setKpis((prev) => ({ ...prev, totalUsers: total }));
    });

    const unsubTrips = onSnapshot(
      query(collectionGroup(db, 'trips'), orderBy('startedAt', 'desc'), limit(5000)),
      (snap) => {
        const trips = snap.docs.map((d) => d.data());
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let totalDist = 0;
        let scoreSum = 0;
        let scoreCount = 0;
        const activeUsers = new Set<string>();
        const dauMap = new Map<string, Set<string>>();

        trips.forEach((t) => {
          totalDist += t.distanceMeters || 0;
          if (typeof t.score === 'number' && t.score > 0) {
            scoreSum += t.score;
            scoreCount++;
          }

          const started = toDate(t.startedAt);
          if (started && started >= thirtyDaysAgo) {
            if (t.userId) activeUsers.add(t.userId);
            const dk = dayKey(started);
            if (!dauMap.has(dk)) dauMap.set(dk, new Set());
            dauMap.get(dk)!.add(t.userId || 'unknown');
          }
        });

        const sortedDau = Array.from(dauMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, users]) => ({ date, count: users.size }));

        setDau(sortedDau);
        setKpis((prev) => ({
          ...prev,
          totalTrips: trips.length,
          avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
          totalDistanceKm: Math.round(totalDist / 1000),
          activeUsers: activeUsers.size,
        }));
        setLoading(false);
      },
    );

    getDocs(collection(db, 'feedback')).then((snap) => {
      const platMap = new Map<string, number>();
      snap.docs.forEach((d) => {
        const p = d.data().platform || 'unknown';
        const normalized =
          p.toLowerCase().includes('ios') ? 'iOS'
          : p.toLowerCase().includes('android') ? 'Android'
          : p.toLowerCase().includes('web') ? 'Web'
          : p;
        platMap.set(normalized, (platMap.get(normalized) || 0) + 1);
      });
      setPlatform(Array.from(platMap.entries()).map(([name, value]) => ({ name, value })));
    });

    loadSyncHealth();

    return () => {
      unsubUsers();
      unsubTrips();
    };
  }, []);

  async function loadSyncHealth() {
    if (!db) return;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    for (const dateStr of [today, yesterday]) {
      try {
        const snap = await getDoc(doc(db, 'systemLogs', dateStr, 'damoovSync', 'latest'));
        if (snap.exists()) {
          const data = snap.data();
          const ts = toDate(data.timestamp);
          if (ts) {
            const hoursAgo = (Date.now() - ts.getTime()) / (1000 * 60 * 60);
            setSyncHealth(hoursAgo < 25 ? 'green' : hoursAgo < 48 ? 'amber' : 'red');
            setLastSync(ts.toLocaleString('en-GB', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            }));
            return;
          }
        }
      } catch {
        // try next date
      }
    }
    setSyncHealth('red');
    setLastSync('No recent sync');
  }

  const healthColors: Record<SyncHealth, { bg: string; text: string; dot: string }> = {
    green: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    amber: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
    red: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
  };
  const hc = healthColors[syncHealth];

  return (
    <AdminLayout title="Overview" subtitle="Executive summary">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KPICard
            label="Total Users"
            value={formatNum(kpis.totalUsers)}
            icon={<Users className="w-4 h-4" />}
            loading={loading}
          />
          <KPICard
            label="Active (30d)"
            value={formatNum(kpis.activeUsers)}
            icon={<Activity className="w-4 h-4" />}
            loading={loading}
          />
          <KPICard
            label="Total Trips"
            value={formatNum(kpis.totalTrips)}
            icon={<Route className="w-4 h-4" />}
            loading={loading}
          />
          <KPICard
            label="Avg Safety Score"
            value={kpis.avgScore}
            icon={<Shield className="w-4 h-4" />}
            loading={loading}
          />
          <KPICard
            label="Distance (km)"
            value={formatNum(kpis.totalDistanceKm)}
            icon={<MapPin className="w-4 h-4" />}
            loading={loading}
          />
        </div>

        {/* Sync health */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${hc.bg} border border-white/[0.06]`}>
          <span className={`w-2 h-2 rounded-full ${hc.dot} ${syncHealth === 'green' ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-medium ${hc.text}`}>
            Damoov sync: {lastSync}
          </span>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Signups over time */}
          <div className="dashboard-glass-card">
            <h3 className="text-sm font-medium text-white/50 mb-4">User Signups by Week</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={signups}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3, fill: '#22d3ee' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* DAU bar chart */}
          <div className="dashboard-glass-card">
            <h3 className="text-sm font-medium text-white/50 mb-4">Daily Active Users (30d)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dau}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Platform donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="dashboard-glass-card lg:col-span-1">
            <h3 className="text-sm font-medium text-white/50 mb-4">Platform Distribution</h3>
            {platform.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-white/20 text-sm">No data</div>
            ) : (
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={platform}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {platform.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {platform.map((p, i) => (
                <div key={p.name} className="flex items-center gap-1.5 text-xs text-white/60">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  {p.name} ({p.value})
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </AdminLayout>
  );
}
