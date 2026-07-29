import { useLang } from "../lib/i18n.jsx";

// "A new version is ready" bar. A waiting service worker changes nothing on its
// own (see lib/swUpdate.js), so this is an offer, not a countdown: the reload
// happens when the reader taps Update — or silently later, once the app is in
// the background and nobody is looking at it.
//
// App decides WHEN to mount this (never while the reader is open); this
// component just renders the offer.
export default function UpdateToast({ onApply, onDismiss, palette }) {
  const { t } = useLang();
  const P = palette;

  return (
    <div role="status" data-app-update="1"
      style={{ position: "fixed", left: 12, right: 12, bottom: "calc(var(--nav-h, 56px) + 12px)", zIndex: 4,
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        background: P.card, border: `1px solid ${P.gold}66`, borderRadius: 10,
        boxShadow: "0 6px 20px rgba(0,0,0,0.5)" }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>⚙</span>
      <span style={{ flex: 1, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 1, color: P.text }}>
        {t("update.ready")}
      </span>
      <button onClick={onApply}
        style={{ background: `${P.gold}22`, border: `1px solid ${P.gold}`, borderRadius: 6, color: P.gold,
          padding: "6px 12px", fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, cursor: "pointer", flexShrink: 0 }}>
        {t("update.apply")}
      </button>
      <button onClick={onDismiss} title={t("update.later")} aria-label={t("update.dismiss")}
        style={{ background: "transparent", border: "none", color: `${P.muted}`, fontSize: 14, lineHeight: 1,
          padding: "4px 2px", cursor: "pointer", flexShrink: 0 }}>
        ✕
      </button>
    </div>
  );
}
