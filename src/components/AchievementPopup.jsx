import { useState, useEffect, useRef } from "react";
import { useLang } from "../lib/i18n.jsx";
import { localizeAchievement } from "../lib/achievements";

// ─── FLAVOR TEXT ──────────────────────────────────────────────────────────────
// The opener / flavor / series / army pools are translated and live in the i18n
// `stats` namespace (src/data/i18n/ns/stats.js). They are passed in already
// resolved for the active language + universe.
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getFlavorText(achievement, flavorPool, seriesPool, armyPool) {
  // Dynamic series completion
  if (achievement.id.startsWith('series:')) {
    const name = achievement.id.slice('series:'.length);
    return pick(seriesPool).replace(/\{name\}/g, name);
  }
  // Dynamic faction army milestones
  if (achievement.id.startsWith('army:')) {
    const rest    = achievement.id.slice('army:'.length);
    const sep     = rest.lastIndexOf(':');
    const faction = rest.slice(0, sep);
    const count   = rest.slice(sep + 1);
    const pool    = armyPool[count] || [armyPool.fallback];
    return pick(pool).replace(/\{faction\}/g, faction).replace(/\{count\}/g, count);
  }
  const pool = flavorPool[achievement.id];
  return pool ? pick(pool) : achievement.desc;
}

function getOpener(achievement, openerPool) {
  if (achievement.id.startsWith('series:'))         return pick(openerPool.series);
  if (achievement.id.startsWith('army:'))           return pick(openerPool.army);
  if (achievement.id.startsWith('paint_streak'))    return pick(openerPool.painting_streak);
  if (achievement.id.startsWith('monthly_painter')) return pick(openerPool.painting_monthly);
  if (achievement.id.startsWith('paint_'))          return pick(openerPool.painting_general);
  if (achievement.cat === 'streak')                 return pick(openerPool.streak);
  if (achievement.cat === 'monthly')                return pick(openerPool.monthly);
  if (achievement.cat === 'faction')                return pick(openerPool.faction);
  if (achievement.cat === 'explorer')               return pick(openerPool.explorer);
  return pick(openerPool.milestone);
}

// ─── SPARKLE PARTICLES ───────────────────────────────────────────────────────
const SPARKLES = [
  { angle: 0,   delay: 0   },
  { angle: 60,  delay: 60  },
  { angle: 120, delay: 120 },
  { angle: 180, delay: 40  },
  { angle: 240, delay: 80  },
  { angle: 300, delay: 20  },
];

function Sparkle({ angle, delay, accent, visible }) {
  const rad = (angle * Math.PI) / 180;
  const r   = 34;
  const x   = Math.round(Math.cos(rad) * r);
  const y   = Math.round(Math.sin(rad) * r);
  return (
    <div style={{
      position: "absolute", left: "50%", top: "50%",
      width: 6, height: 6, borderRadius: "50%",
      background: accent, boxShadow: `0 0 6px ${accent}`,
      opacity: visible ? 1 : 0,
      transform: visible
        ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`
        : "translate(-50%,-50%) scale(0)",
      transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      pointerEvents: "none",
    }} />
  );
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const ACCENT_MAP = { reading: "#c9a84c", painting: "#9a4adc" };
const BG   = "#0a0905";
const TEXT = "#d4cbb8";
const MUTED = "#7a7060";

export default function AchievementPopup({ achievement, onDismiss, type = "reading", universe = "wh40k" }) {
  const { t } = useLang();
  const [vis, setVis] = useState(false);
  const accent  = ACCENT_MAP[type] || ACCENT_MAP.reading;
  const uni     = universe === 'aos' ? 'aos' : 'wh40k';
  const flavor  = useRef(getFlavorText(achievement, t("stats.flavor")[uni], t("stats.seriesFlavor")[uni], t("stats.armyFlavor")[uni]));
  const opener  = useRef(getOpener(achievement, t("stats.openers")[uni]));
  const label   = localizeAchievement(achievement, t).label;

  useEffect(() => {
    const t1 = setTimeout(() => setVis(true), 30);
    const t2 = setTimeout(() => { setVis(false); setTimeout(onDismiss, 450); }, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => { setVis(false); setTimeout(onDismiss, 450); };

  return (
    <>
      <style>{`
        @keyframes achPulse {
          0%,100% { box-shadow: 0 0 14px ${accent}55, 0 0 4px ${accent}22; }
          50%      { box-shadow: 0 0 28px ${accent}99, 0 0 12px ${accent}55; }
        }
        @keyframes achShimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>
      <div
        onClick={dismiss}
        style={{
          position: "fixed", top: 56, left: 12, right: 12,
          zIndex: 9998, cursor: "pointer",
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0) scale(1)" : "translateY(-30px) scale(0.96)",
          transition: "opacity 0.45s cubic-bezier(.22,1,.36,1), transform 0.45s cubic-bezier(.22,1,.36,1)",
          maxWidth: 580, margin: "0 auto",
        }}
      >
        <div style={{
          position: "absolute", inset: -4, borderRadius: 20, pointerEvents: "none",
          boxShadow: `0 0 40px ${accent}33, 0 0 80px ${accent}18`,
        }} />
        <div style={{
          background: `linear-gradient(140deg, ${accent}22 0%, ${BG}ee 50%, ${accent}0a 100%)`,
          border: `2px solid ${accent}aa`,
          borderRadius: 18, padding: "16px 18px 14px",
          boxShadow: `inset 0 1px 0 ${accent}33, 0 12px 40px rgba(0,0,0,0.8)`,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          {/* icon + sparkles */}
          <div style={{ position: "relative", flexShrink: 0, width: 64, height: 64 }}>
            {SPARKLES.map((s, i) => <Sparkle key={i} {...s} accent={accent} visible={vis} />)}
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: `radial-gradient(circle, ${accent}55 0%, ${accent}22 50%, transparent 100%)`,
              border: `2px solid ${accent}88`,
              animation: vis ? `achPulse 1.6s ease-in-out infinite` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32,
            }}>
              {achievement.icon}
            </div>
          </div>
          {/* text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Cinzel',serif", fontSize: 7, letterSpacing: 3,
              textTransform: "uppercase", marginBottom: 4,
              background: `linear-gradient(90deg, ${accent}, #fff, ${accent})`,
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: vis ? "achShimmer 2s linear infinite" : "none",
            }}>
              ✦ {opener.current} ✦
            </div>
            <div style={{
              fontFamily: "'Cinzel Decorative',serif", fontSize: 16,
              color: TEXT, lineHeight: 1.2, marginBottom: 6,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, fontStyle: "italic" }}>
              {flavor.current}
            </div>
          </div>
          <div style={{ fontSize: 9, color: MUTED, flexShrink: 0, opacity: 0.5, writingMode: "vertical-rl" }}>{t("stats.tap")}</div>
        </div>
      </div>
    </>
  );
}
