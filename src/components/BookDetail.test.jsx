import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithLang, screen, fireEvent, waitFor } from "../test/utils.jsx";
import BookDetail from "./BookDetail.jsx";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./CoverImage', () => ({ default: () => <div data-testid="cover" /> }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
  signInWithGoogle: vi.fn(),
}));

vi.mock('../lib/sb', () => ({
  sb: {
    get: vi.fn().mockResolvedValue([]),
    storage: {
      upload: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(true),
    },
  },
}));

vi.mock('../lib/openBook', () => ({ resolveBookUrl: vi.fn() }));

vi.mock('../lib/ebookCache', () => ({
  cacheHas:    vi.fn().mockResolvedValue(false),
  cacheRemove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/bookStatus', () => ({
  getBookRating:  vi.fn().mockReturnValue(0),
  setBookRatingLS: vi.fn(),
  getBookNotes:   vi.fn().mockReturnValue(''),
  setBookNotesLS: vi.fn(),
  setBookStatusLS: vi.fn(),
}));

import { supabase, signInWithGoogle } from '../lib/supabase';
import { sb } from '../lib/sb';
import { resolveBookUrl } from '../lib/openBook';
import { cacheHas, cacheRemove } from '../lib/ebookCache';
import { setBookStatusLS, setBookRatingLS, setBookNotesLS } from '../lib/bookStatus';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BOOK = { id: 42, title: 'Horus Rising', author: 'Dan Abnett', series: 'Horus Heresy', num: 1, type: 'Novel', era: '31st Millennium', faction: 'Space Marines', desc: 'The beginning of the end.' };
const USER = { id: 'user-123' };
const EBOOK_META = { user_id: 'user-123', book_id: 42, file_name: 'horus-rising.epub', file_path: 'user-123/42/horus-rising.epub', file_type: 'epub' };

// Fluent Supabase chain mock — resolves at limit() for selects.
function makeChain({ files = [], upsertError = null } = {}) {
  const chain = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq     = vi.fn().mockReturnValue(chain);
  chain.limit  = vi.fn().mockResolvedValue({ data: files });
  chain.upsert = vi.fn().mockResolvedValue({ error: upsertError });
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockResolvedValue({ error: null });
  return chain;
}

