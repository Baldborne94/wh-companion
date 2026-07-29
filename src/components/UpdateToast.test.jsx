import { describe, it, expect, vi } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import UpdateToast from "./UpdateToast.jsx";
import { C } from "../data/constants";

const noop = () => {};
const render = (props = {}) =>
  renderWithLang(<UpdateToast palette={C} onApply={noop} onDismiss={noop} {...props} />);

describe("UpdateToast", () => {
  it("announces the new version without stealing focus", () => {
    render();
    const bar = screen.getByRole("status");
    expect(bar).toHaveTextContent(/new version is ready/i);
  });

  it("offers both taking the update and putting it off", () => {
    render();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss update notice/i })).toBeInTheDocument();
  });

  it("applies the update when the user accepts", () => {
    const onApply = vi.fn();
    render({ onApply });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("dismisses without applying anything", () => {
    const onApply = vi.fn(), onDismiss = vi.fn();
    render({ onApply, onDismiss });
    fireEvent.click(screen.getByRole("button", { name: /dismiss update notice/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("sits above the bottom nav so it never covers it", () => {
    render();
    expect(screen.getByRole("status")).toHaveStyle({ position: "fixed" });
  });
});
