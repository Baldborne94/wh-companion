import { HH_FULL, HH_MIN, findHHBook } from '../data/hhGuide';
import { BOOKS } from '../data/books';

export function getHHNextFromGuide(guide, statuses, readShorts = new Set()) {
  const isUnread = id => { const s = statuses[id]?.status || 'none'; return s === 'none' || s === 'want'; };
  const eligibleNovels = () => guide.flatMap(p => p.books || [])
    .filter(e => { const et = e.type || 'novel'; return et !== 'short' && et !== 'audio' && !e.b40k; })
    .map(e => findHHBook(e)).filter(Boolean);
  const seriesProgress = () => {
    const el = eligibleNovels();
    return `${el.filter(b => statuses[b.id]?.status === 'read').length}/${el.length} read`;
  };

  // Find the furthest part index where the user has read or is reading a novel.
  // Shorts from parts strictly before this index are skipped — the user has already
  // moved past that point in the reading order, so stale unread shorts shouldn't
  // block the suggestion from advancing to the current part.
  let currentPartIdx = -1;
  guide.forEach((part, i) => {
    if (part.pickOne) return;
    const hasNovelProgress = (part.books || []).some(entry => {
      if ((entry.type || 'novel') === 'short' || entry.type === 'audio' || entry.b40k) return false;
      const book = findHHBook(entry);
      const s = book && statuses[book.id]?.status;
      return s === 'read' || s === 'reading';
    });
    if (hasNovelProgress) currentPartIdx = i;
  });

  for (const [i, part] of guide.entries()) {
    if (part.pickOne) continue;
    for (const entry of (part.books || [])) {
      if (entry.b40k) continue;
      const t = entry.type || 'novel';
      if (t === 'short' || t === 'audio') {
        if (i < currentPartIdx) continue;
        const shortId = `${entry.t}__${entry.a}`;
        if (!readShorts.has(shortId))
          return { isShort: true, entry, shortId, reason: 'Next in Horus Heresy', seriesProgress: seriesProgress() };
        continue;
      }
      const book = findHHBook(entry);
      if (book && isUnread(book.id))
        return { book, reason: 'Next in Horus Heresy', seriesProgress: seriesProgress(), priority: 0 };
    }
  }
  return null;
}

export function getNextSuggestion(statuses, hhMode = 'full', readShorts = new Set()) {
  const COLD_STARTS = ["Horus Rising", "Eisenhorn", "Gaunt's Ghosts", "Ultramarines: The Omnibus", "Night Lords: The Omnibus"];

  const hasReadAnyHH = BOOKS.some(b => b.series === 'Horus Heresy' && statuses[b.id]?.status === 'read');
  if (hasReadAnyHH || BOOKS.some(b => b.series === 'Horus Heresy' && statuses[b.id]?.status === 'reading')) {
    const guide = hhMode === 'essential' ? HH_MIN : HH_FULL;
    const hhNext = getHHNextFromGuide(guide, statuses, readShorts);
    if (hhNext) return hhNext;
  }

  const seriesMap = {};
  BOOKS.forEach(b => { if (!seriesMap[b.series]) seriesMap[b.series] = []; seriesMap[b.series].push(b); });
  Object.values(seriesMap).forEach(arr => arr.sort((a, b) => a.num - b.num));

  const st = id => statuses[id]?.status || 'none';
  const isUnread = id => { const s = st(id); return s === 'none' || s === 'want'; };

  // P1 — next after a book you're currently reading
  const readingIds = BOOKS.filter(b => st(b.id) === 'reading').map(b => b.id);
  for (const rid of readingIds) {
    const rb = BOOKS.find(b => b.id === rid);
    if (!rb) continue;
    const series = seriesMap[rb.series] || [];
    const readCount = series.filter(b => st(b.id) === 'read').length;
    const next = series.find(b => b.num > rb.num && isUnread(b.id));
    if (next) return { book: next, reason: `Next in ${rb.series}`, seriesProgress: `${readCount}/${series.length} read`, priority: 1 };
  }

  // P2 — next after the furthest-read book in any in-progress series
  const seriesProgress = {};
  BOOKS.forEach(b => {
    if (st(b.id) === 'read') {
      if (!seriesProgress[b.series]) seriesProgress[b.series] = 0;
      seriesProgress[b.series] = Math.max(seriesProgress[b.series], b.num);
    }
  });
  const progressEntries = Object.entries(seriesProgress).sort((a, b) => b[1] - a[1]);
  for (const [sName, maxNum] of progressEntries) {
    const series = seriesMap[sName] || [];
    const next = series.find(b => b.num > maxNum && isUnread(b.id));
    const readCount = series.filter(b => st(b.id) === 'read').length;
    if (next) return { book: next, reason: `Continue ${sName}`, seriesProgress: `${readCount}/${series.length} read`, priority: 2 };
  }

  // P3 — cold start recommendation
  for (const title of COLD_STARTS) {
    const book = BOOKS.find(b => b.title === title);
    if (book && isUnread(book.id)) {
      const series = seriesMap[book.series] || [];
      return { book, reason: 'Recommended start', seriesProgress: `${series.length} book series`, priority: 3 };
    }
  }
  return null;
}
