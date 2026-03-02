import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { container, item } from '@/lib/animations';

interface SyncLog {
  date: string;
  timestamp: Date | null;
  successCount: number;
  failureCount: number;
  hasFailures: boolean;
}

function toDate(val: Timestamp | { seconds: number } | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  return null;
}

function formatTimestamp(d: Date | null): string {
  if (!d) return '--';
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function getLast7Dates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function AdminSystem() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        const dates = getLast7Dates();
        const results: SyncLog[] = [];

        for (const dateStr of dates) {
          try {
            const snap = await getDocs(collection(db, 'systemLogs', dateStr, 'damoovSync'));
            let successCount = 0;
            let failureCount = 0;
            let latestTs: Date | null = null;

            snap.docs.forEach((doc) => {
              const d = doc.data();
              successCount += d.successCount || d.success || 0;
              failureCount += d.failureCount || d.failures || 0;
              const ts = toDate(d.timestamp);
              if (ts && (!latestTs || ts > latestTs)) latestTs = ts;
            });

            results.push({
              date: dateStr,
              timestamp: latestTs,
              successCount,
              failureCount,
              hasFailures: failureCount > 0,
            });
          } catch {
            results.push({
              date: dateStr,
              timestamp: null,
              successCount: 0,
              failureCount: 0,
              hasFailures: false,
            });
          }
        }

        setLogs(results);
      } catch (err) {
        console.error('[AdminSystem] load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AdminLayout title="System Health" subtitle="Damoov sync diagnostics">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        <div className="dashboard-glass-card overflow-hidden !p-0">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-medium text-white/60">Damoov Sync — Last 7 Days</h3>
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
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Last Sync</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Successes</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Failures</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <motion.tr
                      key={log.date}
                      variants={item}
                      className={`border-b border-white/[0.04] transition-colors ${
                        log.hasFailures
                          ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="px-4 py-3 text-white/70 font-mono text-xs">{log.date}</td>
                      <td className="px-4 py-3 text-white/50 whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                      <td className="px-4 py-3 text-emerald-400 tabular-nums">{log.successCount}</td>
                      <td className={`px-4 py-3 tabular-nums ${log.hasFailures ? 'text-amber-400 font-medium' : 'text-white/40'}`}>
                        {log.failureCount}
                      </td>
                      <td className="px-4 py-3">
                        {log.timestamp === null && log.successCount === 0 ? (
                          <span className="text-white/30 text-xs">No data</span>
                        ) : log.hasFailures ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-amber-500/15 text-amber-400 border-amber-500/25">
                            Issues
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                            Healthy
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-white/30">
                        No system logs found
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
