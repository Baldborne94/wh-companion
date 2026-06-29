import { describe, it, expect, vi } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import HomePage from "./HomePage.jsx";
import { BOOKS } from "../data/books.js";

// HomePage + NextUpCard touch Supabase/REST in effects — stub them out.
vi.mock("../lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) },
}));
vi.mock("../lib/sb", () => ({
  sb: { get: () => Promise.resolve([]), upsert: () => Promise.resolve() },
}));

// Rendered as "✦ New to Warhammer 40,000?" — match the phrase, not the exact node.
const NEWCOMER_CTA = /New to Warhammer 40,000\?/;
const idOf = (title) => BOOKS.find((b) => b.title === title)?.id;

describe("HomePage newcomer gating", () => {
  it("shows the 'where to start' CTA for a brand-new user (no progress)", () => {
    renderWithLang(<HomePage statuses={{}} setSection={() => {}} />);
    expect(screen.getByText(NEWCOMER_CTA)).toBeInTheDocument();
  });

  it("calls onStartGuide when the newcomer taps the CTA", () => {
    const onStartGuide = vi.fn();
    renderWithLang(<HomePage statuses={{}} setSection={() => {}} onStartGuide={onStartGuide} />);
    fireEvent.click(screen.getByRole("button", { name: /where to start/i }));
    expect(onStartGuide).toHaveBeenCalledTimes(1);
  });

  it("does NOT show the newcomer CTA once a book is marked read", () => {
    const statuses = { [idOf("Horus Rising")]: { status: "read" } };
    renderWithLang(<HomePage statuses={statuses} setSection={() => {}} />);
    expect(screen.queryByText(NEWCOMER_CTA)).not.toBeInTheDocument();
  });

  it("does NOT show the newcomer CTA when a book is currently being read", () => {
    const statuses = { [idOf("Horus Rising")]: { status: "reading" } };
    renderWithLang(<HomePage statuses={statuses} setSection={() => {}} />);
    expect(screen.queryByText(NEWCOMER_CTA)).not.toBeInTheDocument();
  });
});
