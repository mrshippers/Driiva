interface PageWrapperProps {
  children: React.ReactNode;
  showNav?: boolean;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ children, showNav = true }) => {
  return (
    <div className="min-h-screen pt-safe">
      <div className="max-w-md mx-auto px-4 pt-6 pb-24">
        {children}
      </div>
    </div>
  );
};
