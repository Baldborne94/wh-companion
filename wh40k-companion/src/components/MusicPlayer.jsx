import { useState, useEffect, useRef } from "react";
import { C } from "../data/constants";

// ─── YOUTUBE ─────────────────────────────────────────────────────────────────

function YouTubeSection() {
  const [token, setToken]               = useState(null);
  const [playlists, setPlaylists]       = useState([]);
  const [selectedPl, setSelectedPl]     = useState(null);
  const [videos, setVideos]             = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const tokenClientRef                  = useRef(null);
  const clientId                        = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    const init = () => {
      tokenClientRef.current = window.google?.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        callback: (resp) => {
          if (resp.access_token) {
            setToken(resp.access_token);
            fetchPlaylists(resp.access_token);
          } else {
            setError("Autorizzazione negata.");
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

  const connect = () => {
    setError(null);
    tokenClientRef.current?.requestAccessToken();
  };

  const fetchPlaylists = async (tok) => {
    setLoading(true);
    try {
      const r = await fetch(
        "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50",
        { headers: { Authorization: `Bearer ${tok}` } }
      );
      const d = await r.json();
      if (d.error) { setError(d.error.message); setLoading(false); return; }
      setPlaylists(d.items || []);
    } catch { setError("Errore di rete."); }
    setLoading(false);
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
    } catch { setError("Errore caricamento video."); }
    setLoading(false);
  };

  const disconnect = () => { setToken(null); setPlaylists([]); setSelectedPl(null); setVideos([]); setCurrentVideo(null); };

  if (!clientId) return (
    <Placeholder icon="▶" title="YouTube non configurato" sub="Aggiungi VITE_GOOGLE_CLIENT_ID al file .env" />
  );

  if (!token) return (
    <ConnectScreen
      icon="▶"
      title="YouTube"
      sub="Connetti il tuo account per accedere alle tue playlist"
      btnLabel="Connetti YouTube"
      btnBg="#FF0000"
      btnColor="#fff"
      onClick={connect}
      error={error}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Player */}
      {currentVideo && (
        <div style={{ aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", background: "#000" }}>
          <iframe
            width="100%" height="100%"
            src={`https://www.youtube.com/embed/${currentVideo}?autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ border: "none" }}
          />
        </div>
      )}

      {/* Disconnect */}
      <button onClick={disconnect} style={s.disconnectBtn}>Disconnetti account</button>

      {loading && <Spinner />}

      {!selectedPl ? (
        <>
          <SectionLabel>Le tue playlist</SectionLabel>
          {playlists.map(pl => (
            <button key={pl.id} onClick={() => { setSelectedPl(pl); fetchVideos(pl.id); }} style={s.row}>
              <Thumb url={pl.snippet?.thumbnails?.medium?.url} w={64} h={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{pl.snippet?.title}</div>
                <div style={s.rowSub}>{pl.contentDetails?.itemCount} video</div>
              </div>
              <span style={{ color: C.muted, fontSize: 16 }}>›</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <BackBtn label={selectedPl.snippet?.title} onClick={() => { setSelectedPl(null); setVideos([]); setCurrentVideo(null); }} />
          {videos.map(v => {
            const vid = v.snippet.resourceId.videoId;
            const active = currentVideo === vid;
            return (
              <button key={v.id} onClick={() => setCurrentVideo(vid)} style={{ ...s.row, borderColor: active ? "#FF0000" : C.border, background: active ? C.surface : C.card }}>
                <Thumb url={v.snippet?.thumbnails?.medium?.url} w={80} h={50} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...s.rowTitle, color: active ? "#FF4444" : C.text }}>{v.snippet?.title}</div>
                </div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

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

function SpotifySection() {
  const [token, setToken]               = useState(() => localStorage.getItem("sp_token") || null);
  const [playlists, setPlaylists]       = useState([]);
  const [selectedPl, setSelectedPl]     = useState(null);
  const [tracks, setTracks]             = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const clientId                        = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const redirectUri                     = window.location.origin;

  // Handle OAuth callback
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
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      scope: SP_SCOPES,
      state: "spotify_auth",
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
          client_id: clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
      });
      const d = await r.json();
      if (d.access_token) {
        localStorage.setItem("sp_token", d.access_token);
        if (d.refresh_token) localStorage.setItem("sp_refresh", d.refresh_token);
        setToken(d.access_token);
        fetchPlaylists(d.access_token);
      } else {
        setError("Autorizzazione fallita. Riprova.");
      }
    } catch { setError("Errore di rete."); }
  };

  const fetchPlaylists = async (tok) => {
    setLoading(true);
    try {
      const r = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (r.status === 401) { disconnect(); setLoading(false); return; }
      const d = await r.json();
      setPlaylists(d.items || []);
    } catch { setError("Errore caricamento playlist."); }
    setLoading(false);
  };

  const fetchTracks = async (plId) => {
    setLoading(true);
    try {
      const r = await fetch(`https://api.spotify.com/v1/playlists/${plId}/tracks?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setTracks((d.items || []).filter(i => i.track?.id));
    } catch { setError("Errore caricamento brani."); }
    setLoading(false);
  };

  const disconnect = () => {
    localStorage.removeItem("sp_token");
    localStorage.removeItem("sp_refresh");
    localStorage.removeItem("sp_verifier");
    setToken(null); setPlaylists([]); setSelectedPl(null);
    setTracks([]); setCurrentTrack(null);
  };

  const fmtDuration = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    return `${m}:${s}`;
  };

  if (!clientId) return (
    <Placeholder icon="♪" title="Spotify non configurato" sub="Aggiungi VITE_SPOTIFY_CLIENT_ID al file .env" />
  );

  if (!token) return (
    <ConnectScreen
      icon="♪"
      title="Spotify"
      sub="Connetti il tuo account per accedere alle tue playlist"
      btnLabel="Connetti Spotify"
      btnBg="#1DB954"
      btnColor="#000"
      onClick={connect}
      error={error}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Now playing bar */}
      {currentTrack && (
        <div style={{ background: C.card, border: `1px solid #1DB95444`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <Thumb url={currentTrack.album?.images?.[2]?.url} w={44} h={44} radius={4} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...s.rowTitle, color: "#1DB954" }}>{currentTrack.name}</div>
            <div style={s.rowSub}>{currentTrack.artists?.map(a => a.name).join(", ")}</div>
          </div>
          <a href={currentTrack.external_urls?.spotify} target="_blank" rel="noopener noreferrer"
            style={{ flexShrink: 0, background: "#1DB954", color: "#000", borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
            APRI ↗
          </a>
        </div>
      )}

      <button onClick={disconnect} style={s.disconnectBtn}>Disconnetti account</button>

      {loading && <Spinner />}

      {!selectedPl ? (
        <>
          <SectionLabel>Le tue playlist</SectionLabel>
          {playlists.map(pl => (
            <button key={pl.id} onClick={() => { setSelectedPl(pl); fetchTracks(pl.id); }} style={s.row}>
              <Thumb url={pl.images?.[0]?.url} w={48} h={48} radius={4} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{pl.name}</div>
                <div style={s.rowSub}>{pl.tracks?.total} brani</div>
              </div>
              <span style={{ color: C.muted, fontSize: 16 }}>›</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <BackBtn label={selectedPl.name} onClick={() => { setSelectedPl(null); setTracks([]); }} />
          {tracks.map(({ track }) => {
            const active = currentTrack?.id === track.id;
            return (
              <button key={track.id} onClick={() => setCurrentTrack(track)}
                style={{ ...s.row, borderColor: active ? "#1DB954" : C.border, background: active ? C.surface : C.card }}>
                <Thumb url={track.album?.images?.[2]?.url} w={44} h={44} radius={4} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...s.rowTitle, color: active ? "#1DB954" : C.text }}>{track.name}</div>
                  <div style={s.rowSub}>{track.artists?.map(a => a.name).join(", ")}</div>
                </div>
                <span style={{ ...s.rowSub, flexShrink: 0 }}>{fmtDuration(track.duration_ms)}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

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
  return <div style={{ textAlign: "center", color: C.muted, padding: 12, fontSize: 13 }}>Caricamento...</div>;
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

// shared styles
const s = {
  row: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  rowTitle: {
    color: C.text,
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginBottom: 2,
  },
  rowSub: {
    color: C.muted,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  disconnectBtn: {
    background: "none",
    border: `1px solid ${C.dim}`,
    borderRadius: 6,
    color: C.muted,
    padding: "4px 10px",
    fontSize: 11,
    cursor: "pointer",
    alignSelf: "flex-end",
    fontFamily: "'Cinzel',serif",
    letterSpacing: 1,
  },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const TABS = [
  { id: "youtube", label: "YouTube", icon: "▶", activeColor: "#FF0000" },
  { id: "spotify", label: "Spotify",  icon: "♪", activeColor: "#1DB954" },
];

export default function MusicPlayer() {
  const [tab, setTab] = useState("youtube");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "18px 16px 0", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 4, color: C.goldDim, textTransform: "uppercase", marginBottom: 4 }}>
          Warhammer 40,000
        </div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color: C.text, marginBottom: 14 }}>
          Music
        </h2>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${active ? t.activeColor : "transparent"}`,
                  color: active ? t.activeColor : C.muted,
                  padding: "10px 0",
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginBottom: -1,
                  transition: "all 0.15s",
                }}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ fontFamily: "'Cinzel',serif", letterSpacing: 1, fontSize: 11 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "youtube" && <YouTubeSection />}
        {tab === "spotify" && <SpotifySection />}
      </div>
    </div>
  );
}
