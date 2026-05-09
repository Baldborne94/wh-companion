import { useState } from "react";
import { signInWithGoogle } from "../lib/supabase";

export default function LoginGate() {
  const [hover, setHover] = useState(false);

  const gate = {
    position:"fixed",inset:0,zIndex:9999,
    background:"#060503",
    display:"flex",flexDirection:"column",
    alignItems:"center",justifyContent:"center",
    padding:"32px 20px",overflow:"hidden",
    fontFamily:"'Cinzel',serif",
  };
  const vignette = {
    position:"absolute",inset:0,pointerEvents:"none",zIndex:1,
    background:"radial-gradient(ellipse 75% 75% at 50% 42%, transparent 25%, #000000e8 100%)",
  };
  const scratches = {
    position:"absolute",inset:0,pointerEvents:"none",zIndex:1,
    backgroundImage:[
      "repeating-linear-gradient(89deg,transparent,transparent 3px,rgba(180,150,80,0.012) 3px,rgba(180,150,80,0.012) 4px)",
      "repeating-linear-gradient(1deg,transparent,transparent 7px,rgba(0,0,0,0.07) 7px,rgba(0,0,0,0.07) 8px)",
    ].join(","),
  };
  const content = {
    position:"relative",zIndex:2,
    display:"flex",flexDirection:"column",
    alignItems:"center",textAlign:"center",
    maxWidth:520,width:"100%",
  };
  const cornerStyle = (pos) => ({
    position:"absolute",width:52,height:52,
    borderColor:"#c9a84c28",borderStyle:"solid",borderWidth:0,
    ...(pos==="tl"?{top:14,left:14,borderTopWidth:1,borderLeftWidth:1}:
        pos==="tr"?{top:14,right:14,borderTopWidth:1,borderRightWidth:1}:
        pos==="bl"?{bottom:14,left:14,borderBottomWidth:1,borderLeftWidth:1}:
                   {bottom:14,right:14,borderBottomWidth:1,borderRightWidth:1}),
  });
  const rule = (dim) => ({
    width:dim?130:210,height:1,margin:"8px auto",
    background:dim
      ?"linear-gradient(90deg,transparent,#c9a84c28,transparent)"
      :"linear-gradient(90deg,transparent,#c9a84c70,#c9a84cb0,#c9a84c70,transparent)",
  });
  const btnStyle = {
    marginTop:18,padding:"13px 34px",
    background:"transparent",
    border:"1px solid " + (hover?"#d4a84c":"#c9a84c"),
    borderRadius:2,
    color:hover?"#e0b860":"#c9a84c",
    fontFamily:"'Cinzel',serif",
    fontSize:10,letterSpacing:5,textTransform:"uppercase",
    cursor:"pointer",display:"flex",alignItems:"center",gap:8,
    transition:"all .25s",
  };

  return (
    <div style={gate}>
      <div style={vignette}/>
      <div style={scratches}/>
      {["tl","tr","bl","br"].map(p=><div key={p} style={cornerStyle(p)}/>)}
      <div style={content}>
        <p style={{fontSize:8,letterSpacing:5,color:"#b0302050",textTransform:"uppercase",marginBottom:6}}>
          Adeptus Terra &middot; Segmentum Solar &middot; M41
        </p>
        <img
          src="/aquila.png"
          alt="Imperial Aquila"
          style={{
            width:"min(400px,88vw)",
            opacity:0.82,
            filter:"drop-shadow(0 0 24px #c9a84c28) drop-shadow(0 0 8px #c9a84c14)",
            margin:"2px 0 10px",
          }}
        />
        <div style={rule(false)}/>
        <p style={{fontSize:"clamp(20px,5vw,28px)",fontWeight:700,color:"#d4cbb8",letterSpacing:3,lineHeight:1.2,fontFamily:"'Cinzel Decorative',serif",margin:"6px 0 2px"}}>
          WARHAMMER<br/>40,000
        </p>
        <p style={{fontSize:9,letterSpacing:10,color:"#c9a84c",textTransform:"uppercase",marginBottom:10}}>
          Companion
        </p>
        <div style={rule(false)}/>
        <p style={{fontSize:"clamp(9px,2vw,11px)",fontStyle:"italic",color:"#504838",letterSpacing:2,lineHeight:2.2,margin:"8px 0"}}>
          In the grim darkness of the far future,<br/>
          <span style={{color:"#6a5c44",fontStyle:"normal",fontSize:"clamp(10px,2.2vw,13px)",letterSpacing:2}}>
            there is only war.
          </span>
        </p>
        <div style={rule(true)}/>
        <button
          style={btnStyle}
          onMouseEnter={()=>setHover(true)}
          onMouseLeave={()=>setHover(false)}
          onClick={signInWithGoogle}
        >
          &mdash;&nbsp; Enter the Sanctum &nbsp;&mdash;
        </button>
        <p style={{marginTop:14,fontSize:7.5,letterSpacing:3,color:"#24201480",textTransform:"uppercase"}}>
          Per Voluntatem Imperatoris
        </p>
      </div>
    </div>
  );
}