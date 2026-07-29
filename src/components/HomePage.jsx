import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { sb } from "../lib/sb";
import { C, FC } from "../data/constants";
import { BOOKS } from "../data/books";
import { AOS, AOS_BOOKS, spineColor as aosSpineColor } from "../data/aosBooks";
import CoverImage from "./CoverImage";
import { getAllNextSuggestions, getAoSAllNextSuggestions } from "../lib/readingHelpers";
import { useLang } from "../lib/i18n.jsx";

function NextUpCard({ statuses, activeBooks, onOpenBook, setSection, userId }) {
  const { t } = useLang();
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
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: C.gold, letterSpacing: 3, textTransform: "uppercase" }}>⚔ {t("home.nextUp")}</div>
        {hasHH && (
          <button onClick={toggleHhMode} style={{ background: "transparent", border: `1px solid ${C.gold}55`, borderRadius: 20, padding: "3px 10px", cursor: "pointer", display: "flex", gap: 0, overflow: "hidden", flexShrink: 0 }}>
            {['full', 'essential'].map(m => (
              <span key={m} style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 1, color: hhMode === m ? C.bg : C.muted, background: hhMode === m ? C.gold : "transparent", padding: "2px 8px", borderRadius: 12, transition: "all 0.15s" }}>{m === 'full' ? t("home.hhFull") : t("home.hhEssential")}</span>
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


function AoSNextUp({ statuses, activeBooks, onOpen }) {
  const { t } = useLang();
  const [opening, setOpening] = useState(false);
  const handleOpen = async (b) => { setOpening(true); await onOpen(b); setOpening(false); };
  const allSuggestions = useMemo(() => getAoSAllNextSuggestions(statuses), [statuses]);
  const suggestions = allSuggestions.filter(s => !activeBooks.some(b => b.id === s.book.id));
  if (!suggestions.length) return null;
  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: AOS.gold, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>{t("aos.home.nextUp")}</div>
      {suggestions.map(s => (
        <div key={s.book.id} style={{ background: `linear-gradient(135deg,${AOS.gold}12,${AOS.card})`, border: `1px solid ${AOS.gold}44`, borderLeft: `3px solid ${AOS.gold}`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <CoverImage book={s.book} width={36} height={54} radius={3} accentColor={aosSpineColor(s.book)} style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: AOS.goldDim, letterSpacing: 1, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t("aos.nextIn").replace("{series}", s.seriesName).toUpperCase()}{` · ${t("aos.seriesProgress").replace("{read}", s.readCount).replace("{total}", s.total)}`}
            </div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: AOS.text, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.book.title}</div>
            <div style={{ fontSize: 11, color: AOS.muted, fontStyle: "italic" }}>{s.book.author}</div>
          </div>
          <button onClick={() => handleOpen(s.book)} disabled={opening}
            style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 6, background: `${AOS.gold}22`, border: `1px solid ${AOS.gold}55`, color: AOS.gold, fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 1, cursor: "pointer" }}>
            {opening ? "…" : "›"}
          </button>
        </div>
      ))}
    </div>
  );
}

