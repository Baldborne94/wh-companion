import { signInWithGoogle } from "../lib/supabase";
import { C } from "../data/constants";

export default function LoginPage({ authLoading }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "radial-gradient(ellipse at 50% 40%, #1a0505 0%, #0d0404 35%, #050302 70%, #000000 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap');

        @keyframes ringPulse {
          0%, 100% { opacity: 0.08; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 0.18; transform: translate(-50%, -50%) scale(1.04); }
        }
        @keyframes ringPulse2 {
          0%, 100% { opacity: 0.05; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 0.13; transform: translate(-50%, -50%) scale(1.06); }
        }
        @keyframes ringPulse3 {
          0%, 100% { opacity: 0.03; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 0.09; transform: translate(-50%, -50%) scale(1.08); }
        }
        @keyframes goldShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes loginGlow {
          0%, 100% { box-shadow: 0 0 12px rgba(212,168,71,0.2), 0 0 30px rgba(212,168,71,0.05); }
          50%       { box-shadow: 0 0 20px rgba(212,168,71,0.35), 0 0 50px rgba(212,168,71,0.12); }
        }
        @keyframes loginBtnHover {
          0%, 100% { box-shadow: 0 0 18px rgba(212,168,71,0.3); }
          50%       { box-shadow: 0 0 30px rgba(212,168,71,0.5); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cornerGlow {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.6; }
        }

        .login-btn {
          background: transparent;
          border: 1px solid ${C.gold};
          border-radius: 4px;
          color: ${C.text};
          padding: 13px 32px;
          font-family: 'Cinzel', serif;
          font-size: 11px;
          letter-spacing: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: background 0.2s, box-shadow 0.2s;
          animation: loginGlow 3s ease-in-out infinite;
        }
        .login-btn:hover {
          background: rgba(212,168,71,0.08);
          animation: loginBtnHover 1.5s ease-in-out infinite;
        }
        .login-btn:active {
          background: rgba(212,168,71,0.15);
        }
      `}</style>

      {/* Concentric pulsing rings */}
      <div style={{
        position: "absolute", left: "50%", top: "42%",
        width: 320, height: 320, borderRadius: "50%",
        border: `1px solid ${C.gold}`,
        animation: "ringPulse 4s ease-in-out infinite",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}/>
      <div style={{
        position: "absolute", left: "50%", top: "42%",
        width: 480, height: 480, borderRadius: "50%",
        border: `1px solid ${C.gold}`,
        animation: "ringPulse2 4s ease-in-out infinite 0.8s",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}/>
      <div style={{
        position: "absolute", left: "50%", top: "42%",
        width: 660, height: 660, borderRadius: "50%",
        border: `1px solid ${C.gold}`,
        animation: "ringPulse3 4s ease-in-out infinite 1.6s",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}/>

      {/* Corner decorative frames */}
      {[
        { top: 20, left: 20, borderTop: `2px solid ${C.gold}`, borderLeft: `2px solid ${C.gold}` },
        { top: 20, right: 20, borderTop: `2px solid ${C.gold}`, borderRight: `2px solid ${C.gold}` },
        { bottom: 20, left: 20, borderBottom: `2px solid ${C.gold}`, borderLeft: `2px solid ${C.gold}` },
        { bottom: 20, right: 20, borderBottom: `2px solid ${C.gold}`, borderRight: `2px solid ${C.gold}` },
      ].map((s, i) => (
        <div key={i} style={{
          position: "absolute", ...s,
          width: 40, height: 40,
          animation: `cornerGlow 3s ease-in-out infinite ${i * 0.4}s`,
          pointerEvents: "none",
        }}/>
      ))}

      {/* Main content */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 0, position: "relative", zIndex: 1,
        animation: "fadeInUp 0.8s ease-out both",
      }}>
        {/* WARHAMMER title with gold shimmer */}
        <h1 style={{
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: "clamp(32px, 9vw, 62px)",
          fontWeight: 900,
          letterSpacing: "0.12em",
          margin: 0,
          background: `linear-gradient(90deg, ${C.goldDim} 0%, ${C.gold} 30%, #f0d080 50%, ${C.gold} 70%, ${C.goldDim} 100%)`,
          backgroundSize: "200% auto",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: "goldShimmer 4s linear infinite",
        }}>
          WARHAMMER
        </h1>

        {/* COMPANION subtitle */}
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: "clamp(9px, 2vw, 13px)",
          letterSpacing: "0.6em",
          color: C.goldDim,
          textTransform: "uppercase",
          marginTop: 6,
          marginBottom: 28,
        }}>
          COMPANION
        </div>

        {/* Diamond divider */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          marginBottom: 28,
        }}>
          <div style={{ width: 60, height: 1, background: `linear-gradient(to right, transparent, ${C.goldDim})` }}/>
          <div style={{
            width: 8, height: 8,
            background: C.gold,
            transform: "rotate(45deg)",
            flexShrink: 0,
          }}/>
          <div style={{ width: 60, height: 1, background: `linear-gradient(to left, transparent, ${C.goldDim})` }}/>
        </div>

        {/* Italian tagline */}
        <p style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: "clamp(10px, 2.2vw, 13px)",
          color: C.muted,
          textAlign: "center",
          maxWidth: 320,
          lineHeight: 1.7,
          marginBottom: 36,
          padding: "0 20px",
        }}>
          La tua libreria, le tue campagne e i tuoi progressi.<br/>
          Sincronizzati su tutti i tuoi dispositivi.
        </p>

        {/* Google login button */}
        <button className="login-btn" onClick={signInWithGoogle}>
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          ACCEDI CON GOOGLE
        </button>
      </div>

      {/* "PER L'IMPERATORE" faint bottom text */}
      <div style={{
        position: "absolute", bottom: 32,
        fontFamily: "'Cinzel', serif",
        fontSize: 10,
        letterSpacing: "0.5em",
        color: "rgba(201,168,76,0.08)",
        textTransform: "uppercase",
        userSelect: "none",
        pointerEvents: "none",
      }}>
        PER L'IMPERATORE
      </div>

      {/* Auth loading overlay */}
      {authLoading && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(5,3,2,0.7)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 16, zIndex: 10,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: `2px solid ${C.border}`,
            borderTopColor: C.gold,
            animation: "spin 1s linear infinite",
          }}/>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 11, letterSpacing: 3,
            color: C.goldDim,
          }}>
            Caricamento...
          </div>
          <style>{`@keyframes spin { from{transform:rotate(0deg);}to{transform:rotate(360deg);} }`}</style>
        </div>
      )}
    </div>
  );
}
