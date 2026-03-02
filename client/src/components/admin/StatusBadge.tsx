type UserStatus = 'active' | 'dormant' | 'new';

const styles: Record<UserStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  dormant: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  new: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
};

const labels: Record<UserStatus, string> = {
  active: 'Active',
  dormant: 'Dormant',
  new: 'New',
};

interface StatusBadgeProps {
  status: UserStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function deriveUserStatus(
  signupDate: Date | null,
  lastTripDate: Date | null,
  totalTrips: number,
): UserStatus {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (signupDate && now - signupDate.getTime() < sevenDays && totalTrips === 0) {
    return 'new';
  }
  if (lastTripDate && now - lastTripDate.getTime() < sevenDays) {
    return 'active';
  }
  if (!lastTripDate || now - lastTripDate.getTime() > thirtyDays) {
    return 'dormant';
  }
  return 'active';
}
