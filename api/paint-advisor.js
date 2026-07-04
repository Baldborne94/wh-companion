// Vercel serverless function — secure proxy for the AI Color Advisor.
//
// Why this exists:
//   The previous implementation called api.anthropic.com directly from the
//   browser with a VITE_ANTHROPIC_API_KEY, which bundles the key into the
//   public client JS (anyone could extract and abuse it). This proxy keeps the
//   key server-side and enforces a per-user daily usage limit.
//
// Required Vercel environment variables (server-side, NO "VITE_" prefix):
//   ANTHROPIC_API_KEY           — Anthropic API key
//   SUPABASE_URL                — Supabase project URL (or reuses VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key (bypasses RLS)
//   SUPABASE_ANON_KEY           — Supabase anon key (or reuses VITE_SUPABASE_ANON_KEY)
//
// Requires the `ai_usage` table (see supabase/ai_usage.sql).

const DAILY_LIMIT = 3;
// Max photos actually sent to the vision model per request. Users may store more
// per miniature (gallery); only the first AI_PHOTO_LIMIT are analysed to keep the
// request fast and the token cost bounded.
const AI_PHOTO_LIMIT = 6;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const SB_URL     = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SB_ANON    = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!ANTHROPIC_KEY) { res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY" }); return; }
  if (!SB_URL || !SB_SERVICE) { res.status(500).json({ error: "Server missing Supabase config" }); return; }

  // 1. Authenticate the caller via their Supabase access token.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  let userId;
  try {
    const ur = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON || SB_SERVICE, Authorization: `Bearer ${token}` },
    });
    if (!ur.ok) { res.status(401).json({ error: "Invalid session" }); return; }
    const u = await ur.json();
    userId = u?.id;
  } catch { res.status(401).json({ error: "Auth check failed" }); return; }
  if (!userId) { res.status(401).json({ error: "No user" }); return; }

  // 2. Check today's usage (service role bypasses RLS).
  const day = new Date().toISOString().slice(0, 10);
  const sbHeaders = {
    apikey: SB_SERVICE,
    Authorization: `Bearer ${SB_SERVICE}`,
    "Content-Type": "application/json",
  };
  let used = 0;
  try {
    const cr = await fetch(
      `${SB_URL}/rest/v1/ai_usage?user_id=eq.${userId}&day=eq.${day}&select=count`,
      { headers: sbHeaders }
    );
    const rows = await cr.json();
    if (Array.isArray(rows) && rows[0]) used = rows[0].count || 0;
  } catch { /* treat as 0 on read failure */ }

  if (used >= DAILY_LIMIT) {
    res.status(429).json({ error: "DAILY_LIMIT", limit: DAILY_LIMIT, used });
    return;
  }

  // 3. Build the Anthropic message. Photos are fetched + base64-encoded here so
  //    the client never sends large payloads.
  const { model, system, userText, photoUrls } = req.body || {};
  if (!system || !userText) { res.status(400).json({ error: "Missing prompt" }); return; }

  let content;
  if (Array.isArray(photoUrls) && photoUrls.length) {
    // SSRF guard: only fetch images hosted on this project's Supabase storage.
    const sbHost = (() => { try { return new URL(SB_URL).host; } catch { return null; } })();
    const isAllowed = (url) => {
      try {
        const u = new URL(url);
        return u.protocol === "https:" && u.host === sbHost && u.pathname.startsWith("/storage/");
      } catch { return false; }
    };
    const blocks = [];
    for (const url of photoUrls.slice(0, AI_PHOTO_LIMIT)) {
      if (!isAllowed(url)) continue;
      try {
        const ir = await fetch(url);
        if (!ir.ok) continue;
        const mime = ir.headers.get("content-type") || "image/jpeg";
        if (!mime.startsWith("image/")) continue;
        const buf = Buffer.from(await ir.arrayBuffer());
        blocks.push({ type: "image", source: { type: "base64", media_type: mime, data: buf.toString("base64") } });
      } catch { /* skip unreadable image */ }
    }
    blocks.push({ type: "text", text: userText });
    content = blocks;
  } else {
    content = userText;
  }

  // 4. Call Anthropic with the server-side key.
  let aiData;
  try {
    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content }],
      }),
    });
    if (!ar.ok) {
      const e = await ar.json().catch(() => ({}));
      res.status(502).json({ error: e?.error?.message || `Anthropic HTTP ${ar.status}` });
      return;
    }
    aiData = await ar.json();
  } catch { res.status(502).json({ error: "AI request failed" }); return; }

  // 5. Count this successful use (upsert on the (user_id, day) primary key).
  try {
    await fetch(`${SB_URL}/rest/v1/ai_usage`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, day, count: used + 1 }),
    });
  } catch { /* best-effort */ }

  res.status(200).json({ content: aiData.content, remaining: DAILY_LIMIT - (used + 1) });
}
