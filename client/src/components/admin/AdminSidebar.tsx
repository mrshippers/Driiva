import { useLocation } from 'wouter';
import {
  LayoutDashboard,
  Users,
  Navigation,
  MessageSquare,
  Activity,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';
import driivaLogoPath from '@/assets/driiva-logo-CLEAR-FINAL.png';

const navItems = [
  { path: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/trips', label: 'Trips', icon: Navigation },
  { path: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
  { path: '/admin/system', label: 'System', icon: Activity },
] as const;

function isActive(current: string, path: string, exact?: boolean) {
  if (exact) return current === path;
  return current.startsWith(path);
}

interface AdminSidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function AdminSidebar({ mobileOpen, onClose }: AdminSidebarProps) {
  const [location, setLocation] = useLocation();

  const nav = (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <img src={driivaLogoPath} alt="Driiva" className="h-7 w-auto" />
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/50"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2 mt-2 pl-5">
        Admin
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ path, label, icon: Icon, exact }) => {
          const active = isActive(location, path, exact);
          return (
            <button
              key={path}
              onClick={() => {
                setLocation(path);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-6 mt-auto">
        <button
          onClick={() => setLocation('/dashboard')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to App
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:fixed lg:inset-y-0 bg-[#0a0f1e]/80 backdrop-blur-xl border-r border-white/[0.06] z-30">
        {nav}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <aside className="relative w-64 h-full bg-[#0a0f1e] border-r border-white/[0.06]">
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden fixed top-4 left-4 z-30 p-2 rounded-xl bg-[#1E293B]/60 backdrop-blur-lg border border-white/[0.08] text-white/60 hover:text-white"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
