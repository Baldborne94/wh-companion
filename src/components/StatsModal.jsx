import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useLang } from "../lib/i18n.jsx";
import {
  READING_ACHIEVEMENTS, PAINTING_ACHIEVEMENTS,
  AOS_READING_ACHIEVEMENTS,
  getConsecutiveMonthStreak, achievementFromId, localizeAchievement,
} from "../lib/achievements";
import { AOS_BOOKS } from "../data/aosBooks";
import { BOOKS } from "../data/books";

const C = {
  bg: "#0a0905", surface: "#111009", card: "#16140f", border: "#2a2518",
  gold: "#c9a84c", goldDim: "#7a6330", text: "#d4cbb8", muted: "#7a7060", dim: "#3a3428",
};
const PAINT_ACCENT = "#9a4adc";
const AOS_ACCENT   = "#C9A227";

const STATS_STYLES = `
  @keyframes statsGlowGold {
    0%,100% { box-shadow: 0 0 10px #c9a84c22, 0 2px 16px #c9a84c11; }
    50%      { box-shadow: 0 0 22px #c9a84c44, 0 4px 28px #c9a84c22; }
  }
  @keyframes statsGlowPaint {
    0%,100% { box-shadow: 0 0 10px #9a4adc22, 0 2px 16px #9a4adc11; }
    50%      { box-shadow: 0 0 22px #9a4adc44, 0 4px 28px #9a4adc22; }
  }
  @keyframes statsShimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes statsGlowAos {
    0%,100% { box-shadow: 0 0 10px #C9A22722, 0 2px 16px #C9A22711; }
    50%      { box-shadow: 0 0 22px #C9A22744, 0 4px 28px #C9A22722; }
  }
  .ach-unlocked-gold  { animation: statsGlowGold  3s ease-in-out infinite; }
  .ach-unlocked-paint { animation: statsGlowPaint 3s ease-in-out infinite; }
  .ach-unlocked-aos   { animation: statsGlowAos   3s ease-in-out infinite; }
`;

function StyleTag() {
  return <style>{STATS_STYLES}</style>;
}

function monthKey(iso) { return iso ? iso.slice(0, 7) : null; }

function parseStatuses(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
  return [raw];
}

