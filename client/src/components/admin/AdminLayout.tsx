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
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-white/40 text-sm mt-1">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
