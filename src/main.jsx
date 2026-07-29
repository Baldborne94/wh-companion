import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { LanguageProvider } from './lib/i18n.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { initErrorTracking } from './lib/errorTracking.js';
import { initSWUpdate } from './lib/swUpdate.js';

// Errors-only Sentry, lazy-loaded on idle; a complete no-op unless
// VITE_SENTRY_DSN is configured. See lib/errorTracking.js.
initErrorTracking();

// Registers the service worker and polls for new builds. A waiting update is
// surfaced by App, never applied mid-chapter. See lib/swUpdate.js.
initSWUpdate();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary title="The app crashed">
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>
);
