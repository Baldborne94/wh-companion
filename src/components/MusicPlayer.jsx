import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { C } from "../data/constants";
import { useLang } from "../lib/i18n.jsx";

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
  const { t } = useLang();
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
            setError(t("music.authDenied"));
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
    } catch { setError(t("music.networkError")); }
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
    } catch { setError(t("music.videosLoadError")); }
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
    } catch { setError(t("music.networkError")); }
    finally { setLoading(false); }
  };

  const disconnect = () => {
    clearYtToken();
    setToken(null); setPlaylists([]); setSelectedPl(null);
    setVideos([]); setCurrentVideo(null); setCurrentTitle(null);
    setResults(null); setQuery("");
    onNowPlaying(null);
  };

  if (!clientId) return <Placeholder icon="▶" title={t("music.ytNotConfigured")} sub={t("music.ytNotConfiguredSub")} />;

  if (!token) return (
    <ConnectScreen icon="▶" title="YouTube" sub={t("music.connectSub")}
      btnLabel={t("music.connectYouTube")} btnBg="#FF0000" btnColor="#fff" onClick={connect} error={error} />
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

      <button onClick={disconnect} style={s.disconnectBtn}>{t("music.disconnect")}</button>

      <SearchBar value={query} onChange={setQuery} onSubmit={() => runYtSearch(query)} onClear={() => { setQuery(""); setResults(null); }}
        placeholder={t("music.searchYouTube")} accent="#FF0000" />
      {loading && <Spinner />}
      {error && <div style={{ color: "#e05050", fontSize: 12 }}>{error}</div>}

      {results !== null ? (
        <>
          <BackBtn label={t("music.searchResults")} onClick={() => { setResults(null); setQuery(""); }} />
          {results.length === 0 && !loading && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>{t("music.noResults")}</div>}
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
          <SectionLabel>{t("music.yourPlaylists")}</SectionLabel>
          {playlists.map(pl => (
            <button key={pl.id} onClick={() => { setSelectedPl(pl); fetchVideos(pl.id); }} style={s.row}>
              <Thumb url={pl.snippet?.thumbnails?.medium?.url} w={64} h={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowTitle}>{pl.snippet?.title}</div>
                <div style={s.rowSub}>{pl.contentDetails?.itemCount} {t("music.videosCount")}</div>
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
  const { t } = useLang();
  return <div style={{ textAlign: "center", color: C.muted, padding: 12, fontSize: 13 }}>{t("music.loading")}</div>;
}

function SearchBar({ value, onChange, onSubmit, onClear, placeholder, accent }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} style={{ position: "relative" }}>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search"
        style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "11px 40px 11px 44px", fontSize: 14, outline: "none" }} />
      {/* Tappable magnifier so search can be started without the keyboard's enter key
          (not obvious on tablets). */}
      <button type="submit" aria-label="Search"
        style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: accent || C.muted, fontSize: 16, cursor: "pointer", padding: "6px 8px", lineHeight: 1 }}>🔍</button>
      {value && <button type="button" onClick={onClear} aria-label="Clear" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>}
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
  return <img src={url} width={w} height={h} alt="" style={{ borderRadius: radius, objectFit: "cover", flexShrink: 0 }} />;
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

const MusicPlayer = forwardRef(function MusicPlayer({ onNowPlaying = () => {} }, ref) {
  const { t } = useLang();
  const ytRef = useRef(null);

  useImperativeHandle(ref, () => ({
    stop:   () => { ytRef.current?.stop();   },
    pause:  () => { ytRef.current?.pause();  },
    resume: () => { ytRef.current?.resume(); },
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 4, color: C.goldDim, textTransform: "uppercase", marginBottom: 4 }}>
          Warhammer 40,000
        </div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 22, color: C.text }}>{t("music.heading")}</h2>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <YouTubeSection ref={ytRef} onNowPlaying={onNowPlaying} />
      </div>
    </div>
  );
});

export default MusicPlayer;
