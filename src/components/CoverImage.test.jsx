import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CoverImage, { COVER_CACHE_PREFIX, fetchBookCover } from "./CoverImage.jsx";

// Control which books have a self-hosted cover.
vi.mock("../data/covers", () => ({ COVERS: { 999: "/covers/999.jpg" } }));

const BOOK      = { id: 1, title: "Horus Rising", author: "Dan Abnett" };
const CACHE_KEY = COVER_CACHE_PREFIX + BOOK.id;

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => localStorage.clear());

// ── Skeleton (url = null) ─────────────────────────────────────────────────────
describe("CoverImage — loading skeleton", () => {
  it("shows the book title when no URL is cached or available", () => {
    render(<CoverImage book={BOOK} />);
    expect(screen.getByText("Horus Rising")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("registers an IntersectionObserver to lazy-load the cover", () => {
    const observe = vi.fn();
    const origIO = globalThis.IntersectionObserver;
    // Use a real class — arrow-function-based vi.fn can't be called with `new`.
    globalThis.IntersectionObserver = class {
      constructor() {}
      observe = observe;
      disconnect = vi.fn();
    };
    render(<CoverImage book={BOOK} />);
    expect(observe).toHaveBeenCalled();
    globalThis.IntersectionObserver = origIO;
  });
});

// ── Not-found skeleton (url = "") ─────────────────────────────────────────────
describe("CoverImage — not-found state", () => {
  it("shows the book title when localStorage has empty string (confirmed no cover)", () => {
    localStorage.setItem(CACHE_KEY, "");
    render(<CoverImage book={BOOK} />);
    expect(screen.getByText("Horus Rising")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

// ── Image render ──────────────────────────────────────────────────────────────
describe("CoverImage — image display", () => {
  it("renders an img when a URL is cached in localStorage", () => {
    localStorage.setItem(CACHE_KEY, "https://example.com/cover.jpg");
    render(<CoverImage book={BOOK} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/cover.jpg");
    expect(img).toHaveAttribute("alt", "Horus Rising");
  });

  it("shows the title overlay while the image is still loading", () => {
    localStorage.setItem(CACHE_KEY, "https://example.com/cover.jpg");
    render(<CoverImage book={BOOK} />);
    // Before onLoad fires the title skeleton is in the DOM (opacity:0 img + visible text)
    expect(screen.getByText("Horus Rising")).toBeInTheDocument();
  });

  it("hides the title overlay after the image loads", () => {
    localStorage.setItem(CACHE_KEY, "https://example.com/cover.jpg");
    render(<CoverImage book={BOOK} />);
    fireEvent.load(screen.getByRole("img"));
    // After load the skeleton text span is no longer rendered
    expect(screen.queryByText("Horus Rising")).toBeNull();
  });
});

// ── Self-hosted cover (COVERS map) ────────────────────────────────────────────
describe("CoverImage — self-hosted cover", () => {
  it("renders the local cover path immediately without waiting for IO", () => {
    const localBook = { id: 999, title: "Local Book", author: "Author" };
    render(<CoverImage book={localBook} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/covers/999.jpg");
  });

  it("does not register an IntersectionObserver when a local cover is available", () => {
    const observe = vi.fn();
    globalThis.IntersectionObserver = vi.fn(() => ({ observe, disconnect: vi.fn() }));
    const localBook = { id: 999, title: "Local Book", author: "Author" };
    render(<CoverImage book={localBook} />);
    expect(observe).not.toHaveBeenCalled();
  });
});

// ── Error handling ────────────────────────────────────────────────────────────
describe("CoverImage — error fallback", () => {
  it("falls back to empty-state skeleton when a remote img errors", () => {
    localStorage.setItem(CACHE_KEY, "https://example.com/cover.jpg");
    render(<CoverImage book={BOOK} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Horus Rising")).toBeInTheDocument();
  });

  it("drops from self-hosted cover to cached URL on img error", () => {
    const localBook = { id: 999, title: "Local Book", author: "Author" };
    const remoteCacheKey = COVER_CACHE_PREFIX + localBook.id;
    localStorage.setItem(remoteCacheKey, "https://example.com/fallback.jpg");

    render(<CoverImage book={localBook} />);
    // First img is the local cover
    expect(screen.getByRole("img")).toHaveAttribute("src", "/covers/999.jpg");
    fireEvent.error(screen.getByRole("img"));
    // After error, switches to the cached remote URL
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/fallback.jpg");
  });
});

// ── Custom props ──────────────────────────────────────────────────────────────
describe("CoverImage — custom props", () => {
  it("applies width, height, and borderRadius from props to the container", () => {
    localStorage.setItem(CACHE_KEY, "");
    const { container } = render(
      <CoverImage book={BOOK} width={120} height={180} radius={8} />
    );
    const div = container.firstChild;
    expect(div.style.width).toBe("120px");
    expect(div.style.height).toBe("180px");
    expect(div.style.borderRadius).toBe("8px");
  });

  it("applies accentColor to the container gradient background", () => {
    localStorage.setItem(CACHE_KEY, "");
    const { container } = render(
      <CoverImage book={BOOK} accentColor="#ff0000" />
    );
    // jsdom normalises #ff0000cc → rgba(255, 0, 0, …); check the rgb values.
    expect(container.firstChild.style.background).toContain("255, 0, 0");
  });
});

// ── fetchBookCover helper ─────────────────────────────────────────────────────
describe("fetchBookCover", () => {
  it("returns cached URL from localStorage without fetching", async () => {
    localStorage.setItem(CACHE_KEY, "https://cached.example.com/cover.jpg");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchBookCover(BOOK);
    expect(result).toBe("https://cached.example.com/cover.jpg");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty string from cache without fetching when cover is confirmed missing", async () => {
    localStorage.setItem(CACHE_KEY, "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchBookCover(BOOK);
    expect(result).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caches and returns Open Library cover URL on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [{ cover_i: 12345 }] }),
    });
    const result = await fetchBookCover(BOOK);
    expect(result).toContain("12345");
    expect(localStorage.getItem(CACHE_KEY)).toBe(result);
  });

  it("stores empty string in cache when no cover is found anywhere", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ docs: [] }) })  // OL: no result
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });            // Google: no items
    await fetchBookCover(BOOK);
    expect(localStorage.getItem(CACHE_KEY)).toBe("");
  });
});
