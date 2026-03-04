import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { Home, Map, Gift, User } from 'lucide-react';

const navItems = [
  { icon: Home, label: 'Home', path: '/dashboard' },
  { icon: Map, label: 'Trips', path: '/trips' },
  { icon: Gift, label: 'Rewards', path: '/rewards' },
  { icon: User, label: 'Profile', path: '/profile' },
] as const;

export const BottomNav: React.FC = () => {
  const [location] = useLocation();
  
  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ 
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
        willChange: 'transform',
        transform: 'translateZ(0)'
      }}
    >
      <div 
        className="border-t border-white/[0.08]"
        style={{
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="max-w-md mx-auto flex justify-around py-2 px-2">
          {navItems.map(({ icon: Icon, label, path }) => {
            const isActive = location === path;
            
            return (
              <Link
                key={path}
                href={path}
                className="relative min-h-[44px] min-w-[44px]"
              >
                <motion.div
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="flex flex-col items-center gap-1 px-4 py-2 justify-center"
                >
                  <div className={`
                    relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-150
                    ${isActive 
                      ? 'scale-105' 
                      : 'opacity-60 hover:opacity-100 hover:scale-105'
                    }
                  `}>
                    {isActive && (
                      <motion.div 
                        layoutId="nav-active-bg"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                        }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                    
                    <Icon className={`w-5 h-5 relative z-10 transition-colors duration-150 ${
                      isActive 
                        ? 'text-emerald-400 drop-shadow-sm' 
                        : 'text-white/60'
                    }`} />
                  </div>
                  
                  <span className={`text-[10px] font-medium transition-colors duration-150 ${
                    isActive 
                      ? 'text-emerald-400' 
                      : 'text-white/40'
                  }`}>
                    {label}
                  </span>
                  
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
