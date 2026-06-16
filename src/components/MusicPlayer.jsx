import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { C } from "../data/constants";

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────

function saveYtToken(token) {
  localStorage.setItem("yt_token", JSON.stringify({ token, expiresAt: Date.now() + 3500 * 1000 }));
}
function loadYtToken() {
  try {
    const d = JSON.parse(localStorage.getItem("yt_token") || "null");
    if (d && Date.now() < d.expiresAt) return d.token;
  } catch {}
  return null;
}
function clearYtToken() { localStorage.removeItem("yt_token"); }

// ─── YOUTUBE ─────────────────────────────────────────────────────────────────

const YouTubeSection = forwardRef(function YouTubeSection({ onNowPlaying }, ref) {
  const [token, setToken]               = useState(() => loadYtToken());
  const [playlists, setPlaylists]       = useState([]);
  const [selectedPl, setSelectedPl]     = useState(null);
  const [videos, setVideos]             = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [, setCurrentTitle]             = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [query, setQuery]               = useState("");
  const [results, setResults]           = useState(null);
  const tokenClientRef                  = useRef(null);
  const iframeRef                       = useRef(null);
  const clientId                        = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useImperativeHandle(ref, () => ({
    stop:   () => { setCurrentVideo(null); setCurrentTitle(null); onNowPlaying(null); },
    pause:  () => { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event:"command", func:"pauseVideo", args:"" }), "https://www.youtube.com"); },
    resume: () => { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event:"command", func:"playVideo",  args:"" }), "https://www.youtube.com"); },
  }));

  // Restore playlists if token already saved
  useEffect(() => {
    if (token) fetchPlaylists(token);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const init = () => {
      tokenClientRef.current = window.google?.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        callback: (resp) => {
          if (resp.access_token) {
            saveYtToken(resp.access_token);
            setToken(resp.access_token);
            fetchPlaylists(resp.access_token);
          } else {
            setError("Authorization denied.");
          }
        },
      });
    };
    if (window.google?.accounts) { init(); return; }
    const existing = document.getElementById("gsi-script");
    if (existing) { existing.addEventListener("load", init); return; }
    const s = document.createElement("script");
    s.id  = "gsi-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [clientId]);

  const connect = () => { setError(null); tokenClientRef.current?.requestAccessToken(); };

  const fetchPlaylists = async (tok) => {
    setLoading(true);
    try {
      const r = await fetch(
        "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50",
        { headers: { Authorization: `Bearer ${tok}` } }
      );
      const d = await r.json();
      if (d.error?.code === 401) { disconnect(); return; }
      if (d.error) { setError(d.error.message); return; }
      setPlaylists(d.items || []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  };

  const fetchVideos = async (plId) => {
    setLoading(true);
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${plId}&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = await r.json();
      setVideos((d.items || []).filter(v => v.snippet?.resourceId?.videoId));
    } catch { setError("Error loading videos."); }
    finally { setLoading(false); }
  };

  const playVideo = (vid, title) => {
    setCurrentVideo(vid);
    setCurrentTitle(title);
    onNowPlaying({ type: "youtube", title, videoId: vid });
  };

  // Extract a video or playlist id from a pasted YouTube URL.
  const parseYouTube = (str) => {
    try {
      const u = new URL(str.trim());
      if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null;
      if (u.hostname.endsWith("youtu.be")) return { videoId: u.pathname.slice(1) };
      const list = u.searchParams.get("list");
      const v = u.searchParams.get("v");
      if (v) return { videoId: v };
      if (list) return { playlistId: list };
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" || parts[0] === "shorts") return { videoId: parts[1] };
    } catch {}
    return null;
  };

  const runYtSearch = async (q) => {
    const raw = q.trim();
    if (!raw) { setResults(null); return; }
    const link = parseYouTube(raw);
    if (link?.videoId) { setResults(null); setQuery(""); playVideo(link.videoId, "YouTube"); return; }
    if (link?.playlistId) { setResults(null); setQuery(""); setSelectedPl({ id: link.playlistId, snippet: { title: "Playlist" } }); fetchVideos(link.playlistId); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=${encodeURIComponent(raw)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = await r.json();
      if (d.error?.code === 401) { disconnect(); return; }
      if (d.error) { setError(d.error.message); return; }
      setResults((d.items || []).filter(it => it.id?.videoId));
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  };

  const disconnect = () => {
    clearYtToken();
    setToken(null); setPlaylists([]); setSelectedPl(null);
    setVideos([]); setCurrentVideo(null); setCurrentTitle(null);
    setResults(null); setQuery("");
    onNowPlaying(null);
  };

  if (!clientId) return <Placeholder icon="▶" title="YouTube not configured" sub="Add VITE_GOOGLE_CLIENT_ID to your .env file" />;

  if (!token) return (
    <ConnectScreen icon="▶" title="YouTube" sub="Connect your account to access your playlists"
      btnLabel="Connect YouTube" btnBg="#FF0000" btnColor="#fff" onClick={connect} error={error} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {currentVideo && (
        <div style={{ aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", background: "#000" }}>
          <iframe ref={iframeRef} width="100%" height="100%"
            src={`https://www.youtube.com/embed/${currentVideo}?autoplay=1&enablejsapi=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen style={{ border: "none" }} />
        </div>
      )}

      <button onClick={disconnect} style={s.disconnectBtn}>Disconnect account</button>

      <SearchBar value={query} onChange={setQuery} onSubmit={() => runYtSearch(query)} onClear={() => { setQuery(""); setResults(null); }}
        placeholder="Search a track or paste a YouTube link" accent="#FF0000" />
      {loading && <Spinner />}
      {error && <div style={{ color: "#e05050", fontSize: 12 }}>{error}</div>}

      {results !== null ? (
        <>
          <BackBtn label="Risultati ricerca" onClick={() => { setResults(null); setQuery(""); }} />
          {results.length === 0 && !loading && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>No results.</div>}
          {results.map(it => {
            const vid = it.id.videoId;
            const title = it.snippet?.title;
            const active = currentVideo === vid;
            return (
              <button key={vid} onClick={() => playVideo(vid, title)}
                style={{ ...s.row, borderColor: active ? "#FF0000" : C.border, background: active ? C.surface : C.card }}>
                <Thumb url={it.snippet?.thumbnails?.medium?.url} w={80} h={50} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...s.rowTitle, color: active ? "#FF4444" : C.text }}>{title}</div>
                  <div style={s.rowSub}>{it.snippet?.channelTitle}</div>
                </div>
              </button>
            );
          })}
        </>
      ) : !selectedPl ? (
        <>
          <SectionLabel>Your playlists</SectionLabel>
          {playlists.map(pl => (
            <button key={pl.id} onClick={() => { setSelectedPl(pl); fetchVideos(pl.id); }} style={s.row}>
              <Thumb url={pl.snippet?.thumbnails?.medium?.url} w={64} h={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{pl.snippet?.title}</div>
                <div style={s.rowSub}>{pl.contentDetails?.itemCount} videos</div>
              </div>
              <span style={{ color: C.muted, fontSize: 16 }}>›</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <BackBtn label={selectedPl.snippet?.title} onClick={() => { setSelectedPl(null); setVideos([]); setCurrentVideo(null); onNowPlaying(null); }} />
          {videos.map(v => {
            const vid   = v.snippet.resourceId.videoId;
            const title = v.snippet?.title;
            const active = currentVideo === vid;
            return (
              <button key={v.id} onClick={() => playVideo(vid, title)}
                style={{ ...s.row, borderColor: active ? "#FF0000" : C.border, background: active ? C.surface : C.card }}>
                <Thumb url={v.snippet?.thumbnails?.medium?.url} w={80} h={50} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...s.rowTitle, color: active ? "#FF4444" : C.text }}>{title}</div>
                </div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
});

// ─── SPOTIFY ─────────────────────────────────────────────────────────────────

const SP_SCOPES = "playlist-read-private playlist-read-collaborative user-read-private";

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest   = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(digest) };
}

const SpotifySection = forwardRef(function SpotifySection({ onNowPlaying }, ref) {
  const [token, setToken]           = useState(() => localStorage.getItem("sp_token") || null);
  const [playlists, setPlaylists]   = useState([]);
  const [selectedPl, setSelectedPl] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState(null);
  const iframeRef                   = useRef(null);
  const clientId                    = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri                 = window.location.origin;

  useImperativeHandle(ref, () => ({
    stop:   () => { setSelectedPl(null); onNowPlaying(null); },
    pause:  () => { iframeRef.current?.contentWindow?.postMessage({ command: "pause"  }, "https://open.spotify.com"); },
    resume: () => { iframeRef.current?.contentWindow?.postMessage({ command: "resume" }, "https://open.spotify.com"); },
  }));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");
    const state  = params.get("state");
    if (code && state === "spotify_auth") {
      window.history.replaceState({}, "", window.location.pathname);
      exchangeCode(code);
    } else if (token) {
      fetchPlaylists(token);
    }
  }, []);

  const connect = async () => {
    if (!clientId) return;
    setError(null);
    const { verifier, challenge } = await pkce();
    localStorage.setItem("sp_verifier", verifier);
    const p = new URLSearchParams({
      client_id: clientId, response_type: "code", redirect_uri: redirectUri,
      code_challenge_method: "S256", code_challenge: challenge, scope: SP_SCOPES, state: "spotify_auth",
    });
    window.location.href = `https://accounts.spotify.com/authorize?${p}`;
  };

  const exchangeCode = async (code) => {
    const verifier = localStorage.getItem("sp_verifier") || "";
    try {
      const r = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId, grant_type: "authorization_code",
          code, redirect_uri: redirectUri, code_verifier: verifier,
        }),
      });
      const d = await r.json();
      if (d.access_token) {
        localStorage.setItem("sp_token", d.access_token);
        if (d.refresh_token) localStorage.setItem("sp_refresh", d.refresh_token);
        setToken(d.access_token);
        fetchPlaylists(d.access_token);
      } else {
        setError("Authorization failed. Try again.");
      }
    } catch { setError("Network error."); }
  };

  const fetchPlaylists = async (tok) => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, plRes] = await Promise.all([
        fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${tok}` } }),
        fetch("https://api.spotify.com/v1/me/playlists?limit=50", { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      if (meRes.status === 401 || plRes.status === 401) { disconnect(); return; }
      await meRes.json();
      const d  = await plRes.json();
      if (d.error) { setError(`Spotify: ${d.error.message} (${d.error.status})`); return; }
      setPlaylists((d.items || []).filter(Boolean));
    } catch (e) { setError(`Network error: ${e.message}`); }
    finally { setLoading(false); }
  };

  const selectPlaylist = (pl) => {
    selectItem("playlist", pl.id, pl.name, pl.images?.[0]?.url);
  };

  // Embed any Spotify resource (playlist / album / track) inside the app.
  const selectItem = (type, id, name, image) => {
    setSelectedPl({ type, id, name, images: image ? [{ url: image }] : [] });
    onNowPlaying({ type: "spotify", title: name, subtitle: "Spotify", albumArt: image });
  };

  // Parse a pasted Spotify URL or URI into { type, id }.
  const parseSpotify = (str) => {
    const raw = str.trim();
    let m = raw.match(/spotify:(playlist|album|track|artist):([A-Za-z0-9]+)/);
    if (m) return { type: m[1], id: m[2] };
    try {
      const u = new URL(raw);
      if (!u.hostname.endsWith("spotify.com")) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex(p => ["playlist", "album", "track", "artist"].includes(p));
      if (i >= 0 && parts[i + 1]) return { type: parts[i], id: parts[i + 1].split("?")[0] };
    } catch {}
    return null;
  };

  const runSpSearch = async (q) => {
    const raw = q.trim();
    if (!raw) { setResults(null); return; }
    const link = parseSpotify(raw);
    if (link && link.type !== "artist") { setResults(null); setQuery(""); selectItem(link.type, link.id, "Spotify", null); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `https://api.spotify.com/v1/search?type=track,playlist&limit=20&q=${encodeURIComponent(raw)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.status === 401) { disconnect(); return; }
      const d = await r.json();
      if (d.error) { setError(`Spotify: ${d.error.message}`); return; }
      setResults({
        tracks: (d.tracks?.items || []).filter(Boolean),
        playlists: (d.playlists?.items || []).filter(Boolean),
      });
    } catch (e) { setError(`Network error: ${e.message}`); }
    finally { setLoading(false); }
  };

  const disconnect = () => {
    localStorage.removeItem("sp_token");
    localStorage.removeItem("sp_refresh");
    localStorage.removeItem("sp_verifier");
    setToken(null); setPlaylists([]); setSelectedPl(null);
    setResults(null); setQuery("");
    onNowPlaying(null);
  };

  if (!clientId) return <Placeholder icon="♪" title="Spotify not configured" sub="Add VITE_SPOTIFY_CLIENT_ID to your .env file" />;

  if (!token) return (
    <ConnectScreen icon="♪" title="Spotify" sub="Connect your account to access your playlists"
      btnLabel="Connect Spotify" btnBg="#1DB954" btnColor="#000" onClick={connect} error={error} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <button onClick={disconnect} style={s.disconnectBtn}>Disconnect account</button>

      <SearchBar value={query} onChange={setQuery} onSubmit={() => runSpSearch(query)} onClear={() => { setQuery(""); setResults(null); }}
        placeholder="Search tracks/playlists or paste a Spotify link" accent="#1DB954" />
      {loading && <Spinner />}
      {error && <div style={{ color: "#e05050", fontSize: 12 }}>{error}</div>}

      {selectedPl ? (
        <>
          <BackBtn label={selectedPl.name} onClick={() => { setSelectedPl(null); onNowPlaying(null); }} />
          <iframe
            ref={iframeRef}
            title={selectedPl.name}
            src={`https://open.spotify.com/embed/${selectedPl.type || "playlist"}/${selectedPl.id}?utm_source=generator&theme=0`}
            width="100%"
            height={selectedPl.type === "track" ? 152 : 480}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ borderRadius: 12, border: "none", marginTop: 8 }}
          />
        </>
      ) : results !== null ? (
        <>
          <BackBtn label="Risultati ricerca" onClick={() => { setResults(null); setQuery(""); }} />
          {results.tracks.length === 0 && results.playlists.length === 0 && !loading && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>No results.</div>}
          {results.tracks.length > 0 && <SectionLabel>Brani</SectionLabel>}
          {results.tracks.map(t => (
            <button key={t.id} onClick={() => selectItem("track", t.id, t.name, t.album?.images?.[0]?.url)} style={s.row}>
              <Thumb url={t.album?.images?.[0]?.url} w={48} h={48} radius={4} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{t.name}</div>
                <div style={s.rowSub}>{(t.artists || []).map(a => a.name).join(", ")}</div>
              </div>
              <span style={{ color: C.muted, fontSize: 16 }}>›</span>
            </button>
          ))}
          {results.playlists.length > 0 && <SectionLabel>Playlist</SectionLabel>}
          {results.playlists.map(pl => (
            <button key={pl.id} onClick={() => selectItem("playlist", pl.id, pl.name, pl.images?.[0]?.url)} style={s.row}>
              <Thumb url={pl.images?.[0]?.url} w={48} h={48} radius={4} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{pl.name}</div>
                <div style={s.rowSub}>{pl.owner?.display_name || "Spotify"}</div>
              </div>
              <span style={{ color: C.muted, fontSize: 16 }}>›</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <SectionLabel>Your playlists &amp; the ones you follow</SectionLabel>
          {playlists.map(pl => (
            <button key={pl.id} onClick={() => selectPlaylist(pl)} style={s.row}>
              <Thumb url={pl.images?.[0]?.url} w={48} h={48} radius={4} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{pl.name}</div>
                {pl.tracks?.total != null && <div style={s.rowSub}>{pl.tracks.total} tracks</div>}
              </div>
              <span style={{ color: C.muted, fontSize: 16 }}>›</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
});

// ─── SHARED UI ────────────────────────────────────────────────────────────────

function ConnectScreen({ icon, title, sub, btnLabel, btnBg, btnColor, onClick, error }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 56, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 20, color: C.text }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>{sub}</div>
      {error && <div style={{ color: "#e05050", fontSize: 12 }}>{error}</div>}
      <button onClick={onClick}
        style={{ background: btnBg, color: btnColor, border: "none", borderRadius: 10, padding: "13px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>
        {btnLabel}
      </button>
    </div>
  );
}

function Placeholder({ icon, title, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 48 }}>{icon}</div>
      <div style={{ color: C.text, fontSize: 16 }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 13 }}>{sub}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ textAlign: "center", color: C.muted, padding: 12, fontSize: 13 }}>Loading…</div>;
}

function SearchBar({ value, onChange, onSubmit, onClear, placeholder, accent }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} style={{ position: "relative" }}>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search"
        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "11px 40px 11px 38px", fontSize: 14, outline: "none" }} />
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: accent || C.muted, fontSize: 16, pointerEvents: "none" }}>🔍</span>
      {value && <button type="button" onClick={onClear} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>}
    </form>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: C.goldDim, letterSpacing: 3, textTransform: "uppercase", paddingTop: 4 }}>{children}</div>;
}

