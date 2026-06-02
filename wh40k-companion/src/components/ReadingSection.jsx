import { useState, useEffect, useMemo } from "react";
import { sb } from "../lib/sb";
import { C, FC, STATUS_CFG } from "../data/constants";
import { BOOKS } from "../data/books";
import { HH_FULL, HH_OPTIONAL, HH_MIN, findHHBook } from "../data/hhGuide";
import { CHALLENGES, TIER } from "../data/challenges";
import { getBookRating } from "../lib/bookStatus";
import CoverImage from "./CoverImage";
import { getNextSuggestion } from "../lib/readingHelpers";

function HHBookRow({ entry, statuses, isLast }) {
  const book = findHHBook(entry);
  const status = book ? statuses[book.id]?.status || 'none' : null;
  const stCfg = status && status !== 'none' ? STATUS_CFG[status] : null;
  const type = entry.type || 'novel';
  const isSecondary = type === 'short' || type === 'audio';
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: isLast ? "none" : `1px solid ${C.border}22`, opacity: isSecondary ? 0.72 : 1 }}>
      <span style={{ fontSize: 11, flexShrink: 0, width: 18, textAlign: "center" }}>
        {type === 'audio' ? '🎧' : type === 'short' ? '📄' : type === 'novella' ? '📑' : '📖'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: entry.opt ? C.muted : C.text, fontStyle: entry.opt ? 'italic' : 'normal', overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: type === 'novel' || type === 'novella' ? "'Cinzel',serif" : undefined }}>
          {entry.t}
          {entry.n > 0 && <span style={{ fontSize: 9, color: C.goldDim, marginLeft: 4 }}>#{entry.n}</span>}
          {entry.opt && <span style={{ fontSize: 9, color: C.muted, marginLeft: 4 }}>(optional)</span>}
        </div>
        <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.a}{entry.src && <span style={{ color: C.dim }}> · {entry.src}</span>}
        </div>
      </div>
      {stCfg && <span style={{ fontSize: 13, flexShrink: 0 }}>{stCfg.icon}</span>}
    </div>
  );
}