function renderDetail(props = {}) {
  const defaults = {
    book: BOOK,
    user: USER,
    onBack: vi.fn(),
    onOpenReader: vi.fn(),
    status: null,
    onStatusChange: vi.fn(),
    onEbookUploaded: vi.fn(),
  };
  return renderWithLang(<BookDetail {...defaults} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  const chain = makeChain(); // no ebook, no progress by default
  supabase.from.mockReturnValue(chain);
  sb.get.mockResolvedValue([]);
  cacheHas.mockResolvedValue(false);
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

// ── Book header ───────────────────────────────────────────────────────────────
describe('BookDetail — book header', () => {
  it('renders the book title and author', () => {
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Horus Rising' })).toBeInTheDocument();
    expect(screen.getByText(/Dan Abnett/)).toBeInTheDocument();
  });

  it('renders series and number in the subtitle', () => {
    renderDetail();
    expect(screen.getAllByText(/Horus Heresy/).length).toBeGreaterThan(0);
  });

  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    renderDetail({ onBack });
    fireEvent.click(screen.getByRole('button', { name: /← Library/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders book metadata: type, era, faction', () => {
    renderDetail();
    expect(screen.getByText('Novel')).toBeInTheDocument();
    expect(screen.getByText('31st Millennium')).toBeInTheDocument();
    expect(screen.getByText('Space Marines')).toBeInTheDocument();
  });

  it('renders the book description', () => {
    renderDetail();
    expect(screen.getByText('The beginning of the end.')).toBeInTheDocument();
  });

  it('renders a Black Library search link', () => {
    renderDetail();
    const link = screen.getByRole('link', { name: /Black Library/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com'));
    expect(link.href).toContain('Horus%20Rising');
  });
});

// ── No user (unauthenticated) ─────────────────────────────────────────────────
describe('BookDetail — unauthenticated', () => {
  it('shows the sign-in prompt and lock icon', () => {
    renderDetail({ user: null });
    expect(screen.getByText(/Sign in to upload/)).toBeInTheDocument();
    expect(screen.getByText('🔐')).toBeInTheDocument();
  });

  it('shows the Google sign-in button', () => {
    renderDetail({ user: null });
    expect(screen.getByRole('button', { name: /Google/i })).toBeInTheDocument();
  });

  it('calls signInWithGoogle when the button is clicked', () => {
    renderDetail({ user: null });
    fireEvent.click(screen.getByRole('button', { name: /Google/i }));
    expect(signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('does NOT show the upload button', () => {
    renderDetail({ user: null });
    expect(screen.queryByText(/Load EPUB/i)).toBeNull();
  });
});

// ── User logged in, no ebook ──────────────────────────────────────────────────
describe('BookDetail — user, no ebook', () => {
  it('shows the upload prompt', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText(/Load EPUB or PDF/i)).toBeInTheDocument());
  });

  it('shows "No Ebook Loaded" status text', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('No Ebook Loaded')).toBeInTheDocument());
  });
});

// ── User logged in, ebook from server ────────────────────────────────────────
describe('BookDetail — user, ebook from server', () => {
  beforeEach(() => {
    supabase.from.mockReturnValue(makeChain({ files: [EBOOK_META] }));
  });

  it('shows "Ebook Ready" and the filename', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Ebook Ready')).toBeInTheDocument();
      expect(screen.getByText('horus-rising.epub')).toBeInTheDocument();
    });
  });

  it('shows "Start Reading" button when no progress', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByRole('button', { name: /Start Reading/i })).toBeInTheDocument());
  });

  it('shows "Continue Reading" when progress > 0', async () => {
    sb.get.mockResolvedValue([{ progress_pct: 0.45, chapter_index: 2, page_index: 3 }]);
    renderDetail();
    await waitFor(() => expect(screen.getByRole('button', { name: /Continue Reading/i })).toBeInTheDocument());
  });

  it('shows progress bar percentage when progress > 0', async () => {
    sb.get.mockResolvedValue([{ progress_pct: 0.5, chapter_index: 1, page_index: 0 }]);
    renderDetail();
    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument());
  });

  it('shows Replace and Remove buttons', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Replace file/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Remove ebook/i })).toBeInTheDocument();
    });
  });
});

// ── User logged in, cached only ───────────────────────────────────────────────
describe('BookDetail — user, cached only (offline)', () => {
  beforeEach(() => {
    cacheHas.mockResolvedValue(true);
  });

  it('shows "Available offline" and offline badge', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Available offline')).toBeInTheDocument();
      expect(screen.getByText('📲 OFFLINE')).toBeInTheDocument();
    });
  });

  it('shows "Open Cached Book" button', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByRole('button', { name: /Open Cached Book/i })).toBeInTheDocument());
  });
});

