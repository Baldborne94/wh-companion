import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.jsx';
import { LanguageProvider } from './lib/i18n.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { initErrorTracking } from './lib/errorTracking.js';

// Errors-only Sentry, lazy-loaded on idle; a complete no-op unless
// VITE_SENTRY_DSN is configured. See lib/errorTracking.js.
initErrorTracking();

// registerType:'autoUpdate' (vite.config.js) reloads the page as soon as a new
// service worker activates — but the BROWSER only checks for a new one on a
// fresh top-level navigation (or at most once per 24h), which an installed PWA
// that's just backgrounded/foregrounded (never actually reloaded) can go a long
// time without. Actively poll on the moments that matter — first load, and every
// time the app comes back to the foreground — so a session picks up a shipped
// fix promptly instead of silently running a stale bundle indefinitely.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
    },
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary title="The app crashed">
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>
);
