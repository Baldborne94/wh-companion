import { signInWithGoogle } from "../lib/supabase";

const SILVER = "#c8c4bc";
const SILVER_DIM = "#706c64";
const RED = "#C0392B";
const BLUE = "#4a7cb5";
const AOS_GOLD = "#C9A227";

export default function LoginPage({ authLoading, onEnter, user }) {
  const handleSignIn = () => {
    if (onEnter) onEnter();
    signInWithGoogle();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: [
        "radial-gradient(ellipse at 20% 55%, rgba(192,57,43,0.09) 0%, transparent 48%)",
        "radial-gradient(ellipse at 80% 45%, rgba(74,124,181,0.09) 0%, transparent 48%)",
        "radial-gradient(ellipse at 50% 44%, #111009 0%, #080706 50%, #040302 80%, #000 100%)",
      ].join(", "),
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap');

        @keyframes ring40k   { 0%,100%{opacity:0.07;} 50%{opacity:0.20;} }
        @keyframes ringAoS   { 0%,100%{opacity:0.04;} 50%{opacity:0.13;} }
        @keyframes ringOuter { 0%,100%{opacity:0.02;} 50%{opacity:0.07;} }
        @keyframes silverShimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
@keyframes loginGlow { 0%,100%{box-shadow:0 0 10px rgba(200,196,188,.1),0 0 28px rgba(200,196,188,.03);} 50%{box-shadow:0 0 20px rgba(200,196,188,.22),0 0 44px rgba(200,196,188,.07);} }
        @keyframes loginBtnHov { 0%,100%{box-shadow:0 0 16px rgba(200,196,188,.18);} 50%{box-shadow:0 0 30px rgba(200,196,188,.38);} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
        @keyframes cornerPulse { 0%,100%{opacity:0.35;} 50%{opacity:0.6;} }
        @keyframes spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }

        .login-btn {
          background: transparent;
          border: 1px solid rgba(200,196,188,0.5);
          border-radius: 2px;
          color: ${SILVER};
          padding: 13px 34px;
          font-family: 'Cinzel', serif;
          font-size: 11px;
          letter-spacing: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: background 0.2s, box-shadow 0.2s;
          animation: loginGlow 3.5s ease-in-out infinite;
          text-transform: uppercase;
        }
        .login-btn:hover  { background:rgba(200,196,188,0.06); animation:loginBtnHov 1.5s ease-in-out infinite; }
        .login-btn:active { background:rgba(200,196,188,0.12); }
      `}</style>

      {/* Pulsing rings: red (40K inner), blue (AoS mid), silver (outer) */}
      {[
        { size:310, delay:"0s",   anim:"ring40k",   color:RED  },
        { size:500, delay:"1.2s", anim:"ringAoS",   color:BLUE },
        { size:710, delay:"2.4s", anim:"ringOuter", color:SILVER },
      ].map((r, i) => (
        <div key={i} style={{
          position:"absolute", left:"50%", top:"44%",
          width:r.size, height:r.size, borderRadius:"50%",
          border:`1px solid ${r.color}`,
          animation:`${r.anim} 4s ease-in-out infinite ${r.delay}`,
          transform:"translate(-50%,-50%)",
          pointerEvents:"none",
        }}/>
      ))}

      {/* Corner accents: top-left 40K red, top-right silver, bottom-left silver, bottom-right AoS blue */}
      {[
        { top:20,    left:20,    borderTop:`1px solid ${RED}`,    borderLeft:`1px solid ${RED}`,    delay:"0s"   },
        { top:20,    right:20,   borderTop:`1px solid ${SILVER}`, borderRight:`1px solid ${SILVER}`, delay:"0.3s" },
        { bottom:20, left:20,    borderBottom:`1px solid ${SILVER}`, borderLeft:`1px solid ${SILVER}`, delay:"0.6s" },
        { bottom:20, right:20,   borderBottom:`1px solid ${BLUE}`,   borderRight:`1px solid ${BLUE}`,  delay:"0.9s" },
      ].map(({ delay, ...s }, i) => (
        <div key={i} style={{
          position:"absolute", ...s,
          width:44, height:44,
          animation:`cornerPulse 3.5s ease-in-out infinite ${delay}`,
          pointerEvents:"none",
        }}/>
      ))}

      {/* Subtle horizontal split light */}
      <div style={{
        position:"absolute", top:"42%", left:0, right:0, height:1,
        background:"linear-gradient(to right,transparent,rgba(192,57,43,0.15) 30%,rgba(74,124,181,0.15) 70%,transparent)",
        pointerEvents:"none",
      }}/>

      {/* Main content */}
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"center",
        position:"relative", zIndex:1,
        animation:"fadeInUp 0.9s ease-out both",
      }}>

        {/* Title */}
        <h1 style={{
          fontFamily:"'Cinzel Decorative', serif",
          fontSize:"clamp(28px,8vw,52px)",
          fontWeight:900,
          letterSpacing:"0.12em",
          margin:0,
          background:`linear-gradient(90deg,${SILVER_DIM} 0%,${SILVER} 25%,#ffffff 50%,${SILVER} 75%,${SILVER_DIM} 100%)`,
          backgroundSize:"200% auto",
          WebkitBackgroundClip:"text",
          WebkitTextFillColor:"transparent",
          backgroundClip:"text",
          animation:"silverShimmer 5s linear infinite",
        }}>
          WARHAMMER
        </h1>

        <div style={{
          fontFamily:"'Cinzel', serif",
          fontSize:"clamp(8px,1.8vw,11px)",
          letterSpacing:"0.6em",
          color:SILVER_DIM,
          textTransform:"uppercase",
          marginTop:5,
          marginBottom:22,
        }}>
          COMPANION
        </div>

        {/* Divider — red left, silver diamond, blue right */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <div style={{ width:52, height:1, background:`linear-gradient(to right,transparent,${RED}88)` }}/>
          <div style={{ width:6, height:6, background:SILVER, transform:"rotate(45deg)", flexShrink:0 }}/>
          <div style={{ width:52, height:1, background:`linear-gradient(to left,transparent,${BLUE}88)` }}/>
        </div>

        {/* Universe badge pills */}
        <div style={{ display:"flex", gap:10, marginBottom:20 }}>
          <span style={{
            fontFamily:"'Cinzel', serif", fontSize:8, letterSpacing:"0.35em",
            color:RED, border:`1px solid ${RED}55`, borderRadius:2,
            padding:"4px 10px", textTransform:"uppercase",
          }}>40,000</span>
          <span style={{
            fontFamily:"'Cinzel', serif", fontSize:8, letterSpacing:"0.35em",
            color:AOS_GOLD, border:`1px solid ${AOS_GOLD}55`, borderRadius:2,
            padding:"4px 10px", textTransform:"uppercase",
          }}>Age of Sigmar</span>
        </div>

        {/* Tagline */}
        <p style={{
          fontFamily:"'Cinzel', serif",
          fontSize:"clamp(9px,2vw,11px)",
          color:"rgba(200,196,188,0.5)",
          textAlign:"center",
          maxWidth:280,
          lineHeight:1.9,
          margin:"0 0 32px",
          padding:"0 20px",
          letterSpacing:"0.04em",
        }}>
          Library, campaigns and progress — all synced.
        </p>

        {/* CTA */}
        {!authLoading && (
          onEnter
            ? user
              ? <button className="login-btn" onClick={onEnter}>ENTER THE UNIVERSE</button>
              : <button className="login-btn" onClick={handleSignIn}><GoogleIcon/> SIGN IN WITH GOOGLE</button>
            : <button className="login-btn" onClick={signInWithGoogle}><GoogleIcon/> SIGN IN WITH GOOGLE</button>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position:"absolute", bottom:24,
        fontFamily:"'Cinzel', serif",
        fontSize:8, letterSpacing:"0.5em",
        color:"rgba(200,196,188,0.06)",
        textTransform:"uppercase",
        userSelect:"none", pointerEvents:"none",
      }}>
        FOR GLORY AND HONOUR
      </div>

      {/* Auth loading overlay */}
      {authLoading && (
        <div style={{
          position:"absolute", inset:0, background:"rgba(4,3,2,0.8)",
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          gap:16, zIndex:10,
        }}>
          <div style={{
            width:40, height:40, borderRadius:"50%",
            border:`2px solid rgba(200,196,188,0.15)`,
            borderTopColor:SILVER,
            animation:"spin 1s linear infinite",
          }}/>
          <div style={{ fontFamily:"'Cinzel', serif", fontSize:11, letterSpacing:3, color:SILVER_DIM }}>
            Loading...
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
