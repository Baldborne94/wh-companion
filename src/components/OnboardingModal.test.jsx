import { describe, it, expect, vi } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import OnboardingModal from "./OnboardingModal.jsx";

// All 8 slides live in the DOM at once (a translateX strip), so slide *body*
// text is never a reliable "current slide" signal — only the active dot
// (aria-current="true") and the footer buttons are. Assert on those.
const activeSlide = () => {
  const dot = document.querySelector('[aria-current="true"]');
  return dot ? Number(dot.getAttribute("aria-label").replace(/\D/g, "")) : null;
};
const next = () => fireEvent.click(screen.getByText("Next →"));
const goToLast = () => {
  for (let i = 0; i < 10 && !screen.queryByText("Begin ⚔"); i++) next();
};

describe("OnboardingModal", () => {
  it("opens on slide 1 with Skip + Next (not the final Begin)", () => {
    renderWithLang(<OnboardingModal onClose={() => {}} />);
    expect(activeSlide()).toBe(1);
    expect(screen.getByText("Skip")).toBeInTheDocument();
    expect(screen.getByText("Next →")).toBeInTheDocument();
    expect(screen.queryByText("Begin ⚔")).toBeNull();
    expect(screen.queryByText("← Back")).toBeNull(); // no Back on the first slide
  });

  it("Next advances the active slide and swaps Skip → Back", () => {
    renderWithLang(<OnboardingModal onClose={() => {}} />);
    next();
    expect(activeSlide()).toBe(2);
    expect(screen.getByText("← Back")).toBeInTheDocument();
    expect(screen.queryByText("Skip")).toBeNull();
  });

  it("Back steps the active slide back", () => {
    renderWithLang(<OnboardingModal onClose={() => {}} />);
    next();
    expect(activeSlide()).toBe(2);
    fireEvent.click(screen.getByText("← Back"));
    expect(activeSlide()).toBe(1);
    expect(screen.queryByText("← Back")).toBeNull();
  });

  it("Skip closes immediately without finishing", () => {
    const onClose = vi.fn();
    renderWithLang(<OnboardingModal onClose={onClose} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reaching the last slide shows Begin but does NOT close; Begin closes it", () => {
    const onClose = vi.fn();
    renderWithLang(<OnboardingModal onClose={onClose} />);
    goToLast();
    expect(activeSlide()).toBe(8);
    expect(screen.getByText("Begin ⚔")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Begin ⚔"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a progress dot jumps straight to that slide", () => {
    renderWithLang(<OnboardingModal onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Go to slide 4"));
    expect(activeSlide()).toBe(4);
  });

  it("Escape closes the tutorial", () => {
    const onClose = vi.fn();
    renderWithLang(<OnboardingModal onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
