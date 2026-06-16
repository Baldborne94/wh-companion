import { useState, useRef } from "react";
import { useLang } from "../lib/i18n.jsx";

// Visual style per slide; the text (tag/title/body/bullets) comes from i18n,
// matched by index to onboarding.slides in data/i18n/translations.js.
const SLIDE_STYLES = [
  { accent: "#c9a84c", bg: "linear-gradient(160deg,#1a1000 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#2a1a00,#1a1000)", icon: null },
  { accent: "#4a8adc", bg: "linear-gradient(160deg,#0a1520 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#0a1a2a,#0a1520)", icon: "📚" },
  { accent: "#b03030", bg: "linear-gradient(160deg,#200a0a 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#2a0a0a,#200a0a)", icon: "🗺" },
  { accent: "#4aaa6a", bg: "linear-gradient(160deg,#0a1a10 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#0a1a10,#0a2010)", icon: "📖" },
  { accent: "#9a4adc", bg: "linear-gradient(160deg,#130a20 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#1a0a2a,#130a20)", icon: "🔮" },
  { accent: "#2a9dc9", bg: "linear-gradient(160deg,#071520 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#071a25,#071520)", icon: "🎵" },
  { accent: "#c9a84c", bg: "linear-gradient(160deg,#1a1000 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#2a1800,#1a1000)", icon: "🎨" },
  { accent: "#c9a84c", bg: "linear-gradient(160deg,#1a1000 0%,#0a0905 100%)", iconBg: "linear-gradient(135deg,#2a1800,#1a1000)", icon: "🏆" },
];

export default function OnboardingModal({ onClose }) {
  const { t } = useLang();
  const texts = t("onboarding.slides");
  const SLIDES = SLIDE_STYLES.map((st, i) => ({ ...st, ...texts[i] }));
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef(null);
  const s = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  const next = () => {
    if (isLast) onClose();
    else setSlide(i => i + 1);
  };
  const prev = () => setSlide(i => Math.max(0, i - 1));

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -50 && slide < SLIDES.length - 1) setSlide(i => i + 1);
    else if (dx > 50 && slide > 0) setSlide(i => i - 1);
    touchStartX.current = null;
  };

  const gold = "#c9a84c";
  const aosGold = "#C9A227";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div style={{ width: "100%", maxWidth: 480, height: "100%", maxHeight: 680, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

        {/* Slide strip */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div style={{ display: "flex", height: "100%", transform: `translateX(${-slide * 100}%)`, transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1)" }}>
            {SLIDES.map((sl, i) => (
              <div key={i} style={{ minWidth: "100%", height: "100%", display: "flex", flexDirection: "column", background: sl.bg }}>

                {/* Icon area */}
                <div style={{ flex: "0 0 42%", background: sl.iconBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                  {/* Decorative ring */}
                  <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", border: `1px solid ${sl.accent}22`, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                  <div style={{ position: "absolute", width: 240, height: 240, borderRadius: "50%", border: `1px solid ${sl.accent}11`, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />

                  {sl.icon === null ? (
                    /* Welcome slide: both universe logos */
                    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}>
                        <img src="/aquila.png" alt="40K" style={{ width: 56, height: 56, filter: `drop-shadow(0 0 12px ${gold}88)`, opacity: 0.95 }} />
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: gold, letterSpacing: 2, marginTop: 6, opacity: 0.7 }}>40,000</div>
                      </div>
                      <div style={{ width: 1, height: 50, background: `linear-gradient(to bottom,transparent,${gold}44,transparent)` }} />
                      <div style={{ textAlign: "center" }}>
                        <img src="/sigmar.png" alt="AoS" style={{ width: 56, height: 56, filter: `drop-shadow(0 0 12px ${aosGold}88)`, opacity: 0.95 }} />
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: aosGold, letterSpacing: 2, marginTop: 6, opacity: 0.7 }}>AGE OF SIGMAR</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 64, lineHeight: 1, filter: `drop-shadow(0 4px 16px ${sl.accent}66)` }}>{sl.icon}</div>
                  )}

                  {/* Bottom glow line */}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(to right,transparent,${sl.accent}66,transparent)` }} />
                </div>

                {/* Text area */}
                <div style={{ flex: 1, padding: "24px 28px 0", display: "flex", flexDirection: "column", overflowY: "auto" }}>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: sl.accent, letterSpacing: 3, marginBottom: 8, opacity: 0.85 }}>{sl.tag}</div>
                  <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color: "#d4cbb8", lineHeight: 1.2, marginBottom: 14 }}>{sl.title}</div>
                  {sl.body && <p style={{ fontSize: 13, color: "#9a9080", lineHeight: 1.65, marginBottom: 8 }}>{sl.body}</p>}
                  {sl.bullets?.length > 0 && (
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                      {sl.bullets.map((b, bi) => (
                        <li key={bi} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <span style={{ color: sl.accent, fontSize: 10, marginTop: 3, flexShrink: 0 }}>✦</span>
                          <span style={{ fontSize: 13, color: "#b8ae9c", lineHeight: 1.55 }}>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation footer */}
        <div style={{ background: "#0a0905", borderTop: "1px solid #2a2518", padding: "16px 24px 20px", flexShrink: 0 }}>
          {/* Progress dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, background: i === slide ? s.accent : "#3a3428", border: "none", cursor: "pointer", transition: "all 0.25s", padding: 0 }} />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Skip / Back */}
            {slide === 0 ? (
              <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#7a7060", fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, cursor: "pointer", padding: "8px 4px" }}>{t("onboarding.skip")}</button>
            ) : (
              <button onClick={prev} style={{ background: "transparent", border: `1px solid #3a3428`, borderRadius: 8, color: "#7a7060", fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, cursor: "pointer", padding: "8px 16px" }}>← {t("onboarding.back")}</button>
            )}

            {/* Next / Start */}
            <button onClick={next} style={{ background: `linear-gradient(135deg,${s.accent},${s.accent}99)`, border: "none", borderRadius: 10, color: "#0a0905", fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", padding: "10px 28px", boxShadow: `0 4px 16px ${s.accent}44`, transition: "all 0.2s" }}>
              {isLast ? `${t("onboarding.begin")} ⚔` : `${t("onboarding.next")} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
