import { useState, useRef, useCallback } from "react";

export function useMusicPlayer() {
  const musicRef = useRef(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [musicPaused, setMusicPaused] = useState(false);

  const toggleMusicPause = useCallback(() => {
    if (musicPaused) { musicRef.current?.resume(); setMusicPaused(false); }
    else { musicRef.current?.pause(); setMusicPaused(true); }
  }, [musicPaused]);

  return { musicRef, nowPlaying, setNowPlaying, musicPaused, setMusicPaused, toggleMusicPause };
}
