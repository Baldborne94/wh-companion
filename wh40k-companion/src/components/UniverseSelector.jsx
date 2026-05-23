import { useState } from "react";

// Inline SVG: Sigmar's Warhammer (comet + hammer symbol for AoS)
function SigmarHammerSVG({ size = 120, color = "#C9A227" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hammer head */}
      <rect x="28" y="12" width="44" height="20" rx="4" fill={color} opacity="0.95"/>
      {/* Hammer handle */}
      <rect x="45" y="32" width="10" height="52" rx="3" fill={color} opacity="0.85"/>
      {/* Cross-guard */}
      <rect x="32" y="36" width="36" height="6" rx="2" fill={color} opacity="0.7"/>
      {/* Grip wrap */}
      <rect x="46" y="44" width="8" height="3" rx="1" fill={color} opacity="0.4"/>
      <rect x="46" y="52" width="8" height="3" rx="1" fill={color} opacity="0.4"/>
      <rect x="46" y="60" width="8" height="3" rx="1" fill={color} opacity="0.4"/>
      {/* Pommel */}
      <circle cx="50" cy="88" r="6" fill={color} opacity="0.8"/>
      {/* Stars/comet sparks */}
      <circle cx="18" cy="22" r="2.5" fill={color} opacity="0.6"/>
      <circle cx="82" cy="18" r="2" fill={color} opacity="0.5"/>
      <circle cx="14" cy="50" r="1.5" fill={color} opacity="0.35"/>
      <circle cx="86" cy="55" r="1.5" fill={color} opacity="0.35"/>
      <circle cx="22" cy="75" r="1" fill={color} opacity="0.25"/>
      <circle cx="78" cy="78" r="1" fill={color} opacity="0.25"/>
      {/* Lightning bolts */}
      <path d="M22 35 L30 50 L24 50 L34 68" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" fill="none"/>
      <path d="M78 35 L70 50 L76 50 L66 68" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" fill="none"/>
    </svg>
  );
}

const UNIVERSES = [
  {
    id: "40k",
    name: "WARHAMMER",
    subtitle: "40,000",
    accent: "#C0392B",
    accentSoft: "#8B0000",
    bg: "linear-gradient(160deg, #1a0505 0%, #0f0e09 100%)",
    flavorText: "In the grim darkness of the far future, there is only war.",
    useImg: true,
  },
  {
    id: "aos",
    name: "WARHAMMER",
    subtitle: "AGE OF SIGMAR",
    accent: "#C9A227",
    accentSoft: "#7a6015",
    bg: "linear-gradient(160deg, #060c1a 0%, #090c0f 100%)",
    flavorText: "A new age dawns — forged in the fires of the Mortal Realms.",
    useImg: false,
  },
];

export default function UniverseSelector({ onSelect }) {
  const [hovered, setHovered] = useState(null);

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
          CHOOSE YOUR REALM
        </div>
        <div style={{ fontFamily:"'Cinzel Decorative',serif", fontSize:"clamp(14px,4vw,20px)", color:"#d4cbb8", fontWeight:700 }}>
          Seleziona il tuo Universo
        </div>
      </div>

      {/* Two panels */}
      <div className="us-panels-wrapper" style={{ flex:1, display:"flex", flexDirection:"row", overflow:"hidden" }}>
        {UNIVERSES.map((u) => {
          const isHov = hovered === u.id;
          const othHov = hovered !== null && hovered !== u.id;
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
                opacity: isHov ? 1 : 0.3, transition:"opacity 0.4s",
              }}/>

              {/* Radial background glow */}
              <div style={{
                position:"absolute", inset:0, pointerEvents:"none",
                background:`radial-gradient(ellipse at 50% 45%,${u.accent}20 0%,transparent 65%)`,
                opacity: isHov ? 1 : 0, transition:"opacity 0.5s",
              }}/>

              {/* Logo image or SVG */}
              <div style={{
                marginBottom: 24,
                transition: "transform 0.4s, filter 0.4s",
                transform: isHov ? "scale(1.08)" : "scale(1)",
                filter: isHov
                  ? `drop-shadow(0 0 18px ${u.accent}99) drop-shadow(0 0 40px ${u.accent}44)`
                  : `drop-shadow(0 0 6px ${u.accent}44)`,
              }}>
                {u.useImg ? (
                  <img
                    src="/aquila.png"
                    alt="Warhammer 40K Aquila"
                    style={{
                      width: isHov ? 120 : 96,
                      height: isHov ? 120 : 96,
                      objectFit: "contain",
                      transition: "width 0.4s, height 0.4s",
                      filter: `brightness(0) invert(1) sepia(1) saturate(3) hue-rotate(320deg)`,
                      opacity: isHov ? 0.95 : 0.6,
                    }}
                  />
                ) : (
                  <SigmarHammerSVG size={isHov ? 120 : 96} color={u.accent} />
                )}
              </div>

              {/* Universe name */}
              <div style={{
                fontFamily:"'Cinzel Decorative',serif",
                fontSize:"clamp(16px,3.5vw,24px)",
                fontWeight:700,
                color: isHov ? "#ffffff" : "#d4cbb8bb",
                letterSpacing:"0.1em",
                marginBottom:4,
                textAlign:"center",
                transition:"color 0.4s",
                textShadow: isHov ? `0 0 24px ${u.accent}66` : "none",
              }}>{u.name}</div>

              {/* Subtitle */}
              <div style={{
                fontFamily:"'Cinzel Decorative',serif",
                fontSize: u.id === "aos" ? "clamp(11px,2.2vw,16px)" : "clamp(16px,3vw,22px)",
                fontWeight:900,
                color: isHov ? u.accent : `${u.accent}99`,
                letterSpacing:"0.08em",
                marginBottom:22,
                textAlign:"center",
                transition:"color 0.4s",
                textShadow: isHov ? `0 0 16px ${u.accent}55` : "none",
              }}>{u.subtitle}</div>

              {/* Expanding divider */}
              <div style={{
                height:1, marginBottom:18,
                width: isHov ? 80 : 28,
                background:`linear-gradient(to right,transparent,${u.accent},transparent)`,
                transition:"width 0.45s cubic-bezier(0.4,0,0.2,1)",
              }}/>

              {/* Flavor text */}
              <div style={{
                fontSize:11, fontStyle:"italic",
                color:"rgba(212,203,184,0.55)",
                textAlign:"center", maxWidth:200, lineHeight:1.65,
                marginBottom:26, minHeight:36,
                fontFamily:"'Cinzel',serif", letterSpacing:"0.02em",
                opacity: isHov ? 1 : 0,
                transition:"opacity 0.35s",
              }}>{u.flavorText}</div>

              {/* ENTER button */}
              <button
                style={{
                  border:`1px solid ${isHov ? u.accent : u.accent + "66"}`,
                  borderRadius:3, padding:"10px 32px",
                  fontFamily:"'Cinzel',serif", fontSize:10,
                  letterSpacing:"0.3em", cursor:"pointer",
                  background: isHov ? `${u.accent}15` : "transparent",
                  color: isHov ? u.accent : `${u.accent}77`,
                  boxShadow: isHov ? `0 0 20px ${u.accent}44` : "none",
                  transition:"all 0.3s",
                }}
                onClick={(e) => { e.stopPropagation(); onSelect(u.id); }}
              >ENTER</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
