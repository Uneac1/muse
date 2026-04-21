import React from 'react';

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
      <div className="min-h-screen bg-zinc-100 px-6 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-red-200 bg-white p-8 shadow-xl dark:border-red-900/40 dark:bg-zinc-900">
          <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs uppercase tracking-[0.24em] text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            Runtime Error
          </div>
          <h1 className="mt-4 text-3xl font-semibold">页面没有正常渲染</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            这次没有再让应用直接白屏。错误已经被前端边界接住，你可以先恢复页面，再把下面的错误信息发给我继续追根因。
          </p>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="font-medium text-zinc-900 dark:text-zinc-100">错误信息</div>
            <div className="mt-2 break-all text-red-600 dark:text-red-300">{this.state.message}</div>
            {this.state.source && (
              <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">错误来源：{this.state.source}</div>
            )}
          </div>

          {this.state.stack && (
            <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">查看堆栈</summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-zinc-600 dark:text-zinc-400">
                {this.state.stack}
              </pre>
            </details>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={this.handleReset}
              className="rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              重新挂载页面
            </button>
            <button
              onClick={this.handleReload}
              className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm text-white transition hover:bg-zinc-800 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
            >
              刷新应用
            </button>
            <a
              href="/dashboard"
              className="rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              回到仪表盘
            </a>
          </div>
        </div>
      </div>
    );
  }
}
