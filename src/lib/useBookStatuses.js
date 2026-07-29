import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import { sb } from "./sb";
import { BOOKS } from "../data/books";
import { AOS_BOOKS } from "../data/aosBooks";
import { loadAllStatuses, loadAoSStatuses, setBookStatusLS } from "./bookStatus";
import { loadAllProgressLS, mergeProgress, deriveStatusMap } from "./readingState";
import {
  achievementFromId,
  computeReadingAchievements,
  computeAoSReadingAchievements,
  diffAchievements,
  loadUnlockedIds,
  saveUnlockedIds,
} from "./achievements";

const AOS_IDS = new Set(AOS_BOOKS.map(b => String(b.id)));
const WH40K_IDS = new Set(BOOKS.map(b => String(b.id)));

export function useBookStatuses({ userId }) {
  // What the user explicitly set. Never rendered directly — the UI consumes the
  // derived maps below, so a screen can't disagree with another about a book.
  const [manualStatuses, setManualStatuses] = useState({});
  const [manualAosStatuses, setManualAosStatuses] = useState({});
  const [progress, setProgress] = useState(() => loadAllProgressLS(userId));

  // Bidirectional sync helper: merges local + DB (newest wins), pushes local-only entries up
  const syncStatuses = useCallback(async (uid, localMap, isAoS) => {
    const rows = await sb.get("reading_status", `user_id=eq.${uid}&select=book_id,status,updated_at,started_at,completed_at`);
    const dbMap = {};
    if (rows && !rows._error && rows.length) {
      rows.forEach(r => { dbMap[r.book_id] = r; });
    }
    const merged = { ...localMap };
    Object.entries(dbMap).forEach(([bid, dbRow]) => {
      if (isAoS && !String(bid).startsWith('aos')) return;
      if (!isAoS && String(bid).startsWith('aos')) return;
      const local = merged[bid];
      if (!local || !local.updatedAt || new Date(dbRow.updated_at) > new Date(local.updatedAt)) {
        merged[bid] = { status: dbRow.status, updatedAt: dbRow.updated_at, startedAt: dbRow.started_at, completedAt: dbRow.completed_at };
        localStorage.setItem(`wh40k_status_${uid}_${bid}`, JSON.stringify(merged[bid]));
      }
    });
    const toSync = Object.entries(localMap).filter(([bid, local]) => {
      if (!local?.status || local.status === 'none') return false;
      if (isAoS && !String(bid).startsWith('aos')) return false;
      if (!isAoS && String(bid).startsWith('aos')) return false;
      const db = dbMap[bid];
      if (!db) return true;
      if (!local.updatedAt) return false;
      return new Date(local.updatedAt) > new Date(db.updated_at);
    });
    toSync.forEach(([bookId, st]) => sb.upsert("reading_status", {
      user_id: uid, book_id: bookId, status: st.status,
      updated_at: st.updatedAt || new Date().toISOString(),
      ...(st.startedAt ? { started_at: st.startedAt } : {}),
      ...(st.completedAt ? { completed_at: st.completedAt } : {}),
    }, "user_id,book_id"));
    return merged;
  }, []);

  useEffect(() => {
    const uid = userId;
    const local = loadAoSStatuses(uid);
    setManualAosStatuses(local);
    if (!uid) return;
    syncStatuses(uid, local, true).then(merged => setManualAosStatuses(merged));
  }, [userId, syncStatuses]);

  useEffect(() => {
    const uid = userId;
    const local = loadAllStatuses(uid);
    setManualStatuses(local);
    if (!uid) return;
    syncStatuses(uid, local, false).then(merged => setManualStatuses(merged));
  }, [userId, syncStatuses]);

  // Observed progress: localStorage first so it survives offline, then whatever
  // other devices synced. `refreshProgress` is called when a reader closes.
  const refreshProgress = useCallback(() => {
    const uid = userId;
    const local = loadAllProgressLS(uid);
    setProgress(local);
    if (!uid) return;
    sb.get("reading_progress", `user_id=eq.${uid}&select=book_id,progress_pct,last_read`)
      .then(rows => { if (rows && !rows._error) setProgress(mergeProgress(local, rows)); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => { refreshProgress(); }, [refreshProgress]);

  const statuses    = useMemo(() => deriveStatusMap(manualStatuses,    progress, WH40K_IDS), [manualStatuses,    progress]);
  const aosStatuses = useMemo(() => deriveStatusMap(manualAosStatuses, progress, AOS_IDS),   [manualAosStatuses, progress]);

  // Refs for cross-universe achievement checks (avoids stale closures)
  const statusesRef    = useRef({});
  const aosStatusesRef = useRef({});
  const progressRef    = useRef({});
  useEffect(() => { statusesRef.current    = statuses;    }, [statuses]);
  useEffect(() => { aosStatusesRef.current = aosStatuses; }, [aosStatuses]);
  useEffect(() => { progressRef.current    = progress;    }, [progress]);
  const didInitialAosCheck = useRef(false);

  // Achievement state
  const [unlockedIds,       setUnlockedIds]       = useState([]);
  const [unlockedIdsLoaded, setUnlockedIdsLoaded] = useState(false);
  const [pendingAchievements, setPendingAchievements] = useState([]);

  useEffect(() => {
    if (!userId) {
      setUnlockedIds([]); setUnlockedIdsLoaded(false);
      didInitialAosCheck.current = false;
      didFirstReadingPass.current = false;
      didFirstAosPass.current = false;
      return;
    }
    loadUnlockedIds(supabase, userId).then(ids => { setUnlockedIds(ids); setUnlockedIdsLoaded(true); });
  }, [userId]);

  useEffect(() => {
    if (!userId || !unlockedIdsLoaded || didInitialAosCheck.current) return;
    didInitialAosCheck.current = true;
    const nowUnlocked = computeAoSReadingAchievements(aosStatuses, AOS_BOOKS);
    setUnlockedIds(prev => {
      const nonAos    = prev.filter(id => !id.startsWith('aos_') && !id.startsWith('aos_series:'));
      const corrected = [...new Set([...nonAos, ...nowUnlocked])];
      const changed   = corrected.length !== prev.length || corrected.some(id => !prev.includes(id)) || prev.some(id => !corrected.includes(id));
      if (!changed) return prev;
      saveUnlockedIds(supabase, userId, corrected);
      return corrected;
    });
  }, [userId, unlockedIdsLoaded, aosStatuses]);

  const checkReadingAchievements = useCallback((wh40kStatuses) => {
    if (!userId) return;
    const nowUnlocked = computeReadingAchievements(wh40kStatuses, BOOKS);
    setUnlockedIds(prev => {
      const newIds = diffAchievements(prev, nowUnlocked);
      if (!newIds.length) return prev;
      const merged = [...prev, ...newIds];
      saveUnlockedIds(supabase, userId, merged);
      const defs = newIds.map(id => achievementFromId(id)).filter(Boolean)
                         .map(d => ({ ...d, _universe: 'wh40k' }));
      setPendingAchievements(q => [...q, ...defs]);
      return merged;
    });
  }, [userId]);

  const checkAoSReadingAchievements = useCallback((aosStats) => {
    if (!userId) return;
    const nowUnlocked = computeAoSReadingAchievements(aosStats, AOS_BOOKS);
    setUnlockedIds(prev => {
      const newIds = diffAchievements(prev, nowUnlocked);
      if (!newIds.length) return prev;
      const merged = [...prev, ...newIds];
      saveUnlockedIds(supabase, userId, merged);
      const defs = newIds.map(id => achievementFromId(id)).filter(Boolean)
                         .map(d => ({ ...d, _universe: 'aos' }));
      setPendingAchievements(q => [...q, ...defs]);
      return merged;
    });
  }, [userId]);

  // A book can now reach "read" without anyone pressing anything (progress
  // crossed the finish line on another device, or the auto-mark write was lost
  // offline). Watch the derived maps so those still unlock their achievements.
  // The first pass after load reconciles silently — it is catching up on
  // history, not celebrating it; only later transitions pop a card.
  const didFirstReadingPass = useRef(false);
  useEffect(() => {
    if (!userId || !unlockedIdsLoaded) return;
    if (!didFirstReadingPass.current) {
      didFirstReadingPass.current = true;
      const nowUnlocked = computeReadingAchievements(statuses, BOOKS);
      setUnlockedIds(prev => {
        const newIds = diffAchievements(prev, nowUnlocked);
        if (!newIds.length) return prev;
        const merged = [...prev, ...newIds];
        saveUnlockedIds(supabase, userId, merged);
        return merged;
      });
      return;
    }
    checkReadingAchievements(statuses);
  }, [userId, unlockedIdsLoaded, statuses, checkReadingAchievements]);

  const didFirstAosPass = useRef(false);
  useEffect(() => {
    if (!userId || !unlockedIdsLoaded) return;
    // The corrective pass above already reconciled this map silently.
    if (!didFirstAosPass.current) { didFirstAosPass.current = true; return; }
    checkAoSReadingAchievements(aosStatuses);
  }, [userId, unlockedIdsLoaded, aosStatuses, checkAoSReadingAchievements]);

  const updateStatus = useCallback((bookId, newStatus) => {
    const uid = userId;
    const updated = setBookStatusLS(uid, bookId, newStatus);
    setManualStatuses(prev => {
      const next = { ...prev, [bookId]: updated };
      if (newStatus === 'read') checkReadingAchievements(deriveStatusMap(next, progressRef.current, WH40K_IDS));
      return next;
    });
    if (uid) {
      sb.upsert("reading_status", {
        user_id: uid, book_id: bookId, status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'reading' && !updated.startedAt ? { started_at: new Date().toISOString() } : {}),
        ...(newStatus === 'read' ? { completed_at: new Date().toISOString() } : {}),
      }, "user_id,book_id");
    }
  }, [userId, checkReadingAchievements]);

  const updateAoSStatus = useCallback((bookId, newStatus) => {
    const uid = userId;
    const updated = setBookStatusLS(uid, bookId, newStatus);
    setManualAosStatuses(prev => {
      const next = { ...prev, [bookId]: updated };
      if (newStatus === 'read') checkAoSReadingAchievements(deriveStatusMap(next, progressRef.current, AOS_IDS));
      return next;
    });
    if (uid) {
      sb.upsert("reading_status", {
        user_id: uid, book_id: bookId, status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'reading' && !updated.startedAt ? { started_at: new Date().toISOString() } : {}),
        ...(newStatus === 'read' ? { completed_at: new Date().toISOString() } : {}),
      }, "user_id,book_id");
    }
  }, [userId, checkAoSReadingAchievements]);

  return {
    statuses,
    aosStatuses,
    progress,
    refreshProgress,
    updateStatus,
    updateAoSStatus,
    unlockedIds,
    setUnlockedIds,
    pendingAchievements,
    setPendingAchievements,
  };
}
