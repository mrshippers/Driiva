import { useLocation } from 'wouter';

export default function BottomNavigation() {
  const [location, navigate] = useLocation();

  const navItems = [
    { 
      path: '/dashboard', 
      icon: HomeIcon, 
      label: 'Home'
    },
    { 
      path: '/trips', 
      icon: TripsIcon, 
      label: 'Trips'
    },
    { 
      path: '/rewards', 
      icon: RewardsIcon, 
      label: 'Rewards'
    },
    { 
      path: '/profile', 
      icon: ProfileIcon, 
      label: 'Profile'
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Glassmorphic background */}
      <div className="backdrop-blur-2xl bg-gradient-to-t from-[#0F172A]/95 via-[#0F172A]/90 to-[#0F172A]/80 
                    border-t border-white/[0.08]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      >
        <div className="flex items-center justify-around h-20 max-w-md mx-auto px-4">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-1.5 
                         transition-all duration-300 relative group min-h-[44px] min-w-[44px]"
              >
                {/* Glass icon container */}
                <div className={`
                  relative w-12 h-12 rounded-2xl transition-all duration-300
                  ${isActive 
                    ? 'scale-110 shadow-lg' 
                    : 'scale-100 opacity-60 group-hover:opacity-100 group-hover:scale-105'
                  }
                `}>
                  {/* Background gradient - emerald only */}
                  <div className={`
                    absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600
                    ${isActive ? 'opacity-20' : 'opacity-10'}
                    transition-opacity duration-300
                  `} />
                  
                  {/* Glass effect layers */}
                  <div className="absolute inset-0 rounded-2xl backdrop-blur-xl 
                                bg-white/[0.08] border border-white/[0.12]
                                transition-all duration-300" />
                  
                  {/* Soft top gloss */}
                  <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl
                                bg-gradient-to-b from-white/20 to-transparent
                                opacity-60" />
                  
                  {/* Highlight shine */}
                  <div className="absolute top-1 left-1 right-1 h-2 rounded-t-xl
                                bg-gradient-to-b from-white/30 to-transparent
                                opacity-50" />
                  
                  {/* Bottom shadow for depth */}
                  <div className={`
                    absolute inset-0 rounded-2xl
                    shadow-inner transition-all duration-300
                    ${isActive 
                      ? 'shadow-black/20' 
                      : 'shadow-black/10'
                    }
                  `} />
                  
                  {/* Icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon 
                      className={`w-6 h-6 transition-all duration-300 ${
                        isActive 
                          ? 'text-white drop-shadow-lg' 
                          : 'text-white/60'
                      }`}
                    />
                  </div>
                </div>

                {/* Label */}
                <span className={`text-xs font-medium transition-all duration-300 ${
                  isActive 
                    ? 'text-white' 
                    : 'text-white/50'
                }`}>
                  {item.label}
                </span>
                
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -bottom-1 w-1 h-1 rounded-full 
                                bg-gradient-to-r from-emerald-400 to-emerald-600
                                shadow-lg shadow-emerald-500/50
                                animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function TripsIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="10" r="3" />
      <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z" />
    </svg>
  );
}

function RewardsIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M20 12v10H4V12" />
      <rect x="2" y="7" width="20" height="5" rx="1" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
