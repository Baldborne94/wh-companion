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
      const r = await fetch(`${SB_URL}/rest/v1/${t}?on_conflict=${conflict}`, {
        method:"POST",
        headers:{...await this._h(), Prefer:"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify(d)
      });
      if(!r.ok){ const body=await r.text(); console.error(`[sb.upsert] ${t} → HTTP ${r.status}`,body); return {_error:r.status,_body:body}; }
      return r.json();
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
    async signedUrl(path, explicitToken) {
      try {
        // Accept an explicit token captured from refreshSession() to avoid any
        // staleness in the JS-client's internal getSession() cache on tablet PWA.
        let tok = explicitToken;
        if (!tok) {
          const { data } = await supabase.auth.getSession();
          tok = data?.session?.access_token ?? SB_KEY;
        }
        const r = await fetch(`${SB_URL}/storage/v1/object/sign/ebooks/${path}`, {
          method: "POST",
          headers: { apikey:SB_KEY, Authorization:`Bearer ${tok}`, "Content-Type":"application/json" },
          body: JSON.stringify({ expiresIn: 7200 }),
        });
        if (!r.ok) { console.warn("[sb.signedUrl] HTTP", r.status, path); return null; }
        const json = await r.json();
        return json?.signedURL ? `${SB_URL}${json.signedURL}` : null;
      } catch(e){ console.warn("[sb.signedUrl]", e?.message); return null; }
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
