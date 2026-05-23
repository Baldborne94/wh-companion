import { useState } from "react";

const UNIVERSES = [
  {
    id: "40k",
    name: "WARHAMMER",
    subtitle: "40,000",
    icon: "☩",
    accent: "#C0392B",
    bg: "linear-gradient(160deg, #1a0505, #0f0e09)",
    flavorText: "In the grim darkness of the far future, there is only war.",
  },
  {
    id: "aos",
    name: "AGE OF",
    subtitle: "SIGMAR",
    icon: "⚡",
    accent: "#C9A227",
    bg: "linear-gradient(160deg, #050f1a, #0a0908)",
    flavorText: "A new age dawns — forged in the fires of the Mortal Realms.",
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

        @keyframes usFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes usDividerExpand {
          from { width: 0; }
          to   { width: 60px; }
        }
        @keyframes usFlavorFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .us-panel {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          transition: flex 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 40px 24px;
          gap: 0;
        }
        .us-panel-40k { border-right: 1px solid #2a1a1a; }
        .us-panel-aos { border-left: 1px solid #1a1a2a; }

        .us-panel-top-border {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          transition: opacity 0.4s;
        }

        .us-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          transition: opacity 0.5s;
        }

        .us-icon {
          font-size: 60px;
          line-height: 1;
          margin-bottom: 20px;
          transition: font-size 0.4s, filter 0.4s;
        }

        .us-name {
          font-family: 'Cinzel Decorative', serif;
          font-size: clamp(18px, 4vw, 28px);
          font-weight: 700;
          color: #d4cbb8;
          letter-spacing: 0.1em;
          margin-bottom: 4px;
          text-align: center;
        }

        .us-subtitle {
          font-family: 'Cinzel Decorative', serif;
          font-size: clamp(16px, 3.5vw, 26px);
          font-weight: 900;
          letter-spacing: 0.08em;
          margin-bottom: 22px;
          text-align: center;
        }

        .us-divider {
          height: 1px;
          margin-bottom: 18px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .us-flavor {
          font-size: 11px;
          font-style: italic;
          color: rgba(212,203,184,0.55);
          text-align: center;
          max-width: 200px;
          line-height: 1.6;
          margin-bottom: 24px;
          min-height: 34px;
          transition: opacity 0.4s;
        }

        .us-enter-btn {
          border-radius: 3px;
          padding: 10px 28px;
          font-family: 'Cinzel', serif;
          font-size: 10px;
          letter-spacing: 3px;
          cursor: pointer;
          background: transparent;
          transition: background 0.25s, box-shadow 0.25s;
        }
        .us-enter-btn:hover {
          background: rgba(255,255,255,0.06);
        }

        @media (max-width: 639px) {
          .us-panels-wrapper {
            flex-direction: column !important;
          }
          .us-panel-40k { border-right: none; border-bottom: 1px solid #2a1a1a; }
          .us-panel-aos { border-left: none; border-top: 1px solid #1a1a2a; }
        }
      `}</style>

      {/* Small header */}
      <div style={{
        flexShrink: 0,
        padding: "16px 24px 14px",
        textAlign: "center",
        borderBottom: "1px solid #1e1c17",
        background: "rgba(10,8,6,0.8)",
        animation: "usFadeIn 0.6s ease-out both",
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          letterSpacing: "0.5em",
          color: "#5a5040",
          textTransform: "uppercase",
          marginBottom: 5,
        }}>
          CHOOSE YOUR REALM
        </div>
        <div style={{
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: "clamp(14px, 4vw, 20px)",
          color: "#d4cbb8",
          fontWeight: 700,
        }}>
          Seleziona il tuo Universo
        </div>
      </div>

      {/* Two panels */}
      <div className="us-panels-wrapper" style={{
        flex: 1,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
      }}>
        {UNIVERSES.map((u) => {
          const isHovered = hovered === u.id;
          const otherHovered = hovered !== null && hovered !== u.id;
          const flexVal = isHovered ? 1.4 : otherHovered ? 0.6 : 1;

          return (
            <div
              key={u.id}
              className={`us-panel us-panel-${u.id}`}
              style={{
                flex: flexVal,
                background: u.bg,
              }}
              onMouseEnter={() => setHovered(u.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(u.id)}
            >
              {/* Top border gradient */}
              <div
                className="us-panel-top-border"
                style={{
                  background: `linear-gradient(to right, transparent, ${u.accent}, transparent)`,
                  opacity: isHovered ? 1 : 0.3,
                }}
              />

              {/* Radial glow background */}
              <div
                className="us-glow"
                style={{
                  background: `radial-gradient(ellipse at 50% 50%, ${u.accent}22 0%, transparent 70%)`,
                  opacity: isHovered ? 1 : 0,
                }}
              />

              {/* Icon */}
              <div
                className="us-icon"
                style={{
                  fontSize: isHovered ? 80 : 60,
                  filter: isHovered
                    ? `drop-shadow(0 0 16px ${u.accent}) drop-shadow(0 0 30px ${u.accent}88)`
                    : "none",
                  color: u.accent,
                }}
              >
                {u.icon}
              </div>

              {/* Universe name */}
              <div className="us-name">{u.name}</div>

              {/* Universe subtitle */}
              <div className="us-subtitle" style={{ color: u.accent }}>
                {u.subtitle}
              </div>

              {/* Expanding divider */}
              <div
                className="us-divider"
                style={{
                  width: isHovered ? 60 : 24,
                  background: `linear-gradient(to right, transparent, ${u.accent}, transparent)`,
                }}
              />

              {/* Flavor text */}
              <div
                className="us-flavor"
                style={{ opacity: isHovered ? 1 : 0 }}
              >
                {u.flavorText}
              </div>

              {/* ENTER button */}
              <button
                className="us-enter-btn"
                style={{
                  border: `1px solid ${u.accent}`,
                  color: u.accent,
                  boxShadow: isHovered
                    ? `0 0 18px ${u.accent}55, 0 0 36px ${u.accent}22`
                    : "none",
                }}
                onClick={(e) => { e.stopPropagation(); onSelect(u.id); }}
              >
                ENTER
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
