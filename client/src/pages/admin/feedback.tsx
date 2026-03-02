import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Star, Monitor, Smartphone } from 'lucide-react';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { KPICard } from '@/components/admin/KPICard';
import { container } from '@/lib/animations';

interface FeedbackDoc {
  id: string;
  uid: string;
  rating: number;
  message: string;
  platform: string;
  appVersion: string;
  timestamp: Timestamp | null;
}

function StarDisplay({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${
            star <= count ? 'text-amber-400 fill-amber-400' : 'text-white/15'
          }`}
        />
      ))}
    </div>
  );
}

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '--';
  const d = ts.toDate();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminFeedback() {
  const [feedback, setFeedback] = useState<FeedbackDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  useEffect(() => {
    async function loadFeedback() {
      if (!db) return;
      try {
        const q = query(collection(db, 'feedback'), orderBy('timestamp', 'desc'));
        const snap = await getDocs(q);
        const docs: FeedbackDoc[] = snap.docs.map((doc) => ({
          id: doc.id,
          uid: doc.data().uid ?? '',
          rating: doc.data().rating ?? 0,
          message: doc.data().message ?? '',
          platform: doc.data().platform ?? 'unknown',
          appVersion: doc.data().appVersion ?? '--',
          timestamp: doc.data().timestamp ?? null,
        }));
        setFeedback(docs);
      } catch (err) {
        console.error('[AdminFeedback] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    loadFeedback();
  }, []);

  const stats = useMemo(() => {
    const total = feedback.length;
    const avgRating = total > 0
      ? Math.round(feedback.reduce((s, f) => s + f.rating, 0) / total * 10) / 10
      : 0;
    const positivePercent = total > 0
      ? Math.round(feedback.filter((f) => f.rating >= 4).length / total * 100)
      : 0;
    return { total, avgRating, positivePercent };
  }, [feedback]);

  const filtered = useMemo(() => {
    if (ratingFilter === null) return feedback;
    return feedback.filter((f) => f.rating === ratingFilter);
  }, [feedback, ratingFilter]);

  return (
    <AdminLayout title="Feedback" subtitle="User feedback inbox">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard label="Total Responses" value={stats.total} loading={loading} />
          <KPICard label="Avg Rating" value={`${stats.avgRating} / 5`} loading={loading} />
          <KPICard label="4-5 Stars" value={`${stats.positivePercent}%`} loading={loading} />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Filter:</span>
          {[null, 1, 2, 3, 4, 5].map((r) => (
            <button
              key={r ?? 'all'}
              onClick={() => setRatingFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                ratingFilter === r
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:text-white/70'
              }`}
            >
              {r === null ? 'All' : `${r}\u2605`}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="dashboard-glass-card overflow-hidden !p-0">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-white/40">
              {feedback.length === 0
                ? 'No feedback yet — share the app with beta users'
                : 'No feedback matches this filter'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Rating</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Message</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Platform</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Version</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <StarDisplay count={item.rating} />
                      </td>
                      <td className="px-4 py-3 text-white/80 max-w-md">
                        <p className="line-clamp-2">{item.message || '--'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-white/60">
                          {item.platform === 'web' ? (
                            <Monitor className="w-3.5 h-3.5" />
                          ) : (
                            <Smartphone className="w-3.5 h-3.5" />
                          )}
                          {item.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/50 font-mono text-xs">
                        {item.appVersion}
                      </td>
                      <td className="px-4 py-3 text-white/50 whitespace-nowrap">
                        {formatDate(item.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-white/30 text-xs text-center">
          Showing {filtered.length} of {feedback.length} entries
        </p>
      </motion.div>
    </AdminLayout>
  );
}