function StatBox({ n, label, color, suffix }) {
  const isZero = n === 0 && suffix;
  return (
    <div style={{
      flex: "1 1 70px", background: C.card, border: `1px solid ${color}44`,
      borderRadius: 10, padding: "10px 8px", textAlign: "center",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2, lineHeight: 1 }}>
        {isZero
          ? <span style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color, opacity: 0.4 }}>—</span>
          : <>
              <span style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color }}>{n}</span>
              {suffix && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color, opacity: 0.8 }}>{suffix}</span>}
            </>
        }
      </div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 7, color: C.muted, letterSpacing: 2, marginTop: 4, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function AchCard({ a, unlocked, accent }) {
  const { t } = useLang();
  a = localizeAchievement(a, t);
  const glowClass = accent === C.gold ? "ach-unlocked-gold" : accent === AOS_ACCENT ? "ach-unlocked-aos" : "ach-unlocked-paint";
  if (unlocked) {
    return (
      <div
        className={glowClass}
        style={{
          background: `linear-gradient(160deg, ${accent}20 0%, ${C.card} 55%, ${accent}0d 100%)`,
          border: `1px solid ${accent}88`,
          borderRadius: 12,
          padding: "14px 10px 12px",
          display: "flex", flexDirection: "column", alignItems: "center",
          textAlign: "center", gap: 0, position: "relative", overflow: "hidden",
        }}
      >
        {/* top shimmer line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}cc, transparent)`,
          backgroundSize: "200% 100%",
          animation: "statsShimmer 3s linear infinite",
        }} />
        {/* icon */}
        <div style={{
          width: 46, height: 46, borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}30 0%, ${accent}0a 70%)`,
          border: `2px solid ${accent}77`,
          boxShadow: `0 0 14px ${accent}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, marginBottom: 8,
        }}>{a.icon}</div>
        {/* achieved badge */}
        <div style={{
          fontFamily: "'Cinzel',serif", fontSize: 6, letterSpacing: 3,
          color: accent, textTransform: "uppercase", marginBottom: 5,
          opacity: 0.9,
        }}>{t("stats.achieved")}</div>
        {/* label */}
        <div style={{
          fontFamily: "'Cinzel Decorative',serif", fontSize: 9,
          color: C.text, lineHeight: 1.3, marginBottom: 6,
          textShadow: `0 0 8px ${accent}44`,
        }}>{a.label}</div>
        {/* desc */}
        <div style={{
          fontSize: 9, color: C.muted, lineHeight: 1.5,
          fontStyle: "italic", letterSpacing: 0.3,
        }}>{a.desc}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}22`,
      borderRadius: 12, padding: "14px 10px 12px",
      display: "flex", flexDirection: "column", alignItems: "center",
      textAlign: "center", opacity: 0.32,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%", background: C.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, marginBottom: 8,
      }}>🔒</div>
      <div style={{
        fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted,
        lineHeight: 1.3,
      }}>{a.label}</div>
      <div style={{ fontSize: 9, color: C.dim, marginTop: 4, letterSpacing: 1 }}>???</div>
    </div>
  );
}

// Card for dynamic earned achievements (sagas, armies)
function DynCard({ id, accent }) {
  const { t } = useLang();
  const raw = achievementFromId(id);
  if (!raw) return null;
  const a = localizeAchievement(raw, t);
  const glowClass = accent === C.gold ? "ach-unlocked-gold" : accent === AOS_ACCENT ? "ach-unlocked-aos" : "ach-unlocked-paint";
  return (
    <div
      className={glowClass}
      style={{
        background: `linear-gradient(135deg, ${accent}20 0%, ${C.card} 60%)`,
        border: `1px solid ${accent}88`,
        borderRadius: 12, padding: "12px 14px",
        display: "flex", gap: 12, alignItems: "center",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${accent}cc, transparent)`,
        backgroundSize: "200% 100%",
        animation: "statsShimmer 3s linear infinite",
      }} />
      <div style={{
        width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
        background: `radial-gradient(circle, ${accent}30 0%, ${accent}0a 70%)`,
        border: `2px solid ${accent}77`,
        boxShadow: `0 0 12px ${accent}55`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
      }}>{a.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Cinzel',serif", fontSize: 6, letterSpacing: 3,
          color: accent, textTransform: "uppercase", marginBottom: 4, opacity: 0.9,
        }}>{t("stats.achieved")}</div>
        <div style={{
          fontFamily: "'Cinzel Decorative',serif", fontSize: 10,
          color: C.text, marginBottom: 4, lineHeight: 1.2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textShadow: `0 0 8px ${accent}44`,
        }}>{a.label}</div>
        <div style={{ fontSize: 9, color: C.muted, fontStyle: "italic", lineHeight: 1.4 }}>{a.desc}</div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 3, color: C.goldDim, textTransform: "uppercase", marginBottom: 10, marginTop: 20 }}>
      {children}
    </div>
  );
}

