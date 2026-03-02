import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { item } from '@/lib/animations';

interface KPICardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  delta?: { value: string; positive: boolean } | null;
  loading?: boolean;
}

export function KPICard({ label, value, icon, delta, loading }: KPICardProps) {
  return (
    <motion.div
      variants={item}
      className="dashboard-glass-card flex flex-col gap-2 min-w-[160px] flex-1"
    >
      <div className="flex items-center justify-between">
        <span className="text-white/50 text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
        {icon && <span className="text-cyan-400/70">{icon}</span>}
      </div>
      {loading ? (
        <div className="h-8 w-24 rounded bg-white/5 animate-pulse" />
      ) : (
        <span className="text-2xl font-bold text-white tracking-tight">
          {value}
        </span>
      )}
      {delta && (
        <span
          className={`text-xs font-medium ${
            delta.positive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {delta.positive ? '+' : ''}{delta.value}
        </span>
      )}
    </motion.div>
  );
}