function HHGuideSection({ statuses }) {
  const [mode, setMode] = useState('minimalist');
  const [open, setOpen] = useState(new Set(['m1']));
  const toggle = id => setOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const parts = mode === 'minimalist' ? HH_MIN : HH_FULL;

  const PartCard = ({ part, dimmed }) => {
    const isOpen = open.has(part.id);
    const mainBooks = (part.books || []).filter(b => !b.b40k);
    const novelCount = mainBooks.filter(b => !b.type || b.type === 'novel' || b.type === 'novella').length;
    const extraCount = mainBooks.length - novelCount;
    const novelEntries = mainBooks.filter(b => !b.type || b.type === 'novel' || b.type === 'novella');
    const novelMatched = novelEntries.map(e => findHHBook(e)).filter(Boolean);
    const readCount = novelMatched.filter(b => statuses[b.id]?.status === 'read').length;
    const allRead = novelMatched.length > 0 && readCount === novelMatched.length;
    const accentColor = dimmed ? C.dim : allRead ? C.green : C.dim;
    return (
      <div style={{ background: C.card, border: `1px solid ${dimmed ? C.dim + "33" : C.border}`, borderLeft: `3px solid ${accentColor}`, borderRadius: 10, overflow: "hidden", opacity: dimmed ? 0.85 : 1 }}>
        <div onClick={() => toggle(part.id)} style={{ padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: dimmed ? C.muted : C.goldDim, letterSpacing: 2, flexShrink: 0 }}>{part.label}</span>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: dimmed ? C.muted : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{part.title}</span>
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>
              {part.pickOne ? <span>Pick one path · 4 options</span> : <>
                {novelCount > 0 && `${novelCount} novel${novelCount !== 1 ? 's' : ''}`}
                {extraCount > 0 && ` + ${extraCount} shorts/audio`}
                {novelMatched.length > 0 && readCount > 0 && <span style={{ color: allRead ? C.green : C.blue, marginLeft: 6 }}>{allRead ? '✅' : ''}{readCount}/{novelMatched.length} read</span>}
              </>}
            </div>
          </div>
          <span style={{ color: C.goldDim, fontSize: 16, flexShrink: 0, transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "none" }}>›</span>
        </div>
        {isOpen && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px 12px" }}>
            {part.note && <div style={{ fontSize: 11, color: C.gold, fontStyle: "italic", marginBottom: 10, padding: "6px 10px", background: `${C.gold}0a`, borderRadius: 6, borderLeft: `2px solid ${C.gold}44` }}>{part.note}</div>}
            {part.pickOne ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {part.options.map((opt, oi) => (
                  <div key={oi} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${opt.color || C.gold}`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: opt.color || C.gold, letterSpacing: 2, marginBottom: opt.note ? 4 : 6 }}>{opt.label.toUpperCase()}</div>
                    {opt.note && <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", marginBottom: 6 }}>💡 {opt.note}</div>}
                    {opt.books.map((e, i) => <HHBookRow key={i} entry={e} statuses={statuses} isLast={i === opt.books.length - 1} />)}
                  </div>
                ))}
              </div>
            ) : (
              <>
                {mainBooks.map((entry, i) => <HHBookRow key={i} entry={entry} statuses={statuses} isLast={i === mainBooks.length - 1} />)}
                {(() => {
                  const b40k = (part.books || []).filter(b => b.b40k);
                  if (!b40k.length) return null;
                  return (
                    <div style={{ marginTop: 10, background: `${C.gold}08`, border: `1px solid ${C.gold}22`, borderRadius: 6, padding: "6px 10px" }}>
                      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.goldDim, letterSpacing: 2, marginBottom: 6 }}>🌌 BONUS 40K READS</div>
                      {b40k.map((e, i) => <HHBookRow key={i} entry={e} statuses={statuses} isLast={i === b40k.length - 1} />)}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(180deg,${C.surface},${C.bg})` }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 18, color: C.text, marginBottom: 4 }}>Heresy Reading Guide</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Curated by Reddit user <span style={{ color: C.gold }}>cd8d</span> — organises 60+ books into readable story arcs</div>
        <div style={{ display: "flex", gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2, alignSelf: "flex-start", width: "fit-content" }}>
          {[{ id: 'minimalist', label: '⚡ Essential (~25 books)' }, { id: 'full', label: '📚 Full Guide' }].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setOpen(new Set([m.id === 'minimalist' ? 'm1' : 'p0'])); }}
              style={{ background: mode === m.id ? `${C.gold}33` : "transparent", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", color: mode === m.id ? C.gold : C.muted, fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, whiteSpace: "nowrap" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {parts.map(part => <PartCard key={part.id} part={part} />)}
        {mode === 'full' && (
          <>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.muted, letterSpacing: 3, textTransform: "uppercase", marginTop: 10, marginBottom: 4, padding: "0 2px" }}>Optional Arcs</div>
            {HH_OPTIONAL.map(part => <PartCard key={part.id} part={part} dimmed />)}
          </>
        )}
        <div style={{ marginTop: 8, padding: "10px 12px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 10, color: C.muted, lineHeight: 1.6, textAlign: "center" }}>
          Guide by <span style={{ color: C.gold }}>u/cd8d</span> · Full article on{' '}
          <a href="https://www.polygon.com/warhammer-40k/522708/warhammer-40k-horus-heresy-reading-guide-cd8d-redditor/" target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "underline", textDecorationColor: `${C.blue}66` }}>Polygon (Feb 2025)</a>
        </div>
      </div>
    </div>
  );
}

function ChallengesTab({ statuses, userId }) {
  const challenges = useMemo(() => CHALLENGES.map(c => {
    const { current, target } = c.compute(statuses);
    const done = current >= target;
    return { ...c, current, target, done, pct: Math.min(100, Math.round((current / target) * 100)) };
  }), [statuses]);

  const completed = challenges.filter(c => c.done).length;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 18, color: C.text, marginBottom: 4 }}>Sfide di Lettura</div>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.muted, letterSpacing: 1 }}>{completed} / {challenges.length} completate</div>
        <div style={{ height: 4, background: C.dim, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round((completed / challenges.length) * 100)}%`, background: `linear-gradient(to right,${C.gold},${C.green})`, borderRadius: 2 }} />
        </div>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {challenges.map(c => {
          const tc = TIER[c.tier];
          return (
            <div key={c.id} style={{ background: c.done ? `${tc.color}12` : C.card, border: `1px solid ${c.done ? tc.color + "66" : C.border}`, borderLeft: `3px solid ${c.done ? tc.color : C.dim}`, borderRadius: 10, padding: "12px 14px", opacity: c.done ? 1 : 0.9 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{c.done ? "✅" : c.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: c.done ? tc.color : C.text, fontWeight: 700 }}>{c.title}</div>
                    <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: tc.color, letterSpacing: 1, background: `${tc.color}22`, border: `1px solid ${tc.color}44`, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tc.label.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{c.desc}</div>
                  <div style={{ height: 4, background: C.dim, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${c.pct}%`, background: c.done ? tc.color : `linear-gradient(to right,${tc.color}88,${tc.color})`, borderRadius: 2, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: c.done ? tc.color : C.muted, marginTop: 4, letterSpacing: 1 }}>
                    {c.done ? "COMPLETED" : `${c.current} / ${c.target}`}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatsTab({ statuses, userId }) {
  const readBooks = useMemo(() => BOOKS.filter(b => statuses[b.id]?.status === 'read'), [statuses]);

  const monthlyData = useMemo(() => {
    const map = {};
    Object.values(statuses).forEach(s => {
      if (s.status === 'read' && s.completedAt) {
        const key = s.completedAt.slice(0, 7);
        map[key] = (map[key] || 0) + 1;
      }
    });
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ label: d.toLocaleDateString('it-IT', { month: 'short' }), count: map[key] || 0 });
    }
    return months;
  }, [statuses]);

  const maxMonthly = Math.max(...monthlyData.map(m => m.count), 1);

  const streak = useMemo(() => {
    const days = [...new Set(
      Object.values(statuses)
        .filter(s => s.status === 'read' && s.completedAt)
        .map(s => s.completedAt.slice(0, 10))
    )].sort();
    if (!days.length) return { current: 0, best: 0 };
    let best = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
      run = diff === 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    const last = new Date(days[days.length - 1]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffLast = (today - last) / 86400000;
    return { current: diffLast <= 1 ? run : 0, best };
  }, [statuses]);

  const thisYear = useMemo(() => {
    const y = new Date().getFullYear();
    return Object.values(statuses).filter(s => s.status === 'read' && s.completedAt?.startsWith(String(y))).length;
  }, [statuses]);

  const avgRating = useMemo(() => {
    const rated = readBooks.map(b => getBookRating(userId, b.id)).filter(r => r > 0);
    if (!rated.length) return 0;
    return (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1);
  }, [readBooks, userId]);

  const recentlyRead = useMemo(() =>
    [...readBooks]
      .filter(b => statuses[b.id]?.completedAt)
      .sort((a, b) => new Date(statuses[b.id].completedAt) - new Date(statuses[a.id].completedAt))
      .slice(0, 5),
    [readBooks, statuses]
  );

  const topSeries = useMemo(() => {
    const map = {};
    readBooks.forEach(b => { map[b.series] = (map[b.series] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [readBooks]);

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 18, color: C.text }}>Statistiche</div>
      </div>

      <div style={{ padding: "12px 16px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Totale", value: readBooks.length, color: C.green },
          { label: `Nel ${new Date().getFullYear()}`, value: thisYear, color: C.blue },
          { label: "Streak", value: streak.current > 0 ? `${streak.current}d` : "—", color: "#ff9944" },
          { label: "Voto medio", value: avgRating > 0 ? `${avgRating}★` : "—", color: C.gold },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 18, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 7, color: C.muted, letterSpacing: 1, marginTop: 4, textTransform: "uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {streak.best > 0 && (
        <div style={{ margin: "10px 16px 0", padding: "8px 12px", background: `${"#ff9944"}12`, border: `1px solid ${"#ff9944"}44`, borderRadius: 8, fontFamily: "'Cinzel',serif", fontSize: 10, color: "#ff9944", letterSpacing: 1 }}>
          🔥 Miglior streak: {streak.best} giorn{streak.best === 1 ? "o" : "i"} consecutivi
        </div>
      )}

      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>Libri letti per mese (ultimi 12 mesi)</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
          {monthlyData.map((m, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ fontSize: 8, color: m.count > 0 ? C.gold : "transparent", fontFamily: "'Cinzel',serif" }}>{m.count || ""}</div>
              <div style={{ width: "100%", height: `${Math.max(4, (m.count / maxMonthly) * 56)}px`, background: m.count > 0 ? `linear-gradient(to top,${C.gold},${C.gold}88)` : C.dim, borderRadius: "2px 2px 0 0", minHeight: 4 }} />
              <div style={{ fontSize: 7, color: C.muted, fontFamily: "'Cinzel',serif", letterSpacing: 0 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {recentlyRead.length > 0 && (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>Ultimi letti</div>
          {recentlyRead.map(b => {
            const rating = getBookRating(userId, b.id);
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}44` }}>
                <CoverImage book={b} width={28} height={42} radius={2} accentColor={FC[b.faction] || C.dim} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{statuses[b.id]?.completedAt ? new Date(statuses[b.id].completedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : ""}</div>
                </div>
                {rating > 0 && <div style={{ fontSize: 11, color: C.gold, flexShrink: 0 }}>{"★".repeat(rating)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {topSeries.length > 0 && (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>Serie più lette</div>
          {topSeries.map(([name, count]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}44` }}>
              <div style={{ flex: 1, fontFamily: "'Cinzel',serif", fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 14, color: C.gold, flexShrink: 0 }}>{count}</div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.muted, letterSpacing: 1, flexShrink: 0 }}>libri</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReadingSection({ user, statuses = {}, onOpenBook, setSection }) {
  const [crusadeTab, setCrusadeTab] = useState('overview');
  const [expanded, setExpanded] = useState(null);

  const readCount   = useMemo(() => Object.values(statuses).filter(s => s.status === 'read').length,    [statuses]);
  const readingCount= useMemo(() => Object.values(statuses).filter(s => s.status === 'reading').length, [statuses]);
  const wantCount   = useMemo(() => Object.values(statuses).filter(s => s.status === 'want').length,    [statuses]);

  const seriesList = useMemo(() => {
    const map = {};
    BOOKS.forEach(b => { if (!map[b.series]) map[b.series] = []; map[b.series].push(b); });
    return Object.entries(map).map(([name, books]) => {
      const sorted = [...books].sort((a, b) => a.num - b.num);
      const rc = sorted.filter(b => statuses[b.id]?.status === 'read').length;
      const nc = sorted.filter(b => statuses[b.id]?.status === 'reading').length;
      const next = sorted.find(b => { const s = statuses[b.id]?.status; return !s || s === 'none' || s === 'want'; });
      return { name, books: sorted, total: sorted.length, readCount: rc, readingCount: nc, nextBook: next };
    }).sort((a, b) => {
      if (a.readingCount > 0 && !b.readingCount) return -1;
      if (b.readingCount > 0 && !a.readingCount) return 1;
      if (b.readCount !== a.readCount) return b.readCount - a.readCount;
      return b.total - a.total;
    });
  }, [statuses]);

  const [hhMode, setHhMode] = useState(() => localStorage.getItem('wh40k_hh_mode') || 'full');

  useEffect(() => {
    if (!user?.id) return;
    sb.get("user_settings", `user_id=eq.${user.id}&select=hh_mode`).then(rows => {
      if (!rows?.length || rows._error) return;
      const m = rows[0]?.hh_mode;
      if (m && m !== hhMode) { localStorage.setItem('wh40k_hh_mode', m); setHhMode(m); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setHhModeSync = (m) => {
    localStorage.setItem('wh40k_hh_mode', m);
    setHhMode(m);
    if (user?.id) sb.upsert("user_settings", { user_id: user.id, hh_mode: m, updated_at: new Date().toISOString() }, "user_id");
  };

  const suggestion = useMemo(() => getNextSuggestion(statuses, hhMode), [statuses, hhMode]);
  const [opening, setOpening] = useState(false);

  const handleReadNext = async (book) => {
    if (!onOpenBook || !setSection) return setSection?.('library');
    setOpening(true);
    const ok = await onOpenBook(book);
    setOpening(false);
    if (!ok) setSection('library');
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface, position: "sticky", top: 0, zIndex: 5 }}>
        {[{ id: "overview", label: "Overview" }, { id: "guide", label: "⚔ Heresy" }, { id: "challenges", label: "🏅 Sfide" }, { id: "stats", label: "📊 Stats" }].map(t => (
          <button key={t.id} onClick={() => setCrusadeTab(t.id)} style={{ flex: 1, padding: "12px 2px", background: "transparent", border: "none", borderBottom: `2px solid ${crusadeTab === t.id ? C.gold : "transparent"}`, color: crusadeTab === t.id ? C.gold : C.muted, fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase", transition: "color 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>
      {crusadeTab === "guide" && <HHGuideSection statuses={statuses} />}
      {crusadeTab === "challenges" && <ChallengesTab statuses={statuses} userId={user?.id} />}
      {crusadeTab === "stats" && <StatsTab statuses={statuses} userId={user?.id} />}
      {crusadeTab === "overview" && <>
        <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 5, color: C.goldDim, textTransform: "uppercase", marginBottom: 6 }}>Black Library</div>
          <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 24, color: C.text, marginBottom: 14 }}>Your Crusade</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {[{ label: "Read", count: readCount, color: C.green }, { label: "Reading", count: readingCount, color: C.blue }, { label: "To Read", count: wantCount, color: C.gold }, { label: "Total", count: BOOKS.length, color: C.muted }].map(s => (
              <div key={s.label} style={{ flex: "1 1 60px", background: C.card, border: `1px solid ${s.color}44`, borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 20, color: s.color, lineHeight: 1 }}>{s.count}</div>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.muted, letterSpacing: 2, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 6, background: C.dim, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${BOOKS.length > 0 ? (readCount / BOOKS.length) * 100 : 0}%`, background: `linear-gradient(to right,${C.green},${C.gold})`, borderRadius: 3, transition: "width 0.5s ease" }} />
          </div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.muted, letterSpacing: 2, marginTop: 6, textAlign: "right" }}>{BOOKS.length > 0 ? Math.round((readCount / BOOKS.length) * 100) : 0}% COMPLETE</div>
        </div>

        {suggestion && (
          <div style={{ margin: "14px 16px 0", background: `linear-gradient(135deg,${C.gold}12,${C.card})`, border: `1px solid ${C.gold}44`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.gold, letterSpacing: 3, textTransform: "uppercase" }}>⚔ Next Up</span>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.goldDim, letterSpacing: 1 }}>· {suggestion.reason}</span>
              {suggestion.seriesProgress && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.muted, marginLeft: "auto" }}>{suggestion.seriesProgress}</span>}
            </div>
            <div style={{ padding: "10px 14px 14px", display: "flex", gap: 14, alignItems: "center" }}>
              <CoverImage book={suggestion.book} width={64} height={96} radius={4} accentColor={FC[suggestion.book.faction] || C.dim} style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.5)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.goldDim, letterSpacing: 1, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suggestion.book.series}{suggestion.book.num > 0 ? ` #${suggestion.book.num}` : ""}</div>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 15, color: C.text, lineHeight: 1.3, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suggestion.book.title}</div>
                <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 10 }}>{suggestion.book.author}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleReadNext(suggestion.book)} disabled={opening}
                    style={{ flex: 1, padding: "9px 10px", borderRadius: 8, background: `linear-gradient(135deg,${C.gold},#8a6f28)`, border: "none", color: C.bg, fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 2, cursor: "pointer", fontWeight: 700 }}>
                    {opening ? "Opening…" : "📖 Read Next"}
                  </button>
                  <button onClick={() => setSection?.('library')}
                    style={{ padding: "9px 12px", borderRadius: 8, background: "transparent", border: `1px solid ${C.dim}`, color: C.muted, fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, cursor: "pointer" }}>
                    Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {seriesList.map(serie => {
            const pct = serie.total > 0 ? (serie.readCount / serie.total) * 100 : 0;
            const isExp = expanded === serie.name;
            return (
              <div key={serie.name} style={{ background: C.card, border: `1px solid ${serie.readingCount > 0 ? C.blue : C.border}`, borderLeft: `3px solid ${serie.readingCount > 0 ? C.blue : serie.readCount === serie.total && serie.total > 0 ? C.green : C.dim}`, borderRadius: 10, overflow: "hidden" }}>
                <div onClick={() => setExpanded(isExp ? null : serie.name)} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{serie.name}</div>
                    <div style={{ height: 4, background: C.dim, borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? C.green : C.gold, borderRadius: 2 }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
                      {serie.readCount > 0 && <span style={{ fontSize: 10, color: C.green }}>✅ {serie.readCount}</span>}
                      {serie.readingCount > 0 && <span style={{ fontSize: 10, color: C.blue }}>📖 {serie.readingCount}</span>}
                      <span style={{ fontSize: 10, color: C.muted }}>{serie.total} books</span>
                    </div>
                  </div>
                  <span style={{ color: C.goldDim, fontSize: 16, flexShrink: 0, transition: "transform 0.2s", transform: isExp ? "rotate(90deg)" : "none" }}>›</span>
                </div>
                {isExp && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {serie.books.map(b => {
                      const bs = statuses[b.id]?.status || 'none';
                      const cfg = STATUS_CFG[bs];
                      const isNext = serie.nextBook?.id === b.id;
                      return (
                        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", background: isNext ? `${C.gold}0a` : "transparent", borderRadius: 6, paddingLeft: isNext ? 6 : 0 }}>
                          <span style={{ fontSize: 13, flexShrink: 0 }}>{cfg.icon}</span>
                          <span style={{ fontSize: 12, color: bs === 'none' ? C.muted : C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                          {isNext && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 7, color: C.gold, background: `${C.gold}22`, border: `1px solid ${C.gold}44`, borderRadius: 4, padding: "1px 5px", letterSpacing: 1, flexShrink: 0 }}>NEXT</span>}
                          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: cfg.color, letterSpacing: 1, flexShrink: 0 }}>{b.num > 0 ? `#${b.num}` : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}