// Shared by BOTH universes: App passes universe="aos" + the AoS status map and
// this component swaps palette, catalogue, accents and identity labels. The 40K
// NextUpCard (HH modes + shorts) and the AoS per-saga AoSNextUp stay separate —
// that block is genuinely different logic, everything else is one page.
export default function HomePage({ user, setSection, statuses = {}, onOpenBook, onOpenDetail, onShowHelp, onStartGuide, universe = "40k" }) {
  const { t } = useLang();
  const uid = user?.id || 'anon';
  const aos = universe === "aos";
  const P = aos ? AOS : C;
  const books = aos ? AOS_BOOKS : BOOKS;
  const accentOf = (b) => aos ? aosSpineColor(b) : (FC[b.faction] || C.dim);
  // Identity labels differ per universe; generic ones (stats etc.) share home.*
  const L = aos
    ? { kicker:t("aos.home.kicker"), title:t("aos.home.title"), subtitle:t("aos.home.subtitle"),
        readingLabel:t("aos.home.currentlyReading"), readBadge:t("aos.home.read"),
        newHere:t("aos.home.newHere"), newHereSub:t("aos.home.newHereSub"), startHere:t("aos.home.startHere"),
        yourShelf:t("aos.home.yourShelf"), goToLibrary:t("aos.home.goToLibrary") }
    : { kicker:t("home.welcomeTo"), title:t("home.title"), subtitle:t("home.subtitle"),
        readingLabel:t("home.readingLabel"), readBadge:t("home.readBadge"),
        newHere:t("home.newHere"), newHereSub:t("home.newHereSub"), startHere:t("home.startHere"),
        yourShelf:t("home.yourShelf"), goToLibrary:t("home.goToLibrary") };

  // Ids kept as STRINGS so numeric 40K ids and "aos…" ids share one code path.
  const [uploadedIds, setUploadedIds] = useState(() => {
    const ids = new Set();
    const prefix = `wh40k_ebook_${uid}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) { const id = k.slice(prefix.length); if (books.some(b => String(b.id) === id)) ids.add(id); }
    }
    return ids;
  });
  const isUploadedBook = (b) => uploadedIds.has(String(b.id));

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("ebook_files").select("book_id").eq("user_id", user.id).then(({ data: files }) => {
      if (files?.length) {
        setUploadedIds(new Set(files.map(f => String(f.book_id)).filter(id => books.some(b => String(b.id) === id))));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, universe]);

  const readCount    = Object.values(statuses).filter(s => s.status === 'read').length;
  const readingCount = Object.values(statuses).filter(s => s.status === 'reading').length;

  const shelfBooks = useMemo(() => {
    return books.filter(b => isUploadedBook(b) || statuses[b.id]?.status === 'read')
      .sort((a, b) => (a.series || 'zzz').localeCompare(b.series || 'zzz') || (a.num - b.num));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedIds, statuses, universe]);

  const shelfBySeries = useMemo(() => {
    const groups = [];
    const seen = {};
    shelfBooks.forEach(b => {
      const key = b.series || 'Standalone';
      if (!seen[key]) { seen[key] = []; groups.push({ series: key, books: seen[key] }); }
      seen[key].push(b);
    });
    return groups;
  }, [shelfBooks]);

  const activeBooks = books.filter(b => statuses[b.id]?.status === 'reading');
  // A brand-new user has nothing tracked yet — don't push a "Next Up" book on
  // them; instead invite them into the curated starter guide.
  const isNewcomer = readCount === 0 && readingCount === 0 && activeBooks.length === 0 && shelfBooks.length === 0;
  const [openingBookId, setOpeningBookId] = useState(null);
  const [openErrorId, setOpenErrorId] = useState(null);

  // Shelf click: open the reader if the ebook is available, otherwise open the
  // book's detail page (never a dead click).
  const openShelfBook = async (b) => {
    if (isUploadedBook(b) && onOpenBook) {
      const ok = await onOpenBook(b);
      if (ok === true) return;
    }
    if (onOpenDetail) onOpenDetail(b);
    else setSection('library');
  };

  const ShelfRow = ({ books, label }) => {
    if (!books.length) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        {label && <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: P.goldDim, letterSpacing: 3, textTransform: "uppercase", padding: "0 16px", marginBottom: 4 }}>{label}</div>}
        <div style={{ position: "relative", overflowX: "auto", overflowY: "visible", paddingBottom: 10 }}>
          <div style={{ display: "flex", gap: 5, padding: "0 16px", minWidth: "max-content", alignItems: "flex-end" }}>
            {books.map(b => {
              const sc = accentOf(b);
              const isUploaded = isUploadedBook(b);
              const bst = statuses[b.id]?.status || 'none';
              const isReading = bst === 'reading';
              const isRead    = bst === 'read';
              return (
                <div key={b.id} onClick={() => openShelfBook(b)} title={`${b.title} — ${b.author}`}
                  style={{ flexShrink: 0, position: "relative", cursor: "pointer", borderRadius: "3px 3px 0 0", overflow: "hidden", boxShadow: "2px 3px 8px rgba(0,0,0,0.6)", transition: "transform 0.15s ease, box-shadow 0.15s ease", border: isUploaded ? `1px solid ${P.gold}99` : "none" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-5px)"; e.currentTarget.style.boxShadow = "4px 8px 16px rgba(0,0,0,0.8)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "2px 3px 8px rgba(0,0,0,0.6)"; }}
                  onTouchStart={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "4px 8px 16px rgba(0,0,0,0.8)"; }}
                  onTouchEnd={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "2px 3px 8px rgba(0,0,0,0.6)"; }}
                  onTouchCancel={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "2px 3px 8px rgba(0,0,0,0.6)"; }}
                >
                  <CoverImage book={b} width={52} height={80} radius={0} accentColor={sc} />
                  {isReading && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: P.blue, pointerEvents: "none" }} />}
                  {isRead    && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: P.green, pointerEvents: "none" }} />}
                </div>
              );
            })}
          </div>
          <div style={{ height: 10, background: aos ? "linear-gradient(to bottom,#4a3510,#2a1f08)" : "linear-gradient(to bottom,#5a3a1a,#3a2010)", marginLeft: 16, marginRight: 16, borderRadius: "0 0 4px 4px", boxShadow: "0 3px 6px rgba(0,0,0,0.5)" }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: 80, minHeight: "100%", background: aos ? AOS.bg : undefined }}>
      {aos && <style>{`@keyframes aosGlow{0%,100%{opacity:0.4;}50%{opacity:0.9;}}`}</style>}
      <div style={{ padding: "24px 16px 20px", borderBottom: `1px solid ${P.border}`, background: `linear-gradient(180deg,${P.surface},${P.bg})`, position: "relative" }}>
        {aos && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right,transparent,${AOS.gold},transparent)`, animation: "aosGlow 3s ease-in-out infinite" }}/>}
        {onShowHelp && (
          <button onClick={onShowHelp} style={{ position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: "50%", background: "transparent", border: `1px solid ${P.border}`, color: P.muted, fontSize: 13, fontFamily: "'Cinzel',serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>?</button>
        )}
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 5, color: P.goldDim, textTransform: "uppercase", marginBottom: 4 }}>{L.kicker}</div>
        <h1 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 26, color: P.text, lineHeight: 1.1, marginBottom: 4 }}>{L.title}</h1>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: P.goldDim, letterSpacing: 3 }}>{L.subtitle}</div>
        {aos && user && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${AOS.gold}55` }}/>}
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: AOS.muted }}>{user.user_metadata?.full_name || user.email}</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", borderBottom: `1px solid ${P.border}` }}>
        {[{ n: readingCount, l: t("home.statReading"), c: P.blue }, { n: readCount, l: t("home.statRead"), c: P.green }, { n: books.length, l: t("home.statTotal"), c: P.muted }].map(s => (
          <div key={s.l} style={{ flex: 1, padding: "12px 4px", textAlign: "center", borderRight: `1px solid ${P.border}` }}>
            <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color: s.c, lineHeight: 1 }}>{s.n}</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 7, color: P.muted, letterSpacing: 2, marginTop: 3, textTransform: "uppercase" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {activeBooks.length > 0 && (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: P.blue, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>{L.readingLabel}</div>
          {activeBooks.map(b => {
            const hasEbook = isUploadedBook(b);
            return (
              <button key={b.id} type="button"
                disabled={openingBookId === b.id}
                onClick={async () => {
                  if (hasEbook && onOpenBook) {
                    setOpeningBookId(b.id);
                    setOpenErrorId(null);
                    const t0 = Date.now();
                    const ok = await onOpenBook(b);
                    // Ensure "…" is visible for at least 400ms so user sees feedback
                    const elapsed = Date.now() - t0;
                    if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
                    setOpeningBookId(null);
                    if (ok !== true) {
                      const code = typeof ok === 'string' ? ok : 'err';
                      setOpenErrorId({ id: b.id, code });
                      if (code === 'no_session') {
                        // Session expired — sign out so user lands on login page
                        setTimeout(() => supabase.auth.signOut(), 1500);
                      } else {
                        setTimeout(() => setOpenErrorId(null), 5000);
                      }
                    }
                  } else {
                    setSection('library');
                  }
                }}
                style={{ background: `linear-gradient(135deg,${P.blue}18,${P.card})`, border: `1px solid ${P.blue}44`, borderLeft: `3px solid ${P.blue}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", touchAction: "manipulation" }}>
                <CoverImage book={b} width={36} height={50} radius={3} accentColor={accentOf(b)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: P.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: P.muted }}>{b.series}{b.num > 0 ? ` #${b.num}` : ""} · {b.author}</div>
                </div>
                {hasEbook
                  ? (() => { const errCode = openErrorId?.id === b.id ? openErrorId.code : null; return (
                    <span style={{ background: errCode ? `${P.red}22` : `${P.gold}22`, border: `1px solid ${errCode ? P.red : P.gold}55`, borderRadius: 6, padding: "4px 8px", fontFamily: "'Cinzel',serif", fontSize: 9, color: errCode ? P.red : P.gold, letterSpacing: 1, flexShrink: 0 }}>
                      {openingBookId === b.id ? "…" : errCode === 'no_session' ? "SESSION" : errCode === 'no_meta' ? "ERR-M" : errCode?.startsWith('no_url_s') ? `${errCode.slice(7).replace('_d','/').replace('s','')}` : errCode?.startsWith('no_url') ? `U-${errCode.slice(7)||'?'}` : errCode ? "ERR" : L.readBadge}
                    </span>
                  ); })()

                  : <span style={{ color: P.blue, fontSize: 16, flexShrink: 0 }}>›</span>
                }
              </button>
            );
          })}
        </div>
      )}

      {isNewcomer ? (
        <div style={{ padding: "14px 16px 0" }}>
          <button type="button" onClick={() => (onStartGuide ? onStartGuide() : setSection('reading'))}
            style={{ width: "100%", textAlign: "left", cursor: "pointer", background: `linear-gradient(135deg,${P.gold}18,${P.card})`, border: `1px solid ${P.gold}55`, borderLeft: `3px solid ${P.gold}`, borderRadius: 12, padding: "16px 16px" }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: P.gold, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>✦ {L.newHere}</div>
            <div style={{ fontSize: 12, color: P.muted, lineHeight: 1.6, marginBottom: 12 }}>{L.newHereSub}</div>
            <span style={{ display: "inline-block", background: `${P.gold}22`, border: `1px solid ${P.gold}`, borderRadius: 8, color: P.gold, padding: "9px 16px", fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1 }}>{L.startHere}</span>
          </button>
        </div>
      ) : (
        aos
          ? <AoSNextUp statuses={statuses} activeBooks={activeBooks} onOpen={openShelfBook} />
          : <NextUpCard statuses={statuses} activeBooks={activeBooks} onOpenBook={onOpenBook} setSection={setSection} userId={user?.id} />
      )}

      <div style={{ padding: "16px 0 0" }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: P.goldDim, letterSpacing: 3, textTransform: "uppercase", padding: "0 16px", marginBottom: 10 }}>{L.yourShelf}</div>
        {shelfBooks.length === 0 ? (
          aos ? (
            <div style={{ padding: "40px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 48 }}>📚</div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 15, color: AOS.muted }}>{t("aos.home.shelfEmpty")}</div>
              <div style={{ fontSize: 12, color: AOS.muted, maxWidth: 260, lineHeight: 1.6, textAlign: "center" }}>{t("aos.home.shelfEmptyHint")}</div>
              <button onClick={() => setSection('library')} style={{ background: `${AOS.gold}22`, border: `1px solid ${AOS.gold}`, borderRadius: 8, padding: "10px 24px", color: AOS.gold, fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 2, cursor: "pointer" }}>{L.goToLibrary}</button>
            </div>
          ) : (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <div style={{ color: P.muted, fontSize: 13, fontStyle: "italic", marginBottom: 12 }}>{t("home.emptyShelf")}</div>
            <button onClick={() => setSection('library')} style={{ background: "transparent", border: `1px solid ${P.gold}`, borderRadius: 8, color: P.gold, padding: "8px 20px", fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 2, cursor: "pointer" }}>{L.goToLibrary}</button>
          </div>
          )
        ) : (
          shelfBySeries.map(({ series, books }) => <ShelfRow key={series} books={books} label={series} />)
        )}
      </div>
    </div>
  );
}