// ── Reading status buttons ────────────────────────────────────────────────────
describe('BookDetail — reading status', () => {
  it('renders want / reading / read status buttons', () => {
    renderDetail();
    // These labels come from i18n — check all 3 are present as buttons
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map(b => b.textContent);
    expect(labels.some(l => /To Read/i.test(l))).toBe(true);
    expect(labels.some(l => /reading/i.test(l))).toBe(true);
    expect(labels.some(l => /read/i.test(l))).toBe(true);
  });

  it('clicking a status button calls onStatusChange and setBookStatusLS', () => {
    const onStatusChange = vi.fn();
    renderDetail({ onStatusChange });
    const buttons = screen.getAllByRole('button');
    const readingBtn = buttons.find(b => /reading/i.test(b.textContent));
    fireEvent.click(readingBtn);
    expect(onStatusChange).toHaveBeenCalledWith(BOOK.id, 'reading');
    expect(setBookStatusLS).toHaveBeenCalledWith(USER.id, BOOK.id, 'reading');
  });

  it('shows 5 star rating buttons only when status is "read"', () => {
    renderDetail({ status: { status: 'read' } });
    const stars = screen.getAllByText('★');
    expect(stars).toHaveLength(5);
  });

  it('does NOT show stars for other statuses', () => {
    renderDetail({ status: { status: 'reading' } });
    expect(screen.queryByText('★')).toBeNull();
  });

  it('clicking a star calls setBookRatingLS with the correct value', () => {
    renderDetail({ status: { status: 'read' } });
    const stars = screen.getAllByText('★');
    fireEvent.click(stars[2]); // 3rd star = rating 3
    expect(setBookRatingLS).toHaveBeenCalledWith(USER.id, BOOK.id, 3);
  });
});

// ── Notes textarea ────────────────────────────────────────────────────────────
describe('BookDetail — personal notes', () => {
  it('shows the notes textarea', () => {
    renderDetail();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('saves notes on blur and shows confirmation', () => {
    renderDetail();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Great book!' } });
    fireEvent.blur(textarea);
    expect(setBookNotesLS).toHaveBeenCalledWith(USER.id, BOOK.id, 'Great book!');
    expect(screen.getByText('✓ Saved')).toBeInTheDocument();
  });
});

// ── handleOpenReader ──────────────────────────────────────────────────────────
describe('BookDetail — open reader', () => {
  beforeEach(() => {
    supabase.from.mockReturnValue(makeChain({ files: [EBOOK_META] }));
  });

  it('calls onOpenReader with correct payload on success', async () => {
    const buf = new ArrayBuffer(8);
    resolveBookUrl.mockResolvedValue({ arrayBuffer: buf, meta: { file_type: 'epub' } });
    const onOpenReader = vi.fn();
    renderDetail({ onOpenReader });
    await waitFor(() => screen.getByRole('button', { name: /Start Reading/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Reading/i }));
    await waitFor(() => expect(onOpenReader).toHaveBeenCalledOnce());
    const arg = onOpenReader.mock.calls[0][0];
    expect(arg.book).toEqual(BOOK);
    expect(arg.arrayBuffer).toBe(buf);
    expect(arg.fileType).toBe('epub');
  });

  it('shows offline error when resolveBookUrl returns offline_no_cache', async () => {
    resolveBookUrl.mockResolvedValue({ error: 'offline_no_cache' });
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Start Reading/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Reading/i }));
    await waitFor(() => expect(screen.getByText(/Offline/i)).toBeInTheDocument());
  });

  it('shows generic error when resolveBookUrl returns another error', async () => {
    resolveBookUrl.mockResolvedValue({ error: 'other_error' });
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Start Reading/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start Reading/i }));
    await waitFor(() => expect(screen.getByText(/Could not open/i)).toBeInTheDocument());
  });
});

// ── File upload ───────────────────────────────────────────────────────────────
describe('BookDetail — file upload', () => {
  it('shows success message and calls onEbookUploaded on successful upload', async () => {
    sb.storage.upload.mockResolvedValue(true);
    const onEbookUploaded = vi.fn();
    renderDetail({ onEbookUploaded });
    await waitFor(() => screen.getByText(/Load EPUB or PDF/i));

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['data'], 'book.epub', { type: 'application/epub+zip' })] },
    });

    await waitFor(() => expect(screen.getByText(/Uploaded & synced/i)).toBeInTheDocument());
    expect(onEbookUploaded).toHaveBeenCalledOnce();
  });

  it('shows upload failed message when storage.upload returns false', async () => {
    sb.storage.upload.mockResolvedValue(false);
    renderDetail();
    await waitFor(() => screen.getByText(/Load EPUB or PDF/i));

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['data'], 'book.epub', { type: 'application/epub+zip' })] },
    });

    await waitFor(() => expect(screen.getByText(/Upload failed/i)).toBeInTheDocument());
  });

  it('sets file_type to "pdf" for .pdf files', async () => {
    sb.storage.upload.mockResolvedValue(true);
    renderDetail();
    await waitFor(() => screen.getByText(/Load EPUB or PDF/i));

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'book.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() => expect(screen.getByText(/Uploaded & synced/i)).toBeInTheDocument());
    const chain = supabase.from.mock.results[0]?.value;
    // The upsert is called with file_type: 'pdf'
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: 'pdf' }),
      expect.anything()
    );
  });
});

