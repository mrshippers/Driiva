import React from 'react';
import * as Sentry from '@sentry/react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorInfo: error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack ?? '' } } });
  }

  handleReset = () => {
    this.setState({ hasError: false, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="driiva-gradient-bg" aria-hidden />
          <div className="glass-morphism rounded-2xl p-8 max-w-md w-full text-center relative z-10">
            <h2 className="text-2xl font-bold mb-4 text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Application Error
            </h2>
            <p className="text-gray-300 mb-6">
              {this.state.errorInfo?.message || 'An unexpected error occurred'}
            </p>
            <Button 
              onClick={this.handleReset}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}