import { describe, it, expect, vi } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import UniverseSelector from "./UniverseSelector.jsx";

describe("UniverseSelector", () => {
  it("renders both universes", () => {
    renderWithLang(<UniverseSelector onSelect={() => {}} />);
    expect(screen.getByText("40,000")).toBeInTheDocument();
    expect(screen.getByText("AGE OF SIGMAR")).toBeInTheDocument();
    expect(screen.getByAltText("Imperial Aquila")).toBeInTheDocument();
    expect(screen.getByAltText("Sigmar")).toBeInTheDocument();
  });

  it("selects 40k when its panel is clicked", () => {
    const onSelect = vi.fn();
    renderWithLang(<UniverseSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText("40,000")); // bubbles to the panel onClick
    expect(onSelect).toHaveBeenCalledWith("40k");
  });

  it("selects aos when its panel is clicked", () => {
    const onSelect = vi.fn();
    renderWithLang(<UniverseSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText("AGE OF SIGMAR"));
    expect(onSelect).toHaveBeenCalledWith("aos");
  });

  it("the ENTER buttons select their own universe", () => {
    const onSelect = vi.fn();
    renderWithLang(<UniverseSelector onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2); // one per universe
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenNthCalledWith(1, "40k");
    expect(onSelect).toHaveBeenNthCalledWith(2, "aos");
  });
});
