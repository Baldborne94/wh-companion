import { describe, it, expect, vi } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import { AoSHomePage } from "./AoSApp.jsx";

// AoSHomePage touches REST/auth in effects — stub them out.
vi.mock("../lib/sb", () => ({
  sb: { get: () => Promise.resolve([]), upsert: () => Promise.resolve() },
}));
vi.mock("../lib/supabase", () => ({ signInWithGoogle: vi.fn() }));

// Rendered as "✦ New to Age of Sigmar?" — match the phrase, not the exact node.
const NEWCOMER_CTA = /New to Age of Sigmar\?/;

describe("AoSHomePage newcomer gating", () => {
  it("shows the 'where to start' CTA for a brand-new user (no progress)", () => {
    renderWithLang(<AoSHomePage statuses={{}} setSection={() => {}} />);
    expect(screen.getByText(NEWCOMER_CTA)).toBeInTheDocument();
  });

  it("calls onStartGuide when the newcomer taps the CTA", () => {
    const onStartGuide = vi.fn();
    renderWithLang(<AoSHomePage statuses={{}} setSection={() => {}} onStartGuide={onStartGuide} />);
    fireEvent.click(screen.getByRole("button", { name: /where to start/i }));
    expect(onStartGuide).toHaveBeenCalledTimes(1);
  });

  it("does NOT show the newcomer CTA once an AoS book is marked read", () => {
    renderWithLang(<AoSHomePage statuses={{ aos1: { status: "read" } }} setSection={() => {}} />);
    expect(screen.queryByText(NEWCOMER_CTA)).not.toBeInTheDocument();
  });

  it("does NOT show the newcomer CTA when an AoS book is currently being read", () => {
    renderWithLang(<AoSHomePage statuses={{ aos1: { status: "reading" } }} setSection={() => {}} />);
    expect(screen.queryByText(NEWCOMER_CTA)).not.toBeInTheDocument();
  });
});
