export function getBookStatus(uid, bid) {
  try { return JSON.parse(localStorage.getItem(`wh40k_status_${uid||'anon'}_${bid}`)) || {status:'none'}; }
  catch { return {status:'none'}; }
}
export function setBookStatusLS(uid, bid, s) {
  const e = getBookStatus(uid, bid), now = new Date().toISOString();
  const d = {...e, status:s, updatedAt:now};
  if (s==='reading' && !e.startedAt) d.startedAt = now;
  if (s==='read') { d.completedAt = now; if (!d.startedAt) d.startedAt = now; }
  localStorage.setItem(`wh40k_status_${uid||'anon'}_${bid}`, JSON.stringify(d));
  return d;
}
export function loadAllStatuses(uid) {
  const out = {}, prefix = `wh40k_status_${uid||'anon'}_`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) { const id = parseInt(k.slice(prefix.length)); if (!isNaN(id)) try { out[id] = JSON.parse(localStorage.getItem(k)); } catch {} }
  }
  return out;
}
export function loadAoSStatuses(uid) {
  const out = {}, prefix = `wh40k_status_${uid||'anon'}_`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) { const id = k.slice(prefix.length); if (id.startsWith('aos')) try { out[id] = JSON.parse(localStorage.getItem(k)); } catch {} }
  }
  return out;
}
export function getBookRating(uid, bid) {
  return parseInt(localStorage.getItem(`wh40k_rating_${uid||'anon'}_${bid}`) || '0') || 0;
}
export function setBookRatingLS(uid, bid, r) {
  localStorage.setItem(`wh40k_rating_${uid||'anon'}_${bid}`, String(r));
}
export function getBookNotes(uid, bid) {
  return localStorage.getItem(`wh40k_notes_${uid||'anon'}_${bid}`) || '';
}
export function setBookNotesLS(uid, bid, n) {
  if (n) localStorage.setItem(`wh40k_notes_${uid||'anon'}_${bid}`, n);
  else localStorage.removeItem(`wh40k_notes_${uid||'anon'}_${bid}`);
}
