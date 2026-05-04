import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/system/AppErrorBoundary';
import { registerServiceWorker } from './lib/registerServiceWorker';
import { reportRuntimeIncident } from './lib/runtimeIncidentReporter';
import './index.css';

function scheduleIdleTask(task: () => void) {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(() => task(), { timeout: 1600 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(task, 500);
  return () => globalThis.clearTimeout(id);
}

function loadMaterialTypescale() {
  if (!('adoptedStyleSheets' in document)) return;

  void import('@material/web/typography/md-typescale-styles.js')
    .then(({ styles }) => {
      if (!styles.styleSheet || document.adoptedStyleSheets.includes(styles.styleSheet)) return;
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, styles.styleSheet];
    })
    .catch((error) => {
      console.warn('Muse app Material typescale loading failed.', error);
    });
}

window.addEventListener('error', (event) => {
  const error = event.error instanceof Error ? event.error : null;
  const detail = [
    error?.message || event.message || '发生了未捕获的脚本错误',
    error?.stack || '',
    event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '',
  ].filter(Boolean).join('\n\n');

  void reportRuntimeIncident({
    title: '前端脚本异常',
    detail,
    severity: 'watch',
    source: 'window.error',
    kind: 'window_error',
    metadata: {
      filename: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0,
    },
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const detail = reason instanceof Error
    ? `${reason.message}\n\n${reason.stack || ''}`
    : typeof reason === 'string'
    ? reason
    : JSON.stringify(reason || {}, null, 2);

  void reportRuntimeIncident({
    title: '前端 Promise 未处理拒绝',
    detail: detail || '发生了未处理的 Promise 异常。',
    severity: 'watch',
    source: 'window.unhandledrejection',
    kind: 'unhandled_rejection',
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

scheduleIdleTask(loadMaterialTypescale);
registerServiceWorker();
