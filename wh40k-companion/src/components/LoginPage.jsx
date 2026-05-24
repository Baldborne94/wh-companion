import { signInWithGoogle } from "../lib/supabase";
import { C } from "../data/constants";

// Official-style Warhammer W+axe logo — bold W with axe blade, square frame
function WarhammerSymbolSVG({ size = 130, color = "#C9A850" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {/* Outer square frame */}
      <rect x="2" y="2" width="96" height="96" stroke={color} strokeWidth="3" fill="none"/>
      {/* Inner frame line */}
      <rect x="6" y="6" width="88" height="88" stroke={color} strokeWidth="0.8" fill="none" opacity="0.45"/>
      {/* Corner accents */}
      <rect x="2" y="2" width="10" height="3" fill={color}/>
      <rect x="88" y="2" width="10" height="3" fill={color}/>
      <rect x="2" y="95" width="10" height="3" fill={color}/>
      <rect x="88" y="95" width="10" height="3" fill={color}/>
      <rect x="2" y="2" width="3" height="10" fill={color}/>
      <rect x="95" y="2" width="3" height="10" fill={color}/>
      <rect x="2" y="88" width="3" height="10" fill={color}/>
      <rect x="95" y="88" width="3" height="10" fill={color}/>
      {/* Bold W shape — two overlapping V strokes */}
      {/* Left V */}
      <polygon points="10,18 22,18 32,68 34,68 22,24 34,68 42,18 50,18 36,78 28,78" fill={color}/>
      {/* Right V */}
      <polygon points="50,18 58,18 64,78 56,78 50,24 62,68 64,68 74,18 86,18 72,78 64,78" fill={color}/>
      {/* Center cap block */}
      <rect x="43" y="8" width="14" height="10" fill={color}/>
      {/* Bottom base bar */}
      <rect x="8" y="82" width="84" height="7" fill={color}/>
      {/* Axe blade on the right side of W */}
      <polygon points="80,36 92,28 96,40 92,52 80,44 84,40" fill={color} opacity="0.9"/>
      <rect x="77" y="38" width="6" height="4" fill={color}/>
    </svg>
  );
}

