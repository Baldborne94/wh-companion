import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary.jsx";

// Suppress React's own console.error for expected error-boundary throws.
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

// Helper: a component that throws on demand.
function Bomb({ message }) {
  throw new Error(message ?? "boom");
}

// Wrap render so React doesn't show the uncaught error overlay in jsdom.
function renderBoundary(ui, props = {}) {
  return render(<ErrorBoundary {...props}>{ui}</ErrorBoundary>);
}

// ── Normal (no error) path ────────────────────────────────────────────────────
describe('ErrorBoundary — no error', () => {
  it('renders children when nothing throws', () => {
    renderBoundary(<span>OK</span>);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
});

// ── Error fallback UI ─────────────────────────────────────────────────────────
describe('ErrorBoundary — error fallback', () => {
  it('shows the ⚙ icon', () => {
    renderBoundary(<Bomb />);
    expect(screen.getByText('⚙')).toBeInTheDocument();
  });

  it('shows the default EN title from translations', () => {
    renderBoundary(<Bomb />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows a custom title when the title prop is provided', () => {
    renderBoundary(<Bomb />, { title: 'Custom Error Title' });
    expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
  });

  it('shows the error message from the thrown error', () => {
    renderBoundary(<Bomb message="network failure" />);
    expect(screen.getByText('network failure')).toBeInTheDocument();
  });

  it('shows the generic fallback when the error has no message', () => {
    function NoMessageBomb() { throw {}; }
    renderBoundary(<NoMessageBomb />);
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  it('shows the IT title when wh_language=it is in localStorage', () => {
    localStorage.setItem('wh_language', 'it');
    renderBoundary(<Bomb />);
    expect(screen.getByText('Qualcosa è andato storto')).toBeInTheDocument();
  });

  it('shows the EN Retry button label', () => {
    renderBoundary(<Bomb />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the IT Retry button label when wh_language=it', () => {
    localStorage.setItem('wh_language', 'it');
    renderBoundary(<Bomb />);
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });
});

// ── Retry resets state ────────────────────────────────────────────────────────
describe('ErrorBoundary — retry resets state for non-chunk errors', () => {
  it('clears the error and shows children again after clicking Retry', () => {
    // Render a boundary around a component that can be toggled to not throw.
    let shouldThrow = true;
    function Toggle() {
      if (shouldThrow) throw new Error('toggle error');
      return <span>recovered</span>;
    }
    const { rerender } = renderBoundary(<Toggle />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop throwing, then click Retry — the boundary clears its state.
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    rerender(<ErrorBoundary><Toggle /></ErrorBoundary>);
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});

// ── Chunk error path ──────────────────────────────────────────────────────────
describe('ErrorBoundary — chunk error self-heal', () => {
  function makeChunkError(msg = 'dynamically imported module') {
    function ChunkBomb() { throw new Error(msg); }
    return ChunkBomb;
  }

  beforeEach(() => {
    // Mock window.location.reload (jsdom doesn't support real navigation).
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    });
    // Ensure online and caches stubbed
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    globalThis.caches = { keys: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue(true) };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn().mockResolvedValue([]) },
      configurable: true,
    });
  });

  it('fires location.reload() on componentDidCatch for a chunk error when online', async () => {
    const ChunkBomb = makeChunkError();
    renderBoundary(<ChunkBomb />);
    // healStaleCacheAndReload is async; let microtasks settle.
    await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it('does NOT reload when offline for a chunk error', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const ChunkBomb = makeChunkError();
    renderBoundary(<ChunkBomb />);
    await new Promise(r => setTimeout(r, 50));
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('does NOT reload a second time if sessionStorage guard is already set', async () => {
    sessionStorage.setItem('wh_chunk_heal', '1');
    const ChunkBomb = makeChunkError();
    renderBoundary(<ChunkBomb />);
    await new Promise(r => setTimeout(r, 50));
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('recognises "Loading chunk" as a chunk error variant', async () => {
    const ChunkBomb = makeChunkError('Loading chunk 42 failed');
    renderBoundary(<ChunkBomb />);
    await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });
});
