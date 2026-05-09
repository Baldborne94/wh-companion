// src/components/LoginGate.jsx
import { signInWithGoogle } from "../lib/supabase";

const S = {
  gate: {
    position:"fixed", inset:0, zIndex:9999,
    background:"#060503",
    display:"flex", flexDirection:"column",
    alignItems:"center", justifyContent:"center",
    padding:"32px 20px", overflow:"hidden",
    fontFamily:"'Cinzel',serif",
  },
  vignette: {
    position:"absolute", inset:0, pointerEvents:"none",
    background:"radial-gradient(ellipse 75% 75% at 50% 42%, transparent 25%, #000000e8 100%)",
    zIndex:1,
  },
  scratches: {
    position:"absolute", inset:0, pointerEvents:"none", zIndex:1,
    backgroundImage:[
      "repeating-linear-gradient(89deg,transparent,transparent 3px,rgba(180,150,80,0.012) 3px,rgba(180,150,80,0.012) 4px)",
      "repeating-linear-gradient(1deg,transparent,transparent 7px,rgba(0,0,0,0.07) 7px,rgba(0,0,0,0.07) 8px)",
    ].join(","),
  },
  corner: (pos) => ({
    position:"absolute", width:52, height:52,
    borderColor:"#c9a84c28", borderStyle:"solid", borderWidth:0,
    ...(pos==="tl"?{top:14,left:14,borderTopWidth:1,borderLeftWidth:1}:
        pos==="tr"?{top:14,right:14,borderTopWidth:1,borderRightWidth:1}:
        pos==="bl"?{bottom:14,left:14,borderBottomWidth:1,borderLeftWidth:1}:
                   {bottom:14,right:14,borderBottomWidth:1,borderRightWidth:1}),
  }),
  content: {
    position:"relative", zIndex:2,
    display:"flex", flexDirection:"column",
    alignItems:"center", textAlign:"center",
    maxWidth:520, width:"100%",
  },
  kicker: {
    fontSize:8, letterSpacing:5, color:"#b0302050",
    textTransform:"uppercase", marginBottom:6,
  },
  aquila: {
    width:"min(420px, 88vw)",
    opacity:0.82,
    filter:"drop-shadow(0 0 24px #c9a84c28) drop-shadow(0 0 8px #c9a84c14)",
    margin:"2px 0 10px",
  },
  rule: (dim) => ({
    width: dim ? 130 : 210,
    height:1, margin:"8px auto",
    background: dim
      ? "linear-gradient(90deg,transparent,#c9a84c28,transparent)"
      : "linear-gradient(90deg,transparent,#c9a84c70,#c9a84cb0,#c9a84c70,transparent)",
  }),
  title: {
    fontSize:"clamp(20px,5vw,28px)", fontWeight:700, color:"#d4cbb8",
    letterSpacing:3, lineHeight:1.2,
    fontFamily:"'Cinzel Decorative',serif",
    margin:"6px 0 2px",
  },
  subtitle: {
    fontSize:9, letterSpacing:10, color:"#c9a84c",
    textTransform:"uppercase", marginBottom:10,
  },
  motto: {
    fontSize:"clamp(9px,2vw,11px)", fontStyle:"italic",
    color:"#504838", letterSpacing:2,
    lineHeight:2.2, margin:"8px 0",
  },
  mottoStrong: {
    color:"#6a5c44", fontStyle:"normal",
    fontSize:"clamp(10px,2.2vw,13px)", letterSpacing:2,
  },
  btn: {
    marginTop:18,
    padding:"13px 34px",
    background:"transparent",
    border:"1px solid #c9a84c",
    borderRadius:2,
    color:"#c9a84c",
    fontFamily:"'Cinzel',serif",
    fontSize:10, letterSpacing:5,
    textTransform:"uppercase",
    cursor:"pointer",
    transition:"all .25s",
    display:"flex", alignItems:"center", gap:8,
  },
  footnote: {
    marginTop:14, fontSize:7.5,
    letterSpacing:3, color:"#24201480",
    textTransform:"uppercase",
  },
};

export default function LoginGate() {
  const [hover, setHover] = window.React.useState(false);
  return (
    <div style={S.gate}>
      <div style={S.vignette}/>
      <div style={S.scratches}/>
      {["tl","tr","bl","br"].map(p=><div key={p} style={S.corner(p)}/>)}
      <div style={S.content}>
        <p style={S.kicker}>Adeptus Terra · Segmentum Solar · M41</p>
        <img src="/aquila.png" alt="Imperial Aquila" style={S.aquila}/>
        <div style={S.rule(false)}/>
        <p style={S.title}>WARHAMMER<br/>40,000</p>
        <p style={S.subtitle}>Companion</p>
        <div style={S.rule(false)}/>
        <p style={S.motto}>
          In the grim darkness of the far future,<br/>
          <span style={S.mottoStrong}>there is only war.</span>
        </p>
        <div style={S.rule(true)}/>
        <button
          style={{...S.btn, ...(hover?{borderColor:"#d4a84c",color:"#e0b860"}:{})}}
          onMouseEnter={()=>setHover(true)}
          onMouseLeave={()=>setHover(false)}
          onClick={signInWithGoogle}
        >
          ⸻&nbsp; Enter the Sanctum &nbsp;⸻
        </button>
        <p style={S.footnote}>Per Voluntatem Imperatoris</p>
      </div>
    </div>
  );
}