import { useState, ReactNode } from 'react';
import { AdminSidebar, MobileMenuButton } from './AdminSidebar';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white pt-safe">
      <AdminSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <MobileMenuButton onClick={() => setMobileOpen(true)} />

      <main className="lg:pl-56">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* pl-14 below lg: the hamburger is `fixed top-4 left-4` and about
              40px square, so it sat on top of the page title - every admin
              page rendered "Live Monitoring" as "e Monitoring" at 375px. */}
          <div className="mb-8 pl-14 lg:pl-0">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-white/60 text-sm mt-1">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