function BackBtn({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", textAlign: "left", padding: "4px 0", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 16 }}>‹</span> {label}
    </button>
  );
}

function Thumb({ url, w, h, radius = 6 }) {
  if (!url) return <div style={{ width: w, height: h, borderRadius: radius, background: C.dim, flexShrink: 0 }} />;
  return <img src={url} width={w} height={h} style={{ borderRadius: radius, objectFit: "cover", flexShrink: 0 }} />;
}

const s = {
  row: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
    padding: "10px 12px", display: "flex", alignItems: "center",
    gap: 12, cursor: "pointer", textAlign: "left", width: "100%",
  },
  rowTitle: { color: C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 },
  rowSub:   { color: C.muted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  disconnectBtn: {
    background: "none", border: `1px solid ${C.dim}`, borderRadius: 6,
    color: C.muted, padding: "4px 10px", fontSize: 11, cursor: "pointer",
    alignSelf: "flex-end", fontFamily: "'Cinzel',serif", letterSpacing: 1,
  },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const TABS = [
  { id: "youtube", label: "YouTube", icon: "▶", activeColor: "#FF0000" },
  { id: "spotify", label: "Spotify",  icon: "♪", activeColor: "#1DB954" },
];

const MusicPlayer = forwardRef(function MusicPlayer({ onNowPlaying = () => {} }, ref) {
  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("state") === "spotify_auth" ? "spotify" : "youtube";
  });
  const ytRef = useRef(null);
  const spRef = useRef(null);

  useImperativeHandle(ref, () => ({
    stop:   () => { ytRef.current?.stop();   spRef.current?.stop();   },
    pause:  () => { ytRef.current?.pause();  spRef.current?.pause();  },
    resume: () => { ytRef.current?.resume(); spRef.current?.resume(); },
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "18px 16px 0", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 4, color: C.goldDim, textTransform: "uppercase", marginBottom: 4 }}>
          Warhammer 40,000
        </div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color: C.text, marginBottom: 14 }}>Music</h2>
        <div style={{ display: "flex" }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, background: "none", border: "none",
                borderBottom: `2px solid ${active ? t.activeColor : "transparent"}`,
                color: active ? t.activeColor : C.muted,
                padding: "10px 0", fontSize: 13, fontWeight: active ? 700 : 400,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6, marginBottom: -1, transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ fontFamily: "'Cinzel',serif", letterSpacing: 1, fontSize: 11 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "youtube" && <YouTubeSection ref={ytRef} onNowPlaying={onNowPlaying} />}
        {tab === "spotify" && <SpotifySection ref={spRef} onNowPlaying={onNowPlaying} />}
      </div>
    </div>
  );
});

export default MusicPlayer;
