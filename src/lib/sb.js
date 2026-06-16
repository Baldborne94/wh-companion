// Shared Supabase fetch helper (used by App.jsx and reader components)
import { supabase } from './supabase';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const sb = {
  async _h() {
    const { data:{ session } } = await supabase.auth.getSession();
    const tok = session?.access_token ?? SB_KEY;
    return { apikey:SB_KEY, Authorization:`Bearer ${tok}`, "Content-Type":"application/json" };
  },
  async get(t, q="") {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers:await this._h() });
      if(!r.ok){ const body=await r.text(); console.error(`[sb.get] ${t} → HTTP ${r.status}`,body); return {_error:r.status,_body:body}; }
      return r.json();
    } catch(e){ console.error(`[sb.get] ${t} exception`,e); return []; }
  },
  async upsert(t, d, conflict="user_id,book_id") {
    try {
      const h = await this._h();
      const r = await fetch(`${SB_URL}/rest/v1/${t}?on_conflict=${conflict}`, {
        method:"POST",
        headers:{...h, Prefer:"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify(d)
      });
      if(r.ok) return r.json();
      // on_conflict failed (no unique constraint) — fall back to PATCH then INSERT
      const conds = conflict.split(',').map(c => `${c}=eq.${encodeURIComponent(d[c])}`).join('&');
      const patch = await fetch(`${SB_URL}/rest/v1/${t}?${conds}`, {
        method:"PATCH", headers:{...h, Prefer:"return=representation"}, body:JSON.stringify(d)
      });
      if(patch.ok){ const rows=await patch.json(); if(rows.length>0) return rows; }
      const ins = await fetch(`${SB_URL}/rest/v1/${t}`, {
        method:"POST", headers:{...h, Prefer:"return=representation"}, body:JSON.stringify(d)
      });
      if(!ins.ok){ const body=await ins.text(); console.error(`[sb.upsert] ${t} insert → HTTP ${ins.status}`,body); return {_error:ins.status}; }
      return ins.json();
    } catch(e){ console.error(`[sb.upsert] ${t} exception`,e); return null; }
  },
  async del(t, q="") {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${t}?${q}`, { method:"DELETE", headers:await this._h() });
      return r.ok;
    } catch(e){ console.error(`[sb.del] ${t} exception`,e); return false; }
  },
  storage: {
    async upload(path, file) {
      try {
        const { data:{ session } } = await supabase.auth.getSession();
        const tok = session?.access_token ?? SB_KEY;
        const r = await fetch(`${SB_URL}/storage/v1/object/ebooks/${path}`, { method:"POST", headers:{ apikey:SB_KEY, Authorization:`Bearer ${tok}`, "x-upsert":"true" }, body:file });
        return r.ok;
      } catch{ return false; }
    },
    async signedUrl(path, explicitToken, onError) {
      try {
        let tok = explicitToken;
        if (!tok) {
          const { data } = await supabase.auth.getSession();
          tok = data?.session?.access_token ?? SB_KEY;
        }
        // URL-encode each segment to handle special chars in filenames
        const encodedPath = path.split('/').map(s => encodeURIComponent(s)).join('/');
        const r = await fetch(`${SB_URL}/storage/v1/object/sign/ebooks/${encodedPath}`, {
          method: "POST",
          headers: { apikey:SB_KEY, Authorization:`Bearer ${tok}`, "Content-Type":"application/json" },
          body: JSON.stringify({ expiresIn: 7200 }),
        });
        if (r.ok) {
          const json = await r.json();
          const rel = json?.signedURL ?? json?.signedUrl;
          if (rel) return `${SB_URL}${rel}`;
        } else {
          console.warn("[sb.signedUrl] REST", r.status, path);
        }
        // Fallback: JS client (uses its own internal session state)
        const { data, error } = await supabase.storage.from("ebooks").createSignedUrl(path, 7200);
        if (data?.signedUrl) return data.signedUrl;
        onError?.({ status: r.ok ? 0 : r.status, jsErr: error?.message });
        return null;
      } catch(e){ onError?.({ status:0, jsErr:e?.message }); console.warn("[sb.signedUrl]",e?.message); return null; }
    },
    async download(path, explicitToken) {
      try {
        let tok = explicitToken;
        if (!tok) {
          const { data } = await supabase.auth.getSession();
          tok = data?.session?.access_token ?? SB_KEY;
        }
        const encodedPath = path.split('/').map(s => encodeURIComponent(s)).join('/');
        const r = await fetch(`${SB_URL}/storage/v1/object/ebooks/${encodedPath}`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${tok}` }
        });
        if (r.ok) return { blob: await r.blob(), status: r.status };
        console.warn("[sb.download] HTTP", r.status, path);
        return { blob: null, status: r.status };
      } catch(e){ console.warn("[sb.download] exception", e?.message); return { blob: null, status: 0 }; }
    },
    async remove(path) {
      try {
        const { error } = await supabase.storage.from("ebooks").remove([path]);
        return !error;
      } catch{ return false; }
    },
    url(path){ return `${SB_URL}/storage/v1/object/public/ebooks/${path}`; }
  }
};
