import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  collection, getDocs, Timestamp,
} from 'firebase/firestore';
import { Search, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '@/lib/firebase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatusBadge, deriveUserStatus } from '@/components/admin/StatusBadge';
import { ScoreSparkline } from '@/components/admin/ScoreSparkline';

interface UserRow {
  uid: string;
  email: string;
  signupDate: Date | null;
  platform: string;
  totalTrips: number;
  avgScore: number;
  lastActive: Date | null;
  status: 'active' | 'dormant' | 'new';
  scoreBreakdown: {
    braking: number;
    acceleration: number;
    speeding: number;
    phone: number;
  } | null;
  totalDistance: number;
  weeklyScoreTrend: number[];
}

type SortField = 'email' | 'signupDate' | 'totalTrips' | 'avgScore' | 'lastActive';
type SortDir = 'asc' | 'desc';

function toDate(val: Timestamp | { seconds: number } | Date | string | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  return null;
}

function formatDate(d: Date | null): string {
  if (!d) return '--';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(d: Date | null): string {
  if (!d) return '--';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('signupDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const rows: UserRow[] = snap.docs.map((doc) => {
          const d = doc.data();
          const dp = d.drivingProfile || {};
          const signupDate = toDate(d.createdAt);
          const lastActive = toDate(dp.lastTripDate || d.lastActive);
          const totalTrips = dp.totalTrips || 0;

          return {
            uid: doc.id,
            email: d.email || '--',
            signupDate,
            platform: d.platform || d.devicePlatform || '--',
            totalTrips,
            avgScore: dp.currentScore || dp.score || 0,
            lastActive,
            status: deriveUserStatus(signupDate, lastActive, totalTrips),
            scoreBreakdown: dp.scoreBreakdown ? {
              braking: dp.scoreBreakdown.braking ?? 0,
              acceleration: dp.scoreBreakdown.acceleration ?? 0,
              speeding: dp.scoreBreakdown.speeding ?? 0,
              phone: dp.scoreBreakdown.phone ?? 0,
            } : null,
            totalDistance: dp.totalMiles ? Math.round(dp.totalMiles * 1.60934) : Math.round((dp.totalDistanceMeters || 0) / 1000),
            weeklyScoreTrend: dp.weeklyScoreTrend || [],
          };
        });
        setUsers(rows);
      } catch (err) {
        console.error('[AdminUsers] load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredSorted = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.email.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'email': cmp = a.email.localeCompare(b.email); break;
        case 'signupDate': cmp = (a.signupDate?.getTime() || 0) - (b.signupDate?.getTime() || 0); break;
        case 'totalTrips': cmp = a.totalTrips - b.totalTrips; break;
        case 'avgScore': cmp = a.avgScore - b.avgScore; break;
        case 'lastActive': cmp = (a.lastActive?.getTime() || 0) - (b.lastActive?.getTime() || 0); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [users, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function exportCSV() {
    const header = 'Email,Signup Date,Platform,Total Trips,Avg Score,Last Active,Status\n';
    const rows = filteredSorted
      .map((u) =>
        [u.email, formatDate(u.signupDate), u.platform, u.totalTrips, u.avgScore, formatDate(u.lastActive), u.status].join(','),
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driiva-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 inline ml-0.5" />
      : <ChevronUp className="w-3 h-3 inline ml-0.5" />;
  }

  return (
    <AdminLayout title="Users" subtitle={`${users.length} registered users`}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/40"
          />
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="dashboard-glass-card overflow-hidden !p-0">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  {([
                    ['email', 'Email'],
                    ['signupDate', 'Signup'],
                    ['platform' as SortField, 'Platform'],
                    ['totalTrips', 'Trips'],
                    ['avgScore', 'Avg Score'],
                    ['lastActive', 'Last Active'],
                    ['status' as SortField, 'Status'],
                  ] as [SortField | string, string][]).map(([field, label]) => (
                    <th
                      key={field}
                      onClick={() => ['email', 'signupDate', 'totalTrips', 'avgScore', 'lastActive'].includes(field) ? toggleSort(field as SortField) : undefined}
                      className={`text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider ${
                        ['email', 'signupDate', 'totalTrips', 'avgScore', 'lastActive'].includes(field)
                          ? 'cursor-pointer hover:text-white/70'
                          : ''
                      }`}
                    >
                      {label}
                      {['email', 'signupDate', 'totalTrips', 'avgScore', 'lastActive'].includes(field) && (
                        <SortIcon field={field as SortField} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((u) => (
                  <UserRowGroup
                    key={u.uid}
                    user={u}
                    expanded={expandedUid === u.uid}
                    onToggle={() => setExpandedUid(expandedUid === u.uid ? null : u.uid)}
                  />
                ))}
                {filteredSorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-white/30">
                      No users match your search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function UserRowGroup({
  user: u,
  expanded,
  onToggle,
}: {
  user: UserRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
      >
        <td className="px-4 py-3 text-white/80 font-mono text-xs">{u.email}</td>
        <td className="px-4 py-3 text-white/50 whitespace-nowrap">{formatDate(u.signupDate)}</td>
        <td className="px-4 py-3 text-white/50 capitalize">{u.platform}</td>
        <td className="px-4 py-3 text-white/70 tabular-nums">{u.totalTrips}</td>
        <td className="px-4 py-3 text-white/70 tabular-nums">{u.avgScore || '--'}</td>
        <td className="px-4 py-3 text-white/50 whitespace-nowrap">{formatShortDate(u.lastActive)}</td>
        <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={7} className="px-0 py-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-6 py-4 bg-white/[0.02] border-b border-white/[0.06]">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">Braking</span>
                      <p className="text-lg font-semibold text-white/90">{u.scoreBreakdown?.braking ?? '--'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">Acceleration</span>
                      <p className="text-lg font-semibold text-white/90">{u.scoreBreakdown?.acceleration ?? '--'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">Speeding</span>
                      <p className="text-lg font-semibold text-white/90">{u.scoreBreakdown?.speeding ?? '--'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">Phone Usage</span>
                      <p className="text-lg font-semibold text-white/90">{u.scoreBreakdown?.phone ?? '--'}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">Total Distance</span>
                      <p className="text-sm text-white/70">{u.totalDistance.toLocaleString()} km</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">Score Trend (7d)</span>
                      <div className="w-32">
                        <ScoreSparkline data={u.weeklyScoreTrend} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}
