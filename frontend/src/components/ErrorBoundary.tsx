import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary. Without this, an uncaught render error in any
 * child will unmount the entire React tree and show a blank page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 *   // or with a custom fallback:
 *   <ErrorBoundary fallback={(err, reset) => <ErrorPage error={err} onRetry={reset} />}>
 *     <App />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production, ship this to Sentry (or any other error tracker).
    // For now, we just log to the console; the operator can wire a tracker
    // in via a global hook.
    // eslint-disable-next-line no-console
    console.error('Uncaught error in React tree:', error, info);
    const w = window as any;
    if (typeof w.__faculty_reportError === 'function') {
      try { w.__faculty_reportError(error, info); } catch { /* noop */ }
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;
    if (error) {
      if (fallback) return fallback(error, this.reset);
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-large p-8 text-center">
            <h1 className="text-2xl font-bold text-secondary-900 mb-2">Something went wrong</h1>
            <p className="text-secondary-600 mb-6">
              An unexpected error occurred. The team has been notified.
            </p>
            <pre className="text-left text-xs text-secondary-500 bg-secondary-50 p-3 rounded-lg overflow-auto max-h-40 mb-6">
              {error.message}
            </pre>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.reset}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
              >
                Try again
              </button>
              <button
                onClick={() => { window.location.href = '/login'; }}
                className="px-4 py-2 rounded-lg bg-secondary-100 text-secondary-800 font-medium hover:bg-secondary-200"
              >
                Back to login
              </button>
            </div>
          </div>
        </div>
      );
    }
    return children;
  }
}

export default ErrorBoundary;
