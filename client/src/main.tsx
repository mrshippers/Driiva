import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initSentry, captureError, SentryErrorBoundary } from './lib/sentry';
import { inject as injectVercelAnalytics } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Sentry BEFORE rendering (captures early errors)
initSentry();

// Inject Vercel observability
injectVercelAnalytics();
injectSpeedInsights();

// Fallback error boundary UI
function ErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center">
      <div className="glass-morphism p-8 rounded-2xl max-w-md mx-4 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
        <p className="text-gray-300 mb-6">
          {error?.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => {
            resetError();
            window.location.reload();
          }}
          className="px-6 py-3 bg-[#06B6D4] hover:bg-[#0891B2] text-white rounded-lg font-medium transition-colors"
        >
          Reload App
        </button>
      </div>
    </div>
  );
}

// Initialize app with proper error handling
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <SentryErrorBoundary
      fallback={(props) => (
        <ErrorFallback error={props.error as Error} resetError={props.resetError} />
      )}
      onError={(error, componentStack) => {
        captureError(error as Error, { componentStack });
      }}
    >
      <App />
    </SentryErrorBoundary>
  </React.StrictMode>
);