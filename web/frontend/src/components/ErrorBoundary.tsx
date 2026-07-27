/**
 * ⚔️ ErrorBoundary — 捕获 React 渲染错误，防止白屏/黑屏
 *
 * 当子组件崩溃时，显示错误信息而不是空白页面。
 * 同时记录错误到 LogStore 方便排查。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: '' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo: errorInfo.componentStack || '' });
    // Also log to console for dev tools
    console.error('[Blade ErrorBoundary]', error, errorInfo.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 p-8">
          <div className="max-w-2xl w-full bg-gray-900 border border-red-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">💥</span>
              <h1 className="text-lg font-bold text-red-400">渲染错误</h1>
            </div>
            <div className="bg-gray-950 rounded-lg p-4 mb-4 overflow-auto max-h-40">
              <pre className="text-sm text-red-300 font-mono whitespace-pre-wrap">
                {this.state.error?.message || '未知错误'}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
            >
              刷新页面
            </button>
            <button
              onClick={() => {
                // Try to clear localStorage session data and reload
                try { localStorage.removeItem('chat-storage'); } catch {}
                window.location.reload();
              }}
              className="ml-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              清空缓存并刷新
            </button>
            {this.state.errorInfo && (
              <details className="mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">组件堆栈</summary>
                <pre className="mt-2 text-xs text-gray-600 font-mono whitespace-pre-wrap max-h-60 overflow-auto">
                  {this.state.errorInfo}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
