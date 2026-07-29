// Service-worker updates, on the reader's terms.
//
// The app used to run `registerType: 'autoUpdate'`, which reloads the page the
// moment a new worker activates — including mid-chapter. Reading position is
// saved, but having the page vanish under you is a jarring way to ship a fix.
//
// Now the worker is built in 'prompt' mode: a new build installs and *waits*,
// touching nothing, until `applyUpdate()` calls skipWaiting. So the update can
// sit there indefinitely with the running page fully intact, and the UI decides
// when to take it (see App.jsx: never while the reader is open).
//
// The polling that made updates arrive promptly in the first place is kept: the
// browser only checks for a new worker on a fresh top-level navigation (or once
// a day), which an installed PWA that is only ever backgrounded can go a long
// time without.

import { registerSW } from "virtual:pwa-register";

let updateSW = null;
let ready = false;
const listeners = new Set();

const notify = () => listeners.forEach(fn => { try { fn(ready); } catch {} });

export function initSWUpdate() {
  if (!("serviceWorker" in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { ready = true; notify(); },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("focus", check);
    },
  });
}

// Subscribe to "an update is waiting". Fires immediately if one already is.
// Returns an unsubscribe function.
export function onUpdateReady(fn) {
  listeners.add(fn);
  if (ready) fn(true);
  return () => listeners.delete(fn);
}

export const isUpdateReady = () => ready;

// Hand over to the waiting worker; it claims the page and `registerSW` reloads.
export function applyUpdate() {
  if (!ready || !updateSW) return false;
  updateSW(true);
  return true;
}

// Test seam — resets module state between cases.
export function __resetSWUpdate() {
  updateSW = null; ready = false; listeners.clear();
}