// onEnter: provided → "welcome/splash" mode (show before auth)
// user:    provided → user is already logged in
export default function LoginPage({ authLoading, onEnter, user }) {
  const handleSignIn = () => {
    if (onEnter) onEnter(); // persist "started" in sessionStorage before redirect
    signInWithGoogle();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "radial-gradient(ellipse at 50% 40%, #12100a 0%, #090806 45%, #050302 80%, #000000 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap');

        @keyframes ringPulse  { 0%,100%{opacity:0.07;transform:translate(-50%,-50%) scale(1);}   50%{opacity:0.16;transform:translate(-50%,-50%) scale(1.04);} }
        @keyframes ringPulse2 { 0%,100%{opacity:0.04;transform:translate(-50%,-50%) scale(1);}   50%{opacity:0.11;transform:translate(-50%,-50%) scale(1.06);} }
        @keyframes ringPulse3 { 0%,100%{opacity:0.025;transform:translate(-50%,-50%) scale(1);}  50%{opacity:0.08;transform:translate(-50%,-50%) scale(1.08);} }
        @keyframes goldShimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
        @keyframes logoGlow    { 0%,100%{filter:drop-shadow(0 0 8px #C9A85044);} 50%{filter:drop-shadow(0 0 24px #C9A85088);} }
        @keyframes loginGlow   { 0%,100%{box-shadow:0 0 12px rgba(201,168,80,.18),0 0 30px rgba(201,168,80,.05);} 50%{box-shadow:0 0 22px rgba(201,168,80,.35),0 0 50px rgba(201,168,80,.12);} }
        @keyframes loginBtnHov { 0%,100%{box-shadow:0 0 18px rgba(201,168,80,.3);} 50%{box-shadow:0 0 32px rgba(201,168,80,.55);} }
        @keyframes fadeInUp    { from{opacity:0;transform:translateY(22px);} to{opacity:1;transform:translateY(0);} }
        @keyframes cornerGlow  { 0%,100%{opacity:0.3;} 50%{opacity:0.55;} }
        @keyframes spin        { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }

        .login-btn {
          background: transparent;
          border: 1px solid ${C.gold};
          border-radius: 3px;
          color: ${C.text};
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
        .login-btn:hover  { background:rgba(201,168,80,0.08); animation:loginBtnHov 1.5s ease-in-out infinite; }
        .login-btn:active { background:rgba(201,168,80,0.15); }
      `}</style>

      {/* Pulsing rings */}
      {[
        { size:300, delay:"0s",   anim:"ringPulse" },
        { size:470, delay:"0.9s", anim:"ringPulse2" },
        { size:660, delay:"1.8s", anim:"ringPulse3" },
      ].map((r,i) => (
        <div key={i} style={{
          position:"absolute", left:"50%", top:"44%",
          width:r.size, height:r.size, borderRadius:"50%",
          border:`1px solid ${C.gold}`,
          animation:`${r.anim} 4.5s ease-in-out infinite ${r.delay}`,
          transform:"translate(-50%,-50%)",
          pointerEvents:"none",
        }}/>
      ))}

      {/* Corner frames */}
      {[
        { top:20,    left:20,  borderTop:`2px solid ${C.gold}`,    borderLeft:`2px solid ${C.gold}` },
        { top:20,    right:20, borderTop:`2px solid ${C.gold}`,    borderRight:`2px solid ${C.gold}` },
        { bottom:20, left:20,  borderBottom:`2px solid ${C.gold}`, borderLeft:`2px solid ${C.gold}` },
        { bottom:20, right:20, borderBottom:`2px solid ${C.gold}`, borderRight:`2px solid ${C.gold}` },
      ].map((s,i) => (
        <div key={i} style={{
          position:"absolute", ...s,
          width:44, height:44,
          animation:`cornerGlow 3s ease-in-out infinite ${i*0.4}s`,
          pointerEvents:"none",
        }}/>
      ))}

      {/* Main content */}
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"center",
        position:"relative", zIndex:1,
        animation:"fadeInUp 0.9s ease-out both",
      }}>
        {/* Logo */}
        <div style={{ marginBottom:20, animation:"logoGlow 4s ease-in-out infinite" }}>
          <WarhammerSymbolSVG size={130} color={C.gold}/>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily:"'Cinzel Decorative', serif",
          fontSize:"clamp(28px,8vw,54px)",
          fontWeight:900,
          letterSpacing:"0.1em",
          margin:0,
          background:`linear-gradient(90deg,${C.goldDim} 0%,${C.gold} 30%,#f0d080 50%,${C.gold} 70%,${C.goldDim} 100%)`,
          backgroundSize:"200% auto",
          WebkitBackgroundClip:"text",
          WebkitTextFillColor:"transparent",
          backgroundClip:"text",
          animation:"goldShimmer 4.5s linear infinite",
        }}>
          WARHAMMER
        </h1>

        <div style={{
          fontFamily:"'Cinzel', serif",
          fontSize:"clamp(8px,1.8vw,12px)",
          letterSpacing:"0.55em",
          color:C.goldDim,
          textTransform:"uppercase",
          marginTop:6,
          marginBottom:24,
        }}>
          COMPANION
        </div>

        {/* Divider */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
          <div style={{ width:56, height:1, background:`linear-gradient(to right,transparent,${C.goldDim})` }}/>
          <div style={{ width:7, height:7, background:C.gold, transform:"rotate(45deg)", flexShrink:0 }}/>
          <div style={{ width:56, height:1, background:`linear-gradient(to left,transparent,${C.goldDim})` }}/>
        </div>

        {/* Tagline */}
        <p style={{
          fontFamily:"'Cinzel', serif",
          fontSize:"clamp(9px,2vw,11px)",
          color:C.muted,
          textAlign:"center",
          maxWidth:300,
          lineHeight:1.9,
          marginBottom:8,
          padding:"0 20px",
          letterSpacing:"0.05em",
        }}>
          Two universes. Infinite stories.
        </p>
        <p style={{
          fontFamily:"system-ui, sans-serif",
          fontSize:"clamp(10px,2vw,12px)",
          color:"rgba(150,135,110,0.6)",
          textAlign:"center",
          maxWidth:320,
          lineHeight:1.7,
          marginBottom:36,
          padding:"0 20px",
        }}>
          Explore the 41st Millennium of Warhammer 40,000<br/>
          and the Mortal Realms of Age of Sigmar.<br/>
          Library, campaigns and progress — all synced.
        </p>

        {/* CTA button — changes based on mode and auth state */}
        {!authLoading && (
          onEnter
            ? user
              /* welcome mode + already logged in → ENTER */
              ? <button className="login-btn" onClick={onEnter}>
                  ENTER THE UNIVERSE
                </button>
              /* welcome mode + not logged in → Google sign in (sets started first) */
              : <button className="login-btn" onClick={handleSignIn}>
                  <GoogleIcon/> SIGN IN WITH GOOGLE
                </button>
            /* standard login mode (post-redirect fallback) */
            : <button className="login-btn" onClick={signInWithGoogle}>
                <GoogleIcon/> SIGN IN WITH GOOGLE
              </button>
        )}
      </div>

      {/* Faint footer */}
      <div style={{
        position:"absolute", bottom:28,
        fontFamily:"'Cinzel', serif",
        fontSize:9, letterSpacing:"0.45em",
        color:"rgba(201,168,76,0.07)",
        textTransform:"uppercase",
        userSelect:"none", pointerEvents:"none",
      }}>
        FOR GLORY AND HONOUR
      </div>

      {/* Auth loading overlay */}
      {authLoading && (
        <div style={{
          position:"absolute", inset:0, background:"rgba(5,3,2,0.75)",
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          gap:16, zIndex:10,
        }}>
          <div style={{
            width:40, height:40, borderRadius:"50%",
            border:`2px solid ${C.border}`,
            borderTopColor:C.gold,
            animation:"spin 1s linear infinite",
          }}/>
          <div style={{ fontFamily:"'Cinzel', serif", fontSize:11, letterSpacing:3, color:C.goldDim }}>
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
