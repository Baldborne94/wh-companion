import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { sb } from "./sb";
import { BOOKS } from "../data/books";
import { AOS_BOOKS } from "../data/aosBooks";
import { loadAllStatuses, loadAoSStatuses, setBookStatusLS } from "./bookStatus";
import {
  achievementFromId,
  computeReadingAchievements,
  computeAoSReadingAchievements,
  diffAchievements,
  loadUnlockedIds,
  saveUnlockedIds,
} from "./achievements";

export function useBookStatuses({ userId }) {
  const [statuses, setStatuses] = useState({});
  const [aosStatuses, setAosStatuses] = useState({});

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
    setAosStatuses(local);
    if (!uid) return;
    syncStatuses(uid, local, true).then(merged => setAosStatuses(merged));
  }, [userId, syncStatuses]);

  useEffect(() => {
    const uid = userId;
    const local = loadAllStatuses(uid);
    setStatuses(local);
    if (!uid) return;
    syncStatuses(uid, local, false).then(merged => setStatuses(merged));
  }, [userId, syncStatuses]);

  // Refs for cross-universe achievement checks (avoids stale closures)
  const statusesRef    = useRef({});
  const aosStatusesRef = useRef({});
  useEffect(() => { statusesRef.current    = statuses;    }, [statuses]);
  useEffect(() => { aosStatusesRef.current = aosStatuses; }, [aosStatuses]);
  const didInitialAosCheck = useRef(false);

  // Achievement state
  const [unlockedIds,       setUnlockedIds]       = useState([]);
  const [unlockedIdsLoaded, setUnlockedIdsLoaded] = useState(false);
  const [pendingAchievements, setPendingAchievements] = useState([]);

  useEffect(() => {
    if (!userId) { setUnlockedIds([]); setUnlockedIdsLoaded(false); didInitialAosCheck.current = false; return; }
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

  const updateStatus = useCallback((bookId, newStatus) => {
    const uid = userId;
    const updated = setBookStatusLS(uid, bookId, newStatus);
    setStatuses(prev => {
      const next = { ...prev, [bookId]: updated };
      if (newStatus === 'read') checkReadingAchievements(next);
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
    setAosStatuses(prev => {
      const next = { ...prev, [bookId]: updated };
      if (newStatus === 'read') checkAoSReadingAchievements(next);
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
    updateStatus,
    updateAoSStatus,
    unlockedIds,
    setUnlockedIds,
    pendingAchievements,
    setPendingAchievements,
  };
}
