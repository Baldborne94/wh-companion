import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithLang, screen, fireEvent, waitFor } from "../test/utils.jsx";
import { userEvent } from "../test/utils.jsx";
import BackupModal from "./BackupModal.jsx";

beforeEach(() => {
  localStorage.clear();
  // jsdom lacks object-URL APIs the export path uses — stub them.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

const fileOf = (text) => new File([text], "backup.json", { type: "application/json" });
const validBackup = JSON.stringify({ app: "wh-companion", version: 1, data: { wh40k_status_user_1: "read" } });

describe("BackupModal", () => {
  it("renders the modal with export and import actions", () => {
    renderWithLang(<BackupModal onClose={() => {}} />);
    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
    expect(screen.getByText(/Export backup/)).toBeInTheDocument();
    expect(screen.getByText(/Import backup/)).toBeInTheDocument();
  });

  it("calls onClose when the ✕ is tapped", () => {
    const onClose = vi.fn();
    renderWithLang(<BackupModal onClose={onClose} />);
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exports only wh40k_ keys, excluding the cover cache, and reports the count", () => {
    localStorage.setItem("wh40k_status_user_1", "read");
    localStorage.setItem("wh40k_notes_user_1", "hello");
    localStorage.setItem("wh40k_cover_42", "huge-base64"); // must be excluded
    localStorage.setItem("unrelated_key", "x");            // must be excluded
    renderWithLang(<BackupModal onClose={() => {}} />);
    fireEvent.click(screen.getByText(/Export backup/));
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    // 2 wh40k_ keys, cover + unrelated excluded
    expect(screen.getByText("Backup exported — 2 items.")).toBeInTheDocument();
  });

  it("rejects a file that is not a WH40K Companion backup", async () => {
    const { container } = renderWithLang(<BackupModal onClose={() => {}} />);
    const input = container.querySelector('input[type="file"]');
    await userEvent.upload(input, fileOf('{"app":"something-else"}'));
    expect(await screen.findByText(/Invalid file/)).toBeInTheDocument();
  });

  it("accepts a valid backup and shows the confirm step (does not write yet)", async () => {
    const { container } = renderWithLang(<BackupModal onClose={() => {}} />);
    const input = container.querySelector('input[type="file"]');
    await userEvent.upload(input, fileOf(validBackup));
    expect(await screen.findByText("Confirm import")).toBeInTheDocument();
    // nothing written until the user confirms
    expect(localStorage.getItem("wh40k_status_user_1")).toBeNull();
  });
});
