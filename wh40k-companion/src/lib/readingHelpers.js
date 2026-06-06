import { HH_FULL, HH_MIN, findHHBook } from '../data/hhGuide';
import { BOOKS } from '../data/books';

export function getHHNextFromGuide(guide, statuses, readShorts = new Set()) {
  const isUnread = id => { const s = statuses[id]?.status || 'none'; return s === 'none' || s === 'want'; };
  const eligibleNovels = () => guide.flatMap(p => p.books || [])
    .filter(e => { const et = e.type || 'novel'; return et !== 'short' && et !== 'audio' && !e.b40k; })
    .map(e => findHHBook(e)).filter(Boolean);
  const allShorts = guide.flatMap(p => p.books || [])
    .filter(e => { const et = e.type || 'novel'; return (et === 'short' || et === 'audio') && !e.b40k; });
  const seriesProgress = () => {
    const el = eligibleNovels();
    const novelsRead = el.filter(b => statuses[b.id]?.status === 'read').length;
    const shortsRead = allShorts.filter(e => readShorts.has(`${e.t}__${e.a}`)).length;
    return `${novelsRead + shortsRead}/${el.length + allShorts.length} read`;
  };

  for (const [i, part] of guide.entries()) {
    if (part.pickOne) continue;

    // Skip shorts only if this part itself has a novel already started or finished.
    // Using a per-part check (not a global high-watermark) avoids the problem where
    // a novel read out of order in a later part (e.g. Prospero Burns in Part 8)
    // would cause unread shorts in an earlier part (e.g. The Kaban Project in Part 7)
    // to be incorrectly skipped.
    const skipShorts = (part.books || []).some(entry => {
      if (entry.b40k || entry.opt) return false;
      const t = entry.type || 'novel';
      if (t === 'short' || t === 'audio') return false;
      const book = findHHBook(entry);
      const s = book && statuses[book.id]?.status;
      return s === 'read' || s === 'reading';
    });

    for (const entry of (part.books || [])) {
      if (entry.b40k) continue;
      const t = entry.type || 'novel';
      if (t === 'short' || t === 'audio') {
        if (skipShorts) continue;
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

// Returns ALL active series' next books (one per saga).
// HH guide suggestion comes first; other series sorted by currently-reading then most-read.
export function getAllNextSuggestions(statuses, hhMode = 'full', readShorts = new Set()) {
  const results = [];
  const usedSeries = new Set();
  const st = id => statuses[id]?.status || 'none';
  const isUnread = id => { const s = st(id); return s === 'none' || s === 'want'; };

  const seriesMap = {};
  BOOKS.forEach(b => { if (!seriesMap[b.series]) seriesMap[b.series] = []; seriesMap[b.series].push(b); });
  Object.values(seriesMap).forEach(arr => arr.sort((a, b) => a.num - b.num));

  // HH guide handles Horus Heresy + Siege of Terra together
  const hasHH = BOOKS.some(b => b.series === 'Horus Heresy' && (st(b.id) === 'read' || st(b.id) === 'reading'));
  if (hasHH) {
    const guide = hhMode === 'essential' ? HH_MIN : HH_FULL;
    const hhNext = getHHNextFromGuide(guide, statuses, readShorts);
    if (hhNext) results.push(hhNext);
    usedSeries.add('Horus Heresy');
    usedSeries.add('Siege of Terra');
  }

  // All other series with any read/reading progress
  const seriesInfo = {};
  BOOKS.forEach(b => {
    const s = st(b.id);
    if (s !== 'read' && s !== 'reading') return;
    if (usedSeries.has(b.series)) return;
    if (!seriesInfo[b.series]) seriesInfo[b.series] = { readCount: 0, isReading: false, maxNum: 0 };
    if (s === 'read') { seriesInfo[b.series].readCount++; seriesInfo[b.series].maxNum = Math.max(seriesInfo[b.series].maxNum, b.num); }
    if (s === 'reading') { seriesInfo[b.series].isReading = true; seriesInfo[b.series].maxNum = Math.max(seriesInfo[b.series].maxNum, b.num); }
  });

  Object.entries(seriesInfo)
    .sort(([, a], [, b]) => { if (a.isReading !== b.isReading) return a.isReading ? -1 : 1; return b.readCount - a.readCount; })
    .forEach(([sName, info]) => {
      const series = seriesMap[sName] || [];
      const next = series.find(b => b.num > info.maxNum && isUnread(b.id));
      if (!next) return;
      const readCount = series.filter(b => st(b.id) === 'read').length;
      results.push({ book: next, reason: `Next in ${sName}`, seriesProgress: `${readCount}/${series.length} read`, priority: info.isReading ? 1 : 2 });
    });

  // Cold start only if nothing found yet
  if (results.length === 0) {
    const COLD_STARTS = ["Horus Rising", "Eisenhorn", "Gaunt's Ghosts", "Ultramarines: The Omnibus", "Night Lords: The Omnibus"];
    for (const title of COLD_STARTS) {
      const book = BOOKS.find(b => b.title === title);
      if (book && isUnread(book.id)) {
        const series = seriesMap[book.series] || [];
        results.push({ book, reason: 'Recommended start', seriesProgress: `${series.length} book series`, priority: 3 });
        break;
      }
    }
  }

  return results;
}

// Kept for ReadingSection (single suggestion)
export function getNextSuggestion(statuses, hhMode = 'full', readShorts = new Set()) {
  return getAllNextSuggestions(statuses, hhMode, readShorts)[0] || null;
}
