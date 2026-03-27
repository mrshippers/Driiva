import { useState, useEffect } from 'react';
import { hasAnalyticsConsent, initAnalyticsWithConsent, rejectAnalyticsConsent } from '../lib/firebase';

const CONSENT_KEY = 'driiva_analytics_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored === null) setVisible(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    initAnalyticsWithConsent();
    setVisible(false);
  };

  const handleReject = () => {
    rejectAnalyticsConsent();
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-[#1a1a2e]/95 backdrop-blur-md border-t border-white/10">
      <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-3 text-sm text-white/80">
        <p className="flex-1">
          We use cookies and analytics to improve your experience. See our{' '}
          <a href="/privacy" className="text-teal-400 hover:underline">privacy policy</a> for details.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleReject}
            className="px-4 py-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-medium transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