// ── Delete ebook ──────────────────────────────────────────────────────────────
describe('BookDetail — delete ebook', () => {
  beforeEach(() => {
    supabase.from.mockReturnValue(makeChain({ files: [EBOOK_META] }));
  });

  it('first click shows "Confirm delete" (double-confirm guard)', async () => {
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Remove ebook/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remove ebook/i }));
    expect(screen.getByRole('button', { name: /Confirm delete/i })).toBeInTheDocument();
  });

  it('second click removes the ebook and shows removed message', async () => {
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Remove ebook/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remove ebook/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete/i }));
    await waitFor(() => expect(screen.getByText(/Ebook removed/i)).toBeInTheDocument());
    expect(sb.storage.remove).toHaveBeenCalledWith(EBOOK_META.file_path);
    expect(cacheRemove).toHaveBeenCalledWith(USER.id, BOOK.id);
  });
});

// ── Bookmarks ─────────────────────────────────────────────────────────────────
describe('BookDetail — bookmarks list', () => {
  it('renders bookmarks from localStorage', async () => {
    const bms = [
      { id: '1', label: 'Chapter 1 intro', progress_pct: 0.1, createdAt: new Date().toISOString() },
      { id: '2', label: 'Battle scene',    progress_pct: 0.4, createdAt: new Date().toISOString() },
    ];
    localStorage.setItem(`wh40k_bm_${USER.id}_${BOOK.id}`, JSON.stringify(bms));
    supabase.from.mockReturnValue(makeChain({ files: [EBOOK_META] }));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Chapter 1 intro')).toBeInTheDocument();
      expect(screen.getByText('Battle scene')).toBeInTheDocument();
    });
  });

  it('shows "+N more" when bookmarks exceed 5', async () => {
    const bms = Array.from({ length: 7 }, (_, i) => ({
      id: String(i), label: `Mark ${i}`, progress_pct: i * 0.1, createdAt: new Date().toISOString(),
    }));
    localStorage.setItem(`wh40k_bm_${USER.id}_${BOOK.id}`, JSON.stringify(bms));
    supabase.from.mockReturnValue(makeChain({ files: [EBOOK_META] }));
    renderDetail();
    await waitFor(() => expect(screen.getByText(/\+2/)).toBeInTheDocument());
  });
});

// ── localStorage fallback (offline) ──────────────────────────────────────────
describe('BookDetail — localStorage fallback', () => {
  it('loads ebook meta from localStorage when server returns no files', async () => {
    localStorage.setItem(`wh40k_ebook_${USER.id}_${BOOK.id}`, JSON.stringify(EBOOK_META));
    renderDetail();
    await waitFor(() => expect(screen.getByText('Ebook Ready')).toBeInTheDocument());
  });

  it('loads reading progress from localStorage when server returns none', async () => {
    const prog = { progress_pct: 0.3, chapter_index: 1, page_index: 5 };
    localStorage.setItem(`wh40k_prog_${USER.id}_${BOOK.id}`, JSON.stringify(prog));
    supabase.from.mockReturnValue(makeChain({ files: [EBOOK_META] }));
    renderDetail();
    await waitFor(() => expect(screen.getByText('30%')).toBeInTheDocument());
  });
});
