import React from 'react';
import { AlertTriangle, Home, RefreshCw, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
  stack: string;
  source: string;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = {
    hasError: false,
    message: '',
    stack: '',
    source: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || '页面渲染失败',
      stack: error?.stack || '',
      source: 'render',
    };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('AppErrorBoundary caught an error', error, info);
  }

  private setGlobalError = (message: string, stack: string, source: string) => {
    this.setState({
      hasError: true,
      message,
      stack,
      source,
    });
  };

  private handleWindowError = (event: ErrorEvent) => {
    const error = event.error instanceof Error ? event.error : null;
    this.setGlobalError(
      error?.message || event.message || '发生了未捕获的脚本错误',
      error?.stack || '',
      'window.error',
    );
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      this.setGlobalError(reason.message, reason.stack || '', 'unhandledrejection');
      return;
    }

    const message = typeof reason === 'string' ? reason : JSON.stringify(reason, null, 2);
    this.setGlobalError(message || '发生了未处理的 Promise 异常', '', 'unhandledrejection');
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, message: '', stack: '', source: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="muse-app-shell grid min-h-screen place-items-center px-5 py-10 text-foreground">
        <div className="today-hero-card w-full max-w-4xl">
          <div className="editorial-kicker">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Muse Error</span>
          </div>
          <h1 className="today-hero-title mt-7">页面没有正常渲染</h1>
          <p className="today-hero-copy mt-7">
            错误已经被前端边界接住。你可以先重新挂载当前页面；如果状态没有恢复，再刷新应用或回到仪表盘。
          </p>

          <div className="mt-8 rounded-[14px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-4 text-sm">
            <div className="font-medium text-foreground">错误信息</div>
            <div className="mt-2 break-all text-destructive">{this.state.message}</div>
            {this.state.source && (
              <div className="mt-3 text-xs text-muted-foreground">错误来源：{this.state.source}</div>
            )}
          </div>

          {this.state.stack && (
            <details className="mt-4 rounded-[14px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-4 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">查看堆栈</summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
                {this.state.stack}
              </pre>
            </details>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={this.handleReset}
              className="md3-state-layer inline-flex items-center gap-2 rounded-[14px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              重新挂载页面
            </button>
            <button
              onClick={this.handleReload}
              className="md3-state-layer inline-flex items-center gap-2 rounded-[14px] bg-primary px-4 py-2.5 text-sm text-primary-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              刷新应用
            </button>
            <a
              href="/dashboard"
              className="md3-state-layer inline-flex items-center gap-2 rounded-[14px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] px-4 py-2.5 text-sm text-foreground"
            >
              <Home className="h-4 w-4" />
              回到仪表盘
            </a>
          </div>
        </div>
      </div>
    );
  }
}
