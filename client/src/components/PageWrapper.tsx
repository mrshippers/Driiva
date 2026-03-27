import { ReactNode, useRef, useCallback } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  showNav?: boolean;
  /** Scroll event handler for scroll-linked effects */
  onScroll?: (e: React.UIEvent<HTMLElement>) => void;
  /** Additional class for the scroll container */
  className?: string;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({
  children,
  showNav = true,
  onScroll,
  className = '',
}) => {
  return (
    <div
      className={`min-h-screen pt-safe overscroll-contain ${className}`}
      onScroll={onScroll}
    >
      <div className="max-w-md mx-auto px-4 pt-6 pb-24">
        {children}
      </div>
    </div>
  );
};
