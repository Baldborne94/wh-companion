import { useLang } from "../lib/i18n.jsx";

// The header "now playing" mini bar: song title (opens the Music section),
// pause/resume toggle, and stop. Extracted from App.jsx so it can be unit-tested
// in isolation. App decides WHEN to mount it (nowPlaying && not in Music && not
// in the reader); this component just renders the controls for a given track.
export default function MiniPlayer({ nowPlaying, musicPaused, mutedColor = "#7a7060", onOpen, onTogglePause, onStop }) {
  const { t } = useLang();
  if (!nowPlaying) return null;
  const accent = nowPlaying.type === "youtube" ? "#FF4444" : "#1DB954";

  return (
    <>
      <button onClick={onOpen} title={nowPlaying.title} aria-label={`Now playing: ${nowPlaying.title}. Open music section`}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: "3px 2px", maxWidth: 72, overflow: "hidden", flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {nowPlaying.title}
        </span>
      </button>
      <button onClick={onTogglePause} title={musicPaused ? t("header.resume") : t("header.pause")} aria-label={musicPaused ? "Resume music" : "Pause music"}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: accent, fontSize: 13, lineHeight: 1, padding: "3px 3px", flexShrink: 0 }}>
        {musicPaused ? "▶" : "⏸"}
      </button>
      <button onClick={onStop} title={t("header.stopMusic")} aria-label="Stop music"
        style={{ background: "transparent", border: "none", cursor: "pointer", color: `${mutedColor}99`, fontSize: 14, lineHeight: 1, padding: "3px 4px", flexShrink: 0 }}>
        ✕
      </button>
    </>
  );
}
