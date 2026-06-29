import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import AchievementPopup from "./AchievementPopup.jsx";
import { achievementFromId } from "../lib/achievements.js";

const ACH = achievementFromId("read_1"); // First Tome, icon 📖

afterEach(() => vi.useRealTimers());

describe("AchievementPopup", () => {
  it("shows the achievement's localized label and icon", () => {
    renderWithLang(<AchievementPopup achievement={ACH} onDismiss={() => {}} />);
    expect(screen.getByText("First Tome")).toBeInTheDocument();
    expect(screen.getByText("📖")).toBeInTheDocument();
  });

  it("renders an opener and the tap hint", () => {
    renderWithLang(<AchievementPopup achievement={ACH} onDismiss={() => {}} />);
    // opener is wrapped as "✦ … ✦"
    expect(screen.getByText(/✦.*✦/)).toBeInTheDocument();
    expect(screen.getByText("tap")).toBeInTheDocument();
  });

  it("calls onDismiss after the user taps it", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderWithLang(<AchievementPopup achievement={ACH} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("First Tome"));
    expect(onDismiss).not.toHaveBeenCalled(); // exit animation first
    vi.advanceTimersByTime(450);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses after ~5 seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderWithLang(<AchievementPopup achievement={ACH} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(5000);
    expect(onDismiss).not.toHaveBeenCalled(); // still animating out
    vi.advanceTimersByTime(450);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders a dynamic army achievement label from its template", () => {
    const army = achievementFromId("army:Orks:5");
    renderWithLang(<AchievementPopup achievement={army} onDismiss={() => {}} type="painting" />);
    // label "Orks — Combat Ready"; flavor also mentions Orks → ≥1 match
    expect(screen.getAllByText(/Orks/).length).toBeGreaterThanOrEqual(1);
  });
});
