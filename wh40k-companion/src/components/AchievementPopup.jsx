import { useState, useEffect } from "react";

const ACCENT = { reading: "#c9a84c", painting: "#9a4adc" };
const BG     = "#0a0905";
const TEXT   = "#d4cbb8";
const MUTED  = "#7a7060";

export default function AchievementPopup({ achievement, onDismiss, type = "reading" }) {
  const [vis, setVis] = useState(false);
  const accent = ACCENT[type] || ACCENT.reading;

  useEffect(() => {
    const t1 = setTimeout(() => setVis(true), 30);
    const t2 = setTimeout(() => { setVis(false); setTimeout(onDismiss, 420); }, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => { setVis(false); setTimeout(onDismiss, 420); };

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed", top: 60, left: 16, right: 16,
        zIndex: 9998, cursor: "pointer",
        opacity: vis ? 1 : 0,
        transform: vis ? "translateY(0)" : "translateY(-24px)",
        transition: "opacity 0.42s ease, transform 0.42s ease",
        maxWidth: 560, margin: "0 auto",
      }}
    >
      {/* outer glow ring */}
      <div style={{
        position: "absolute", inset: -2, borderRadius: 18,
        boxShadow: `0 0 28px ${accent}44, 0 0 8px ${accent}22`,
        pointerEvents: "none",
      }} />
      <div style={{
        background: `linear-gradient(135deg, ${accent}1a 0%, ${BG} 60%)`,
        border: `2px solid ${accent}88`,
        borderRadius: 16, padding: "14px 18px",
        boxShadow: `0 8px 32px rgba(0,0,0,0.75)`,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        {/* icon halo */}
        <div style={{
          width: 58, height: 58, borderRadius: "50%", flexShrink: 0,
          background: `radial-gradient(circle, ${accent}44 0%, ${accent}11 60%, transparent 100%)`,
          border: `2px solid ${accent}66`,
          boxShadow: `0 0 14px ${accent}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30,
        }}>
          {achievement.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 3,
            color: accent, textTransform: "uppercase", marginBottom: 3,
          }}>
            ✦ Achievement Unlocked ✦
          </div>
          <div style={{
            fontFamily: "'Cinzel Decorative',serif", fontSize: 15,
            color: TEXT, lineHeight: 1.2, marginBottom: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {achievement.label}
          </div>
          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4 }}>
            {achievement.desc}
          </div>
        </div>
        {/* dismiss hint */}
        <div style={{ fontSize: 10, color: MUTED, flexShrink: 0, opacity: 0.6 }}>tap</div>
      </div>
    </div>
  );
}
