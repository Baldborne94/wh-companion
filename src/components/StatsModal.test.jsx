import { describe, it, expect, vi } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import StatsModal from "./StatsModal.jsx";

// StatsModal loads minis from Supabase in an effect (guarded by user) — stub it.
const chain = { select: () => chain, eq: () => chain, then: (r) => Promise.resolve({ data: [] }).then(r) };
vi.mock("../lib/supabase", () => ({ supabase: { from: () => chain } }));

const open = (props) => renderWithLang(<StatsModal onClose={() => {}} {...props} />);

describe("StatsModal", () => {
  it("renders the modal header", () => {
    open({ unlockedIds: [] });
    expect(screen.getByText("Deeds & Honour")).toBeInTheDocument();
  });

  // The `closest('[class*="ach-unlocked"]')` checks pin the ASSOCIATION between a
  // specific achievement and its locked/unlocked state — not just "some Achieved
  // badge exists somewhere" (which survives a locked/unlocked inversion).
  it("renders an UNLOCKED achievement inside an unlocked card (with Achieved badge)", () => {
    open({ unlockedIds: ["read_1"] });
    const card = screen.getByText("First Tome").closest('[class*="ach-unlocked"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("Achieved");
    expect(card.textContent).not.toContain("🔒");
  });

  it("renders a still-LOCKED achievement as a locked card (🔒 / ???, not unlocked)", () => {
    open({ unlockedIds: ["read_1"] }); // read_100 remains locked
    const lockedLabel = screen.getByText("Omnissiah's Chosen");
    expect(lockedLabel.closest('[class*="ach-unlocked"]')).toBeNull();
    expect(screen.getAllByText("🔒").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("???").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when the ✕ button is tapped", () => {
    const onClose = vi.fn();
    open({ unlockedIds: [], onClose });
    fireEvent.click(screen.getByRole("button", { name: /close stats/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches to the Painting tab and shows painting achievements", () => {
    open({ unlockedIds: [] });
    expect(screen.queryByText("First Blood")).not.toBeInTheDocument(); // reading tab first
    fireEvent.click(screen.getByRole("button", { name: /painting/i }));
    expect(screen.getByText("First Blood")).toBeInTheDocument();
  });
});
