import { describe, it, expect, vi } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import MiniPlayer from "./MiniPlayer.jsx";

const TRACK = { title: "Ambient Grimdark", type: "youtube" };
const noop = () => {};

describe("MiniPlayer", () => {
  it("renders nothing when there is no track", () => {
    const { container } = renderWithLang(
      <MiniPlayer nowPlaying={null} musicPaused={false} onOpen={noop} onTogglePause={noop} onStop={noop} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the track title and the three controls", () => {
    renderWithLang(<MiniPlayer nowPlaying={TRACK} musicPaused={false} onOpen={noop} onTogglePause={noop} onStop={noop} />);
    expect(screen.getByText("Ambient Grimdark")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause music/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop music/i })).toBeInTheDocument();
  });

  it("shows ⏸ when playing and ▶ when paused", () => {
    const { rerender } = renderWithLang(
      <MiniPlayer nowPlaying={TRACK} musicPaused={false} onOpen={noop} onTogglePause={noop} onStop={noop} />
    );
    expect(screen.getByRole("button", { name: /pause music/i })).toHaveTextContent("⏸");
    rerender(<MiniPlayer nowPlaying={TRACK} musicPaused={true} onOpen={noop} onTogglePause={noop} onStop={noop} />);
    expect(screen.getByRole("button", { name: /resume music/i })).toHaveTextContent("▶");
  });

  it("fires onOpen / onTogglePause / onStop from the right buttons", () => {
    const onOpen = vi.fn(), onTogglePause = vi.fn(), onStop = vi.fn();
    renderWithLang(<MiniPlayer nowPlaying={TRACK} musicPaused={false} onOpen={onOpen} onTogglePause={onTogglePause} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: /open music section/i }));
    fireEvent.click(screen.getByRole("button", { name: /pause music/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop music/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onTogglePause).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("tints the title with the Spotify green for a spotify track", () => {
    renderWithLang(<MiniPlayer nowPlaying={{ title: "X", type: "spotify" }} musicPaused={false} onOpen={noop} onTogglePause={noop} onStop={noop} />);
    expect(screen.getByText("X")).toHaveStyle({ color: "#1DB954" });
  });
});
