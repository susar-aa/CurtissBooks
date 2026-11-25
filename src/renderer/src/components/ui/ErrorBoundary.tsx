import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-zinc-950 p-6 select-none font-sans text-zinc-100">
          <div className="max-w-xl w-full border border-red-900/60 bg-zinc-900/90 rounded-xl p-6 shadow-2xl backdrop-blur-sm space-y-5">
            <div className="flex items-center space-x-3 text-red-400">
              <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-800/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-white">
                  {this.props.fallbackTitle || 'Application Interface Error'}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  An unexpected UI error occurred while rendering the workspace.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="p-3.5 rounded-lg bg-black/50 border border-zinc-800 font-mono text-xs text-red-300 max-h-48 overflow-y-auto break-all">
                <div className="font-bold">{this.state.error.name}: {this.state.error.message}</div>
                {this.state.error.stack && (
                  <pre className="text-[10px] text-zinc-500 mt-2 whitespace-pre-wrap font-mono">
                    {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold shadow-xs transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Application</span>
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs font-medium border border-zinc-700 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

