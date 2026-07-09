import { useState } from "react";
import { useLang } from "../lib/i18n.jsx";

const UNIVERSES = [
  {
    id: "40k",
    name: "WARHAMMER",
    subtitle: "40,000",
    accent: "#C0392B",
    accentSoft: "#8B0000",
    bg: "linear-gradient(160deg, #1a0505 0%, #0f0e09 100%)",
    flavorKey: "login.selector.flavor40k",
    logo: "/aquila.png",
    logoAlt: "Imperial Aquila",
  },
  {
    id: "aos",
    name: "WARHAMMER",
    subtitle: "AGE OF SIGMAR",
    accent: "#C9A227",
    accentSoft: "#7a6015",
    bg: "linear-gradient(160deg, #060c1a 0%, #090c0f 100%)",
    flavorKey: "login.selector.flavorAoS",
    logo: "/sigmar.svg",
    logoAlt: "Sigmar",
  },
];

export default function UniverseSelector({ onSelect }) {
  const { t } = useLang();
  const [hovered, setHovered] = useState(null);
  // Touch devices (tablets/phones) can't hover, so the hover-only "revealed" state
  // (flavor text, lit logo, bright ENTER) would never show — the panels looked
  // half-rendered with a big empty gap. On touch, reveal both panels by default;
  // hover-driven flex expansion stays desktop-only.
  const isTouch = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(hover: none)").matches;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: "#050302",
      display: "flex", flexDirection: "column",
      fontFamily: "system-ui, sans-serif",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap');
        @keyframes usFadeIn { from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);} }
        .us-panel {
          flex: 1; position: relative;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          cursor: pointer; overflow: hidden;
          transition: flex 0.55s cubic-bezier(0.4,0,0.2,1);
          padding: 40px 24px; gap: 0;
        }
        .us-panel-40k { border-right: 1px solid #2a1a1a; }
        .us-panel-aos { border-left: 1px solid #1a1a2a; }
        .us-logo { transition: transform 0.4s, filter 0.4s; }
        @media (max-width: 600px) {
          .us-panels-wrapper { flex-direction: column !important; }
          .us-panel-40k { border-right: none; border-bottom: 1px solid #2a1a1a; }
          .us-panel-aos { border-left: none; border-top: 1px solid #1a1a2a; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        flexShrink: 0, padding: "16px 24px 14px",
        textAlign: "center", borderBottom: "1px solid #1e1c17",
        background: "rgba(10,8,6,0.9)",
        animation: "usFadeIn 0.6s ease-out both",
      }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:"0.5em", color:"#5a5040", textTransform:"uppercase", marginBottom:5 }}>
          {t("login.selector.eyebrow")}
        </div>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:"clamp(14px,4vw,20px)", color:"#d4cbb8", fontWeight:700 }}>
          {t("login.selector.title")}
        </div>
      </div>

      {/* Two panels */}
      <div className="us-panels-wrapper" style={{ flex:1, display:"flex", flexDirection:"row", overflow:"hidden" }}>
        {UNIVERSES.map((u) => {
          const isHov = hovered === u.id;
          const othHov = hovered !== null && hovered !== u.id;
          // On touch, treat every panel as "revealed" so its content is fully
          // visible; on desktop this tracks the actual hover.
          const revealed = isHov || isTouch;
          return (
            <div key={u.id}
              className={`us-panel us-panel-${u.id}`}
              style={{ flex: isHov ? 1.45 : othHov ? 0.55 : 1, background: u.bg }}
              onMouseEnter={() => setHovered(u.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(u.id)}
            >
              {/* Top glow border */}
              <div style={{
                position:"absolute", top:0, left:0, right:0, height:3,
                background:`linear-gradient(to right,transparent,${u.accent},transparent)`,
                opacity: revealed ? 1 : 0.3, transition:"opacity 0.4s",
              }}/>

              {/* Radial background glow */}
              <div style={{
                position:"absolute", inset:0, pointerEvents:"none",
                background:`radial-gradient(ellipse at 50% 45%,${u.accent}22 0%,transparent 65%)`,
                opacity: revealed ? 1 : 0.2, transition:"opacity 0.5s",
              }}/>

              {/* Logo image — fixed-height box so the rectangular 40k aquila and the
                  circular AoS medallion reserve the same vertical space and the rows
                  below line up across both panels. */}
              <div style={{
                marginBottom: 24, height: 144,
                transform: isHov ? "scale(1.06)" : "scale(1)",
                transition: "transform 0.4s",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img
                  src={u.logo}
                  alt={u.logoAlt}
                  className="us-logo"
                  style={u.id === "40k" ? {
                    height: isHov ? 120 : 96,
                    width: "auto",
                    maxWidth: 260,
                    objectFit: "contain",
                    mixBlendMode: "screen",
                    filter: revealed
                      ? `drop-shadow(0 0 18px ${u.accent}99) brightness(1.1)`
                      : `drop-shadow(0 0 6px ${u.accent}44) brightness(0.85)`,
                    transition: "height 0.4s, filter 0.4s",
                  } : {
                    width: isHov ? 140 : 112,
                    height: isHov ? 140 : 112,
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: `2px solid ${revealed ? u.accent : u.accent + "55"}`,
                    boxShadow: revealed ? `0 0 24px ${u.accent}66, 0 0 48px ${u.accent}33` : "none",
                    transition: "all 0.4s",
                  }}
                />
              </div>

              {/* Universe name */}
              <div style={{
                fontFamily:"'Cinzel Decorative',serif",
                fontSize:"clamp(16px,3.5vw,24px)",
                fontWeight:700,
                color: revealed ? "#ffffff" : "#d4cbb8bb",
                letterSpacing:"0.1em",
                marginBottom:4,
                textAlign:"center",
                transition:"color 0.4s",
                textShadow: revealed ? `0 0 24px ${u.accent}66` : "none",
              }}>{u.name}</div>

              {/* Subtitle — fixed-height row so the differing font sizes
                  ("40,000" vs "AGE OF SIGMAR") don't offset the rows below. */}
              <div style={{
                fontFamily:"'Cinzel Decorative',serif",
                fontSize: u.id === "aos" ? "clamp(11px,2.2vw,16px)" : "clamp(16px,3vw,22px)",
                fontWeight:900,
                color: revealed ? u.accent : `${u.accent}99`,
                letterSpacing:"0.08em",
                height:30, marginBottom:22,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"color 0.4s",
                textShadow: revealed ? `0 0 16px ${u.accent}55` : "none",
              }}>{u.subtitle}</div>

              {/* Expanding divider */}
              <div style={{
                height:1, marginBottom:18,
                width: revealed ? 80 : 28,
                background:`linear-gradient(to right,transparent,${u.accent},transparent)`,
                transition:"width 0.45s cubic-bezier(0.4,0,0.2,1)",
              }}/>

              {/* Flavor text — fixed-height box so different flavor lengths (both
                  shown at once on touch) reserve equal space and ENTER stays level. */}
              <div style={{
                fontSize:11, fontStyle:"italic",
                color:"rgba(212,203,184,0.55)",
                textAlign:"center", maxWidth:200, lineHeight:1.65,
                marginBottom:26, height:54, overflow:"hidden",
                fontFamily:"'Cinzel',serif", letterSpacing:"0.02em",
                opacity: revealed ? 1 : 0,
                transition:"opacity 0.35s",
              }}>{t(u.flavorKey)}</div>

              {/* ENTER button */}
              <button
                style={{
                  border:`1px solid ${revealed ? u.accent : u.accent + "66"}`,
                  borderRadius:3, padding:"10px 32px",
                  fontFamily:"'Cinzel',serif", fontSize:10,
                  letterSpacing:"0.3em", cursor:"pointer",
                  background: revealed ? `${u.accent}15` : "transparent",
                  color: revealed ? u.accent : `${u.accent}77`,
                  boxShadow: revealed ? `0 0 20px ${u.accent}44` : "none",
                  transition:"all 0.3s",
                }}
                onClick={(e) => { e.stopPropagation(); onSelect(u.id); }}
              >{t("login.selector.enter")}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
