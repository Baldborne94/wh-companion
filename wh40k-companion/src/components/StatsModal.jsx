import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  READING_ACHIEVEMENTS, PAINTING_ACHIEVEMENTS,
  getConsecutiveMonthStreak, achievementFromId,
} from "../lib/achievements";

const C = {
  bg: "#0a0905", surface: "#111009", card: "#16140f", border: "#2a2518",
  gold: "#c9a84c", goldDim: "#7a6330", text: "#d4cbb8", muted: "#7a7060", dim: "#3a3428",
};
const PAINT_ACCENT = "#9a4adc";

function monthKey(iso) { return iso ? iso.slice(0, 7) : null; }

function parseStatuses(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
  return [raw];
}

function StatBox({ n, label, color }) {
  return (
    <div style={{
      flex: "1 1 70px", background: C.card, border: `1px solid ${color}44`,
      borderRadius: 10, padding: "10px 8px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color, lineHeight: 1 }}>{n}</div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 7, color: C.muted, letterSpacing: 2, marginTop: 4, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function AchCard({ a, unlocked, accent }) {
  return (
    <div style={{
      background: unlocked ? `linear-gradient(135deg, ${accent}18, ${C.card})` : C.surface,
      border: `1px solid ${unlocked ? accent + "66" : C.border + "44"}`,
      borderRadius: 10, padding: "10px 12px",
      display: "flex", gap: 10, alignItems: "center",
      opacity: unlocked ? 1 : 0.42,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        background: unlocked ? `${accent}22` : C.dim,
        border: `1px solid ${unlocked ? accent + "55" : "transparent"}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
      }}>
        {unlocked ? a.icon : "🔒"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Cinzel',serif", fontSize: 10,
          color: unlocked ? C.text : C.muted, marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{a.label}</div>
        <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.3 }}>{a.desc}</div>
      </div>
      {unlocked && <span style={{ color: accent, fontSize: 13, flexShrink: 0 }}>✓</span>}
    </div>
  );
}

// Compact card for dynamic earned achievements (sagas, armies)
function DynCard({ id, accent }) {
  const a = achievementFromId(id);
  if (!a) return null;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${accent}18, ${C.card})`,
      border: `2px solid ${accent}66`,
      borderRadius: 10, padding: "10px 12px",
      display: "flex", gap: 10, alignItems: "center",
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        background: `${accent}22`, border: `1px solid ${accent}55`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
      }}>{a.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Cinzel',serif", fontSize: 10, color: C.text, marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{a.label}</div>
        <div style={{ fontSize: 10, color: C.muted }}>{a.desc}</div>
      </div>
      <span style={{ color: accent, fontSize: 13, flexShrink: 0 }}>✓</span>
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
  const readCount     = readEntries.length;
  const readingCount  = Object.values(allStatuses).filter(v => v?.status === 'reading').length;
  const nowMonth      = new Date().toISOString().slice(0, 7);
  const thisMonthRead = readEntries.filter(([, v]) => monthKey(v.completedAt) === nowMonth).length;
  const readStreak    = getConsecutiveMonthStreak(readEntries.map(([, v]) => v.completedAt).filter(Boolean));

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
      <div style={{ flex: 1, background: C.bg, display: "flex", flexDirection: "column", maxHeight: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          flexShrink: 0, padding: "16px 16px 12px",
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 4, color: C.goldDim, textTransform: "uppercase", marginBottom: 3 }}>Imperial Record</div>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 20, color: C.text }}>Deeds &amp; Honour</div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${C.dim}`, borderRadius: 8,
            color: C.muted, padding: "6px 14px", fontFamily: "'Cinzel',serif", fontSize: 12, cursor: "pointer",
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ flexShrink: 0, display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          {[{id:"reading",label:"📖 Reading"},{id:"painting",label:"🎨 Painting"}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "12px 4px", background: "transparent", border: "none",
              borderBottom: `2px solid ${tab === t.id ? C.gold : "transparent"}`,
              color: tab === t.id ? C.gold : C.muted,
              fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 80px", overscrollBehavior: "contain" }}>

          {tab === "reading" && <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              <StatBox n={readCount}      label="Read"         color={C.gold}   />
              <StatBox n={readingCount}   label="Reading"      color="#4a8adc"  />
              <StatBox n={thisMonthRead}  label="This Month"   color="#4aaa6a"  />
              <StatBox n={`${readStreak}mo`} label="Streak"   color={C.gold}   />
            </div>

            {/* Completed sagas — dynamic, always visible */}
            <SectionLabel>
              Completed Sagas — {completedSagas.length}
            </SectionLabel>
            {completedSagas.length === 0 ? (
              <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 12 }}>
                Finish every book in a series to earn a saga completion.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                {completedSagas.map(id => <DynCard key={id} id={id} accent={C.gold} />)}
              </div>
            )}

            <SectionLabel>
              Achievements — {staticReadUnlocked.length}/{READING_ACHIEVEMENTS.length} Unlocked
            </SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {READING_ACHIEVEMENTS.map(a => <AchCard key={a.id} a={a} unlocked={isUnlocked(a.id)} accent={C.gold} />)}
            </div>
          </>}

          {tab === "painting" && <>
            {loadingMinis ? (
              <div style={{ textAlign: "center", padding: 40, color: C.muted, fontStyle: "italic" }}>Loading…</div>
            ) : <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                <StatBox n={paintCount}     label="Completed"   color={PAINT_ACCENT} />
                <StatBox n={thisMonthPaint} label="This Month"  color="#4aaa6a"      />
                <StatBox n={`${paintStreak}mo`} label="Streak"  color={C.gold}       />
              </div>

              {/* Armies built — dynamic, always visible */}
              <SectionLabel>
                Armies Built — {topArmyIds.length} faction{topArmyIds.length !== 1 ? 's' : ''}
              </SectionLabel>
              {topArmyIds.length === 0 ? (
                <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 12 }}>
                  Complete 5 minis of the same faction to unlock your first army achievement.
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
        </div>
      </div>
    </div>
  );
}
