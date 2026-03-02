import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  collectionGroup, getDocs, query, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Route, Clock, Gauge, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { KPICard } from '@/components/admin/KPICard';
import { container } from '@/lib/animations';

interface TripRow {
  id: string;
  userId: string;
  userEmail: string;
  date: Date | null;
  distanceKm: number;
  durationMin: number;
  score: number;
  hardEvents: number;
}

interface ScoreBucket {
  range: string;
  count: number;
}

function toDate(val: Timestamp | { seconds: number } | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  return null;
}

function formatDate(d: Date | null): string {
  if (!d) return '--';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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

export default function AdminTrips() {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        const q = query(
          collectionGroup(db, 'trips'),
          orderBy('startedAt', 'desc'),
          limit(100),
        );
        const snap = await getDocs(q);
        const rows: TripRow[] = snap.docs.map((doc) => {
          const d = doc.data();
          const events = d.events || {};
          return {
            id: doc.id,
            userId: d.userId || doc.ref.parent.parent?.id || '--',
            userEmail: d.userEmail || d.userId || '--',
            date: toDate(d.startedAt),
            distanceKm: Math.round((d.distanceMeters || 0) / 1000 * 10) / 10,
            durationMin: Math.round((d.durationSeconds || 0) / 60),
            score: d.score || 0,
            hardEvents: (events.hardBraking || 0) + (events.hardAcceleration || 0),
          };
        });
        setTrips(rows);
      } catch (err) {
        console.error('[AdminTrips] load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    let today = 0;
    let week = 0;
    let distSum = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    trips.forEach((t) => {
      if (t.date && t.date >= startOfToday) today++;
      if (t.date && t.date >= sevenDaysAgo) week++;
      distSum += t.distanceKm;
      if (t.score > 0) { scoreSum += t.score; scoreCount++; }
    });

    return {
      today,
      week,
      avgDist: trips.length > 0 ? Math.round(distSum / trips.length * 10) / 10 : 0,
      avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
    };
  }, [trips]);

  const scoreDist = useMemo<ScoreBucket[]>(() => {
    const buckets = [
      { range: '0-20', min: 0, max: 20, count: 0 },
      { range: '21-40', min: 21, max: 40, count: 0 },
      { range: '41-60', min: 41, max: 60, count: 0 },
      { range: '61-80', min: 61, max: 80, count: 0 },
      { range: '81-100', min: 81, max: 100, count: 0 },
    ];
    trips.forEach((t) => {
      if (t.score <= 0) return;
      const b = buckets.find((b) => t.score >= b.min && t.score <= b.max);
      if (b) b.count++;
    });
    return buckets.map(({ range, count }) => ({ range, count }));
  }, [trips]);

  const bucketColors = ['#ef4444', '#f59e0b', '#eab308', '#22d3ee', '#10b981'];

  return (
    <AdminLayout title="Trip Intelligence" subtitle="Fleet-wide trip analytics">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Trips Today" value={stats.today} icon={<Route className="w-4 h-4" />} loading={loading} />
          <KPICard label="Trips This Week" value={stats.week} icon={<Clock className="w-4 h-4" />} loading={loading} />
          <KPICard label="Avg Distance (km)" value={stats.avgDist} icon={<Gauge className="w-4 h-4" />} loading={loading} />
          <KPICard label="Avg Safety Score" value={stats.avgScore} icon={<AlertTriangle className="w-4 h-4" />} loading={loading} />
        </div>

        {/* Score distribution */}
        <div className="dashboard-glass-card">
          <h3 className="text-sm font-medium text-white/50 mb-4">Fleet Risk Profile — Score Distribution</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreDist.map((_, i) => (
                    <Cell key={i} fill={bucketColors[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent trips table */}
        <div className="dashboard-glass-card overflow-hidden !p-0">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-medium text-white/60">Recent Trips (last 100)</h3>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Distance</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Duration</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Score</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Hard Events</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3 text-white/70 font-mono text-xs max-w-[200px] truncate">{t.userEmail}</td>
                      <td className="px-4 py-3 text-white/50 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-4 py-3 text-white/70 tabular-nums">{t.distanceKm} km</td>
                      <td className="px-4 py-3 text-white/70 tabular-nums">{t.durationMin} min</td>
                      <td className="px-4 py-3">
                        <span className={`tabular-nums font-medium ${
                          t.score >= 80 ? 'text-emerald-400' :
                          t.score >= 60 ? 'text-amber-400' :
                          t.score > 0 ? 'text-red-400' :
                          'text-white/30'
                        }`}>
                          {t.score || '--'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60 tabular-nums">{t.hardEvents}</td>
                    </tr>
                  ))}
                  {trips.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-white/30">
                        No trips recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </AdminLayout>
  );
}
