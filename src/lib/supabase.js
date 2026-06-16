// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Use localStorage for auth storage so the PKCE code verifier and session tokens
// survive OAuth redirects on tablet (Chrome Custom Tab / Android clears sessionStorage).
export const supabase = createClient(SB_URL, SB_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });

export const signOut = () => supabase.auth.signOut();

export const db = {
  async get(table, query) {
    let req = supabase.from(table).select('*');
    if (query) {
      query.split('&').forEach(part => {
        const idx = part.indexOf('=eq.');
        if (idx !== -1) {
          const col = part.slice(0, idx);
          const val = part.slice(idx + 4);
          req = req.eq(col, val);
        }
      });
    }
    const { data } = await req;
    return data ?? [];
  },
  async insert(table, data) {
    const { data: result, error } = await supabase.from(table).insert(data).select();
    if (error) throw error;
    return result?.[0];
  },
  async update(table, id, data) {
    const { data: result, error } = await supabase.from(table).update(data).eq('id', id).select();
    if (error) throw error;
    return result?.[0];
  },
  async delete(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  },
  async upsert(table, data) {
    const { data: result } = await supabase.from(table).upsert(data, { onConflict: 'id' }).select();
    return result;
  },
};

export const storage = {
  async upload(bucket, path, file) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
  },
  url(bucket, path) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },
};