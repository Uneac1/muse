export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Muse app service worker registration failed.', error);
    });
  };

  const scheduleRegister = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(register, { timeout: 3000 });
      return;
    }

    globalThis.setTimeout(register, 1000);
  };

  if (document.readyState === 'complete') {
    scheduleRegister();
  } else {
    window.addEventListener('load', scheduleRegister, { once: true });
  }
}
