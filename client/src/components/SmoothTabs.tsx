/**
 * Smooth tab bar with sliding active indicator.
 * Provides native-feel tab switching with spring physics.
 */
import { motion } from 'framer-motion';
import { useRef, useState, useLayoutEffect } from 'react';
import { haptic } from '@/hooks/useHaptics';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SmoothTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function SmoothTabs({ tabs, activeTab, onChange, className = '' }: SmoothTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeButton = container.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement;
    if (!activeButton) return;

    setIndicatorStyle({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    });
  }, [activeTab]);

  return (
    <div
      ref={containerRef}
      className={`relative flex bg-white/[0.04] rounded-xl p-1 border border-white/[0.06] ${className}`}
    >
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-lg"
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 35,
          mass: 0.8,
        }}
      />

      {/* Tab buttons */}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-tab-id={tab.id}
          onClick={() => {
            if (tab.id !== activeTab) {
              haptic('selection');
              onChange(tab.id);
            }
          }}
          className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 text-sm font-medium transition-colors duration-150 rounded-lg min-h-[40px] ${
            activeTab === tab.id ? 'text-white' : 'text-white/40'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
