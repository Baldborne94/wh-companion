import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { sb } from "../lib/sb";
import { C, FC } from "../data/constants";
import { BOOKS } from "../data/books";
import CoverImage from "./CoverImage";
import { getAllNextSuggestions } from "../lib/readingHelpers";

function NextUpCard({ statuses, activeBooks, onOpenBook, setSection, userId }) {
  const [hhMode, setHhMode] = useState(() => localStorage.getItem('wh40k_hh_mode') || 'full');

  useEffect(() => {
    if (!userId) return;
    sb.get("user_settings", `user_id=eq.${userId}&select=hh_mode`).then(rows => {
      if (!rows?.length || rows._error) return;
      const m = rows[0]?.hh_mode;
      if (m && m !== hhMode) { localStorage.setItem('wh40k_hh_mode', m); setHhMode(m); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggleHhMode = () => {
    const next = hhMode === 'full' ? 'essential' : 'full';
    setHhMode(next);
    localStorage.setItem('wh40k_hh_mode', next);
    if (userId) sb.upsert("user_settings", { user_id: userId, hh_mode: next, updated_at: new Date().toISOString() }, "user_id");
  };

  const lsKey = `wh40k_hh_shorts_${userId || 'guest'}`;
  const [readShorts, setReadShorts] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(lsKey) || '[]')); } catch { return new Set(); }
  });

  useEffect(() => {
    if (!userId) return;
    supabase.from('hh_shorts').select('short_id').eq('user_id', userId).then(({ data }) => {
      if (!data?.length) return;
      setReadShorts(prev => {
        const merged = new Set([...prev, ...data.map(r => r.short_id)]);
        localStorage.setItem(lsKey, JSON.stringify([...merged]));
        return merged;
      });
    });
  }, [userId, lsKey]);

  const toggleShort = (id) => setReadShorts(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
      if (userId) supabase.from('hh_shorts').delete().eq('user_id', userId).eq('short_id', id).then(() => {});
    } else {
      next.add(id);
      if (userId) supabase.from('hh_shorts').upsert({ user_id: userId, short_id: id }).then(() => {});
    }
    localStorage.setItem(lsKey, JSON.stringify([...next]));
    return next;
  });

  const allSuggestions = useMemo(() => getAllNextSuggestions(statuses, hhMode, readShorts), [statuses, hhMode, readShorts]);
  const suggestions = allSuggestions.filter(s => s.isShort || !activeBooks.some(b => b.id === s.book?.id));
  const [openingId, setOpeningId] = useState(null);

  if (!suggestions.length) return null;
  const hasHH = suggestions.some(s => s.reason === 'Next in Horus Heresy');

  const openBook = async (book) => {
    if (!onOpenBook) return setSection('library');
    setOpeningId(book.id);
    const ok = await onOpenBook(book);
    setOpeningId(null);
    if (!ok) setSection('library');
  };

  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.gold, letterSpacing: 3, textTransform: "uppercase" }}>⚔ Next Up</div>
        {hasHH && (
          <button onClick={toggleHhMode} style={{ background: "transparent", border: `1px solid ${C.gold}55`, borderRadius: 20, padding: "3px 10px", cursor: "pointer", display: "flex", gap: 0, overflow: "hidden", flexShrink: 0 }}>
            {['full', 'essential'].map(m => (
              <span key={m} style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 1, color: hhMode === m ? C.bg : C.muted, background: hhMode === m ? C.gold : "transparent", padding: "2px 8px", borderRadius: 12, transition: "all 0.15s" }}>{m === 'full' ? 'Full' : 'Essential'}</span>
            ))}
          </button>
        )}
      </div>

      {suggestions.map((s, idx) => {
        if (s.isShort) {
          return (
            <div key={`short-${idx}`} style={{ background: `linear-gradient(135deg,${C.gold}12,${C.card})`, border: `1px solid ${C.gold}44`, borderLeft: `3px solid ${C.gold}`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 36, height: 54, flexShrink: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                {s.entry.type === 'audio' ? '🎧' : '📄'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.goldDim, letterSpacing: 1, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.reason.toUpperCase()}{s.seriesProgress ? ` · ${s.seriesProgress}` : ""}</div>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.text, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.entry.t}</div>
                <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: s.entry.src ? 2 : 0 }}>{s.entry.a}</div>
                {s.entry.src && <div style={{ fontSize: 10, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.entry.src}</div>}
              </div>
              <button onClick={() => toggleShort(s.shortId)} style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}55`, borderRadius: 6, color: C.gold, padding: "6px 10px", cursor: "pointer", fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 1, flexShrink: 0 }}>✓</button>
            </div>
          );
        }
        return (
          <div key={s.book.id} style={{ background: `linear-gradient(135deg,${C.gold}12,${C.card})`, border: `1px solid ${C.gold}44`, borderLeft: `3px solid ${C.gold}`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <CoverImage book={s.book} width={36} height={54} radius={3} accentColor={FC[s.book.faction] || C.dim} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.goldDim, letterSpacing: 1, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.reason.toUpperCase()}{s.seriesProgress ? ` · ${s.seriesProgress}` : ""}</div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.text, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.book.title}</div>
              <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>{s.book.author}</div>
            </div>
            <button onClick={() => openBook(s.book)} disabled={openingId === s.book.id}
              style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 6, background: `${C.gold}22`, border: `1px solid ${C.gold}55`, color: C.gold, fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 1, cursor: "pointer" }}>
              {openingId === s.book.id ? "…" : "›"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function HomePage({ user, setSection, statuses = {}, onOpenBook, onShowHelp }) {
  const uid = user?.id || 'anon';

  const [uploadedIds, setUploadedIds] = useState(() => {
    const ids = new Set();
    const prefix = `wh40k_ebook_${uid}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) { const id = parseInt(k.slice(prefix.length)); if (!isNaN(id)) ids.add(id); }
    }
    return ids;
  });

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("ebook_files").select("book_id").eq("user_id", user.id).then(({ data: files }) => {
      if (files?.length) {
        setUploadedIds(new Set(files.map(f => { const n = parseInt(f.book_id, 10); return isNaN(n) ? f.book_id : n; })));
      }
    });
  }, [user?.id]);

  const readCount    = Object.values(statuses).filter(s => s.status === 'read').length;
  const readingCount = Object.values(statuses).filter(s => s.status === 'reading').length;

  const shelfBooks = useMemo(() => {
    return BOOKS.filter(b => uploadedIds.has(b.id) || statuses[b.id]?.status === 'read')
      .sort((a, b) => a.series.localeCompare(b.series) || (a.num - b.num));
  }, [uploadedIds, statuses]);

  const shelfBySeries = useMemo(() => {
    const groups = [];
    const seen = {};
    shelfBooks.forEach(b => {
      if (!seen[b.series]) { seen[b.series] = []; groups.push({ series: b.series, books: seen[b.series] }); }
      seen[b.series].push(b);
    });
    return groups;
  }, [shelfBooks]);

  const activeBooks = BOOKS.filter(b => statuses[b.id]?.status === 'reading');
  const spineColor  = b => FC[b.faction] || C.dim;

  const ShelfRow = ({ books, label }) => {
    if (!books.length) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        {label && <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", padding: "0 16px", marginBottom: 4 }}>{label}</div>}
        <div style={{ position: "relative", overflowX: "auto", overflowY: "visible", paddingBottom: 10 }}>
          <div style={{ display: "flex", gap: 3, padding: "0 16px 0 16px", minWidth: "max-content", alignItems: "flex-end" }}>
            {books.map(b => {
              const sc = spineColor(b);
              const isUploaded = uploadedIds.has(b.id);
              const bst = statuses[b.id]?.status || 'none';
              const isReading = bst === 'reading';
              const isRead    = bst === 'read';
              return (
                <div key={b.id} onClick={() => onOpenBook ? onOpenBook(b) : setSection('library')} title={`${b.title} — ${b.author}`}
                  style={{ flexShrink: 0, width: isUploaded ? 32 : 22, height: isUploaded ? 130 : 120, background: `linear-gradient(to right,${sc}dd,${sc}99,${sc}cc)`, borderRadius: "2px 2px 0 0", cursor: "pointer", position: "relative", boxShadow: `inset -2px 0 4px rgba(0,0,0,0.4), 2px 0 3px rgba(0,0,0,0.3)`, border: `1px solid ${sc}`, borderBottom: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transition: "transform 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `inset -2px 0 4px rgba(0,0,0,0.4), 4px 4px 8px rgba(0,0,0,0.5)`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `inset -2px 0 4px rgba(0,0,0,0.4), 2px 0 3px rgba(0,0,0,0.3)`; }}
                >
                  <div style={{ writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)", fontFamily: "'Cinzel',serif", fontSize: isUploaded ? 7 : 6, color: "rgba(255,255,255,0.85)", letterSpacing: 1, overflow: "hidden", maxHeight: "90%", padding: "4px 2px", textShadow: "0 1px 2px rgba(0,0,0,0.8)", lineHeight: 1.1 }}>{b.title}</div>
                  {isReading && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: C.blue }} />}
                  {isRead    && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: C.green }} />}
                  {isUploaded && <div style={{ position: "absolute", inset: 0, border: `1px solid ${C.gold}88`, borderRadius: "2px 2px 0 0", pointerEvents: "none" }} />}
                </div>
              );
            })}
          </div>
          <div style={{ height: 10, background: `linear-gradient(to bottom,#5a3a1a,#3a2010)`, marginLeft: 16, marginRight: 16, borderRadius: "0 0 4px 4px", boxShadow: "0 3px 6px rgba(0,0,0,0.5)" }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: "24px 16px 20px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(180deg,${C.surface},${C.bg})`, position: "relative" }}>
        {onShowHelp && (
          <button onClick={onShowHelp} style={{ position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: "50%", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontSize: 13, fontFamily: "'Cinzel',serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>?</button>
        )}
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 5, color: C.goldDim, textTransform: "uppercase", marginBottom: 4 }}>Welcome to the</div>
        <h1 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 26, color: C.text, lineHeight: 1.1, marginBottom: 4 }}>Scriptorium</h1>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: C.goldDim, letterSpacing: 3 }}>YOUR IMPERIAL LIBRARY</div>
      </div>

      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
        {[{ n: readingCount, l: "Reading", c: C.blue }, { n: readCount, l: "Read", c: C.green }, { n: BOOKS.length, l: "Total", c: C.muted }].map(s => (
          <div key={s.l} style={{ flex: 1, padding: "12px 4px", textAlign: "center", borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color: s.c, lineHeight: 1 }}>{s.n}</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 7, color: C.muted, letterSpacing: 2, marginTop: 3, textTransform: "uppercase" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {activeBooks.length > 0 && (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.blue, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>📖 Reading</div>
          {activeBooks.map(b => {
            const hasEbook = uploadedIds.has(b.id);
            return (
              <div key={b.id} onClick={() => hasEbook && onOpenBook ? onOpenBook(b) : setSection('library')}
                style={{ background: `linear-gradient(135deg,${C.blue}18,${C.card})`, border: `1px solid ${C.blue}44`, borderLeft: `3px solid ${C.blue}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, touchAction: "manipulation", userSelect: "none" }}>
                <CoverImage book={b} width={36} height={50} radius={3} accentColor={FC[b.faction] || C.dim} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{b.series}{b.num > 0 ? ` #${b.num}` : ""} · {b.author}</div>
                </div>
                {hasEbook
                  ? <span style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}55`, borderRadius: 6, padding: "4px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: C.gold, letterSpacing: 1, flexShrink: 0 }}>READ ›</span>
                  : <span style={{ color: C.blue, fontSize: 16, flexShrink: 0 }}>›</span>
                }
              </div>
            );
          })}
        </div>
      )}

      <NextUpCard statuses={statuses} activeBooks={activeBooks} onOpenBook={onOpenBook} setSection={setSection} userId={user?.id} />

      <div style={{ padding: "16px 0 0" }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", padding: "0 16px", marginBottom: 10 }}>Your Shelf</div>
        {shelfBooks.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <div style={{ color: C.muted, fontSize: 13, fontStyle: "italic", marginBottom: 12 }}>No ebooks uploaded yet.</div>
            <button onClick={() => setSection('library')} style={{ background: "transparent", border: `1px solid ${C.gold}`, borderRadius: 8, color: C.gold, padding: "8px 20px", fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 2, cursor: "pointer" }}>Go to Library →</button>
          </div>
        ) : (
          shelfBySeries.map(({ series, books }) => <ShelfRow key={series} books={books} label={series} />)
        )}
      </div>
    </div>
  );
}