export default function StatsModal({ user, statuses = {}, aosStatuses = {}, unlockedIds = [], onClose, initialTab = "reading" }) {
  const { t, lang } = useLang();
  const monthLocale = lang === "it" ? "it-IT" : "en-US";
  const [tab, setTab] = useState(initialTab);
  const [minis, setMinis] = useState([]);
  const [loadingMinis, setLoadingMinis] = useState(false);

  useEffect(() => {
    if (!user?.id || tab !== "painting") return;
    setLoadingMinis(true);
    supabase.from("miniatures").select("id,faction,status,created_at").eq("user_id", user.id)
      .then(({ data }) => { if (data) setMinis(data); })
      .finally(() => setLoadingMinis(false));
  }, [user?.id, tab]);

  // ── Reading stats ──────────────────────────────────────────────────────────
  const allStatuses   = { ...statuses, ...aosStatuses };
  const readEntries   = Object.entries(allStatuses).filter(([, v]) => v?.status === 'read');
  const readIds       = new Set(readEntries.map(([k]) => String(k)));
  const readCount     = readEntries.length;
  const readingCount  = Object.values(allStatuses).filter(v => v?.status === 'reading').length;
  const nowMonth      = new Date().toISOString().slice(0, 7);
  const thisMonthRead = readEntries.filter(([, v]) => monthKey(v.completedAt) === nowMonth).length;
  const readStreak    = getConsecutiveMonthStreak(readEntries.map(([, v]) => v.completedAt).filter(Boolean));

  // ── AoS reading stats ──────────────────────────────────────────────────────
  const aosReadEntries   = Object.entries(aosStatuses).filter(([, v]) => v?.status === 'read');
  const aosReadCount     = aosReadEntries.length;
  const aosReadingCount  = Object.values(aosStatuses).filter(v => v?.status === 'reading').length;
  const aosThisMonthRead = aosReadEntries.filter(([, v]) => monthKey(v.completedAt) === nowMonth).length;
  const aosReadStreak    = getConsecutiveMonthStreak(aosReadEntries.map(([, v]) => v.completedAt).filter(Boolean));

  const completedAosSagas  = unlockedIds.filter(id => id.startsWith('aos_series:'));
  const staticAosUnlocked  = unlockedIds.filter(id => AOS_READING_ACHIEVEMENTS.some(a => a.id === id));

  // Dynamic reading achievements stored
  const completedSagas   = unlockedIds.filter(id => id.startsWith('series:'));
  const staticReadUnlocked = unlockedIds.filter(id => READING_ACHIEVEMENTS.some(a => a.id === id));

  // ── Painting stats ─────────────────────────────────────────────────────────
  const lsKey = user?.id ? `wh40k_painted_${user.id}` : null;
  let paintTS = {};
  try { if (lsKey) paintTS = JSON.parse(localStorage.getItem(lsKey) || '{}'); } catch {}

  const completedMinis  = minis
    .filter(m => parseStatuses(m.status).includes('completed'))
    .map(m => ({ id: m.id, faction: m.faction || "", completedAt: paintTS[m.id] || m.created_at }));

  const paintCount      = completedMinis.length;
  const thisMonthPaint  = completedMinis.filter(m => monthKey(m.completedAt) === nowMonth).length;
  const paintStreak     = getConsecutiveMonthStreak(completedMinis.map(m => m.completedAt).filter(Boolean));

  // Dynamic painting achievements stored — deduplicate: keep highest milestone per faction
  const armyIds = unlockedIds.filter(id => id.startsWith('army:'));
  const topArmyIds = (() => {
    const byFaction = {};
    armyIds.forEach(id => {
      const rest = id.slice('army:'.length);
      const sep  = rest.lastIndexOf(':');
      const faction = rest.slice(0, sep);
      const count   = parseInt(rest.slice(sep + 1), 10);
      if (!byFaction[faction] || count > byFaction[faction].count) {
        byFaction[faction] = { id, count };
      }
    });
    return Object.values(byFaction).map(v => v.id);
  })();
  const staticPaintUnlocked = unlockedIds.filter(id => PAINTING_ACHIEVEMENTS.some(a => a.id === id));

  const isUnlocked = id => unlockedIds.includes(id);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column" }}>
      <StyleTag />
      <div style={{ flex: 1, background: C.bg, display: "flex", flexDirection: "column", maxHeight: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          flexShrink: 0, padding: "16px 16px 12px",
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 4, color: C.goldDim, textTransform: "uppercase", marginBottom: 3 }}>{t("stats.headerKicker")}</div>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 20, color: C.text }}>{t("stats.headerTitle")}</div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 8,
            color: C.muted, padding: "6px 14px", fontFamily: "'Cinzel',serif", fontSize: 12, cursor: "pointer",
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ flexShrink: 0, display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          {[{id:"reading",label:t("stats.tabReading")},{id:"painting",label:t("stats.tabPainting")},{id:"aos",label:t("stats.tabAos")}].map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
              flex: 1, padding: "12px 4px", background: "transparent", border: "none",
              borderBottom: `2px solid ${tab === tb.id ? C.gold : "transparent"}`,
              color: tab === tb.id ? C.gold : C.muted,
              fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, cursor: "pointer",
            }}>{tb.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 80px", overscrollBehavior: "contain" }}>

          {tab === "reading" && <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              <StatBox n={readCount}      label={t("stats.statRead")}      color={C.gold}   />
              <StatBox n={readingCount}   label={t("stats.statReading")}   color="#4a8adc"  />
              <StatBox n={thisMonthRead}  label={t("stats.statThisMonth")} color="#4aaa6a"  />
              <StatBox n={readStreak} suffix={t("stats.streakSuffix")} label={t("stats.statStreak")} color={C.gold} />
            </div>

            {/* Monthly reading chart — last 6 months */}
            {(() => {
              const months = [];
              for (let i = 5; i >= 0; i--) {
                const d = new Date(); d.setMonth(d.getMonth() - i);
                const key = d.toISOString().slice(0, 7);
                const label = d.toLocaleDateString(monthLocale, { month: 'short' });
                const count = readEntries.filter(([, v]) => monthKey(v.completedAt) === key).length;
                months.push({ key, label, count });
              }
              const peak = Math.max(...months.map(x => x.count), 1);
              return (
                <div style={{ marginBottom: 4 }}>
                  <SectionLabel>{t("stats.monthlyReading")}</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 72, marginBottom: 8 }}>
                    {months.map(m => {
                      const barH = Math.max((m.count / peak) * 52, m.count > 0 ? 6 : 2);
                      const isCur = m.key === nowMonth;
                      return (
                        <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <div style={{ fontSize: 9, color: isCur ? C.gold : C.muted, fontFamily: "'Cinzel',serif" }}>{m.count > 0 ? m.count : ''}</div>
                          <div style={{ width: "100%", height: barH, background: isCur ? C.gold : `${C.gold}44`, borderRadius: "3px 3px 0 0", transition: "height 0.4s" }} />
                          <div style={{ fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{m.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Completed sagas — dynamic, always visible */}
            <SectionLabel>
              {t("stats.completedSagas").replace("{n}", completedSagas.length)}
            </SectionLabel>
            {completedSagas.length === 0 ? (
              <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 12 }}>
                {t("stats.completedSagasEmpty")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                {completedSagas.map(id => <DynCard key={id} id={id} accent={C.gold} />)}
              </div>
            )}

            {/* In-progress series */}
            {(() => {
              const seriesMap = {};
              BOOKS.forEach(b => {
                if (!seriesMap[b.series]) seriesMap[b.series] = { total: 0, read: 0 };
                seriesMap[b.series].total++;
                if (readIds.has(String(b.id))) seriesMap[b.series].read++;
              });
              const inProgress = Object.entries(seriesMap)
                .filter(([s, v]) => s !== 'Standalone' && s !== 'Codex' && v.total >= 2 && v.read > 0 && v.read < v.total)
                .sort(([, a], [, b]) => (b.read / b.total) - (a.read / a.total));
              if (!inProgress.length) return null;
              return (
                <>
                  <SectionLabel>{t("stats.inProgress").replace("{n}", inProgress.length)}</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                    {inProgress.map(([sName, v]) => {
                      const pct = v.read / v.total;
                      return (
                        <div key={sName} style={{
                          background: C.card, border: `1px solid ${C.border}`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.text }}>{sName}</div>
                            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim }}>{v.read}/{v.total}</div>
                          </div>
                          <div style={{ height: 3, background: C.dim, borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${pct * 100}%`, background: `linear-gradient(to right, ${C.gold}, ${C.gold}88)`, borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            <SectionLabel>
              {t("stats.achievementsUnlocked").replace("{n}", staticReadUnlocked.length).replace("{total}", READING_ACHIEVEMENTS.length)}
            </SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {READING_ACHIEVEMENTS.map(a => <AchCard key={a.id} a={a} unlocked={isUnlocked(a.id)} accent={C.gold} />)}
            </div>
          </>}

          {tab === "painting" && <>
            {loadingMinis ? (
              <div style={{ textAlign: "center", padding: 40, color: C.muted, fontStyle: "italic" }}>{t("stats.loading")}</div>
            ) : <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                <StatBox n={paintCount}     label={t("stats.statCompleted")} color={PAINT_ACCENT} />
                <StatBox n={thisMonthPaint} label={t("stats.statThisMonth")} color="#4aaa6a"      />
                <StatBox n={paintStreak} suffix={t("stats.streakSuffix")} label={t("stats.statStreak")} color={C.gold} />
              </div>

              {/* Armies built — dynamic, always visible */}
              <SectionLabel>
                {t(topArmyIds.length !== 1 ? "stats.armiesBuiltPlural" : "stats.armiesBuilt").replace("{n}", topArmyIds.length)}
              </SectionLabel>
              {topArmyIds.length === 0 ? (
                <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 12 }}>
                  {t("stats.armiesBuiltEmpty")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                  {topArmyIds.map(id => <DynCard key={id} id={id} accent={PAINT_ACCENT} />)}
                </div>
              )}

              <SectionLabel>
                Achievements — {staticPaintUnlocked.length}/{PAINTING_ACHIEVEMENTS.length} Unlocked
              </SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {PAINTING_ACHIEVEMENTS.map(a => <AchCard key={a.id} a={a} unlocked={isUnlocked(a.id)} accent={PAINT_ACCENT} />)}
              </div>
            </>}
          </>}

          {tab === "aos" && <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              <StatBox n={aosReadCount}      label="Read"        color={AOS_ACCENT}  />
              <StatBox n={aosReadingCount}   label="Reading"     color="#4a8adc"     />
              <StatBox n={aosThisMonthRead}  label="This Month"  color="#4aaa6a"     />
              <StatBox n={aosReadStreak} suffix="mo" label="Streak" color={AOS_ACCENT} />
            </div>

            {/* Monthly AoS reading chart */}
            {(() => {
              const months = [];
              for (let i = 5; i >= 0; i--) {
                const d = new Date(); d.setMonth(d.getMonth() - i);
                const key = d.toISOString().slice(0, 7);
                const label = d.toLocaleDateString(monthLocale, { month: 'short' });
                const count = aosReadEntries.filter(([, v]) => monthKey(v.completedAt) === key).length;
                months.push({ key, label, count });
              }
              const peak = Math.max(...months.map(x => x.count), 1);
              return (
                <div style={{ marginBottom: 4 }}>
                  <SectionLabel>{t("stats.monthlyReading")}</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 72, marginBottom: 8 }}>
                    {months.map(m => {
                      const barH = Math.max((m.count / peak) * 52, m.count > 0 ? 6 : 2);
                      const isCur = m.key === nowMonth;
                      return (
                        <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <div style={{ fontSize: 9, color: isCur ? AOS_ACCENT : C.muted, fontFamily: "'Cinzel',serif" }}>{m.count > 0 ? m.count : ''}</div>
                          <div style={{ width: "100%", height: barH, background: isCur ? AOS_ACCENT : `${AOS_ACCENT}44`, borderRadius: "3px 3px 0 0", transition: "height 0.4s" }} />
                          <div style={{ fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{m.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <SectionLabel>
              {t("stats.completedSagas").replace("{n}", completedAosSagas.length)}
            </SectionLabel>
            {completedAosSagas.length === 0 ? (
              <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 12 }}>
                {t("stats.completedSagasEmpty")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                {completedAosSagas.map(id => <DynCard key={id} id={id} accent={AOS_ACCENT} />)}
              </div>
            )}

            {/* In-progress AoS series */}
            {(() => {
              const aosReadIds = new Set(aosReadEntries.map(([k]) => String(k)));
              const seriesMap = {};
              AOS_BOOKS.forEach(b => {
                if (!seriesMap[b.series]) seriesMap[b.series] = { total: 0, read: 0 };
                seriesMap[b.series].total++;
                if (aosReadIds.has(String(b.id))) seriesMap[b.series].read++;
              });
              const inProgress = Object.entries(seriesMap)
                .filter(([, v]) => v.total >= 2 && v.read > 0 && v.read < v.total)
                .sort(([, a], [, b]) => (b.read / b.total) - (a.read / a.total));
              if (!inProgress.length) return null;
              return (
                <>
                  <SectionLabel>{t("stats.inProgress").replace("{n}", inProgress.length)}</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                    {inProgress.map(([sName, v]) => {
                      const pct = v.read / v.total;
                      return (
                        <div key={sName} style={{
                          background: C.card, border: `1px solid ${C.border}`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.text }}>{sName}</div>
                            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim }}>{v.read}/{v.total}</div>
                          </div>
                          <div style={{ height: 3, background: C.dim, borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${pct * 100}%`, background: `linear-gradient(to right, ${AOS_ACCENT}, ${AOS_ACCENT}88)`, borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            <SectionLabel>
              Achievements — {staticAosUnlocked.length}/{AOS_READING_ACHIEVEMENTS.length} Unlocked
            </SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {AOS_READING_ACHIEVEMENTS.map(a => <AchCard key={a.id} a={a} unlocked={isUnlocked(a.id)} accent={AOS_ACCENT} />)}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
