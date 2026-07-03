import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithLang, screen, fireEvent, waitFor } from "../test/utils.jsx";
import LibrarySection from "./LibrarySection.jsx";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./CoverImage', () => ({ default: () => <div data-testid="cover" /> }));

vi.mock('./BookDetail', () => ({
  default: ({ book, onBack }) => (
    <div data-testid="book-detail">
      <button onClick={onBack}>Back</button>
      <span>{book.title}</span>
    </div>
  ),
}));

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

vi.mock('../lib/ebookCache', () => ({
  cacheListIds: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock('../lib/bookStatus', () => ({
  getBookRating: vi.fn().mockReturnValue(0),
}));

import { supabase } from '../lib/supabase';
import { cacheListIds } from '../lib/ebookCache';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER = { id: 'user-1' };

// Returns a supabase-style thenable query builder: .from().select().eq() → Promise
function makeQuery(data = []) {
  const p = Promise.resolve({ data });
  const thenable = { then: p.then.bind(p), catch: p.catch.bind(p) };
  return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(thenable) }) };
}

function setupSupabase({ progress = [], files = [] } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'reading_progress') return makeQuery(progress);
    if (table === 'ebook_files')      return makeQuery(files);
    return makeQuery([]);
  });
}

function renderLib(props = {}) {
  return renderWithLang(
    <LibrarySection
      user={USER}
      statuses={{}}
      onStatusChange={vi.fn()}
      openDetailBook={null}
      onDetailConsumed={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setupSupabase();
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

// ── Header & tabs ─────────────────────────────────────────────────────────────
describe('LibrarySection — header & tabs', () => {
  it('renders the "The Library" heading', () => {
    renderLib();
    expect(screen.getByRole('heading', { name: 'The Library' })).toBeInTheDocument();
  });

  it('renders Catalogue, My Shelf and Upcoming tab buttons', () => {
    renderLib();
    expect(screen.getByRole('button', { name: 'Catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /My Shelf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upcoming' })).toBeInTheDocument();
  });

  it('renders without a user (no crash, catalogue still shows)', () => {
    renderLib({ user: null });
    expect(screen.getByRole('heading', { name: 'The Library' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search titles, authors, series…')).toBeInTheDocument();
  });
});

// ── Stats bar ─────────────────────────────────────────────────────────────────
describe('LibrarySection — stats bar', () => {
  it('shows read and reading counts from the statuses prop', () => {
    renderLib({
      statuses: {
        1: { status: 'read' },
        2: { status: 'read' },
        3: { status: 'reading' },
      },
    });
    // Stats labels rendered as sibling divs; nextElementSibling is the count value
    const readLabel = screen.getByText('Read');
    expect(readLabel.nextElementSibling?.textContent).toBe('2');

    const readingLabel = screen.getByText('Reading');
    expect(readingLabel.nextElementSibling?.textContent).toBe('1');
  });
});

// ── Catalogue search ──────────────────────────────────────────────────────────
describe('LibrarySection — catalogue search', () => {
  it('renders the search input', () => {
    renderLib();
    expect(screen.getByPlaceholderText('Search titles, authors, series…')).toBeInTheDocument();
  });

  it('filters books by title after debounce', async () => {
    renderLib();
    fireEvent.change(screen.getByPlaceholderText('Search titles, authors, series…'), {
      target: { value: 'Horus Rising' },
    });
    // After debounce: only the exact match remains; "False Gods" is gone
    await waitFor(() => {
      expect(screen.getByText('Horus Rising')).toBeInTheDocument();
      expect(screen.queryByText('False Gods')).toBeNull();
    });
  });

  it('filters books by author', async () => {
    renderLib();
    fireEvent.change(screen.getByPlaceholderText('Search titles, authors, series…'), {
      target: { value: 'Dan Abnett' },
    });
    await waitFor(() => {
      expect(screen.getByText('Horus Rising')).toBeInTheDocument();
      // Graham McNeill book should be filtered out
      expect(screen.queryByText('False Gods')).toBeNull();
    });
  });

  it('shows the empty state when nothing matches', async () => {
    renderLib();
    fireEvent.change(screen.getByPlaceholderText('Search titles, authors, series…'), {
      target: { value: 'xyzzy-no-match' },
    });
    await waitFor(() => {
      expect(screen.getByText('No tomes found, Inquisitor.')).toBeInTheDocument();
    });
  });

  it('clear button resets the search input', async () => {
    renderLib();
    const input = screen.getByPlaceholderText('Search titles, authors, series…');
    fireEvent.change(input, { target: { value: 'Horus Rising' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input.value).toBe('');
  });
});

// ── Catalogue filters ─────────────────────────────────────────────────────────
describe('LibrarySection — catalogue filters', () => {
  it('⚙ Filters button reveals the filter panel', () => {
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Sort by')).toBeInTheDocument();
  });

  it('status chip "Unread" excludes read and reading books', async () => {
    renderLib({ statuses: { 1: { status: 'read' }, 2: { status: 'reading' } } });
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => {
      // Books 1 (read) and 2 (reading) should be filtered out
      expect(screen.queryByText('Horus Rising')).toBeNull();
      expect(screen.queryByText('False Gods')).toBeNull();
    });
  });

  it('status chip "📋 To Read" shows only want books', async () => {
    renderLib({ statuses: { 1: { status: 'want' } } });
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    fireEvent.click(screen.getByRole('button', { name: '📋 To Read' }));
    await waitFor(() => {
      expect(screen.getByText('Horus Rising')).toBeInTheDocument();
      // Book 2 has no status (not 'want') → filtered out
      expect(screen.queryByText('False Gods')).toBeNull();
    });
  });

  it('Reset button clears all active filters', async () => {
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    // Reset button disappears when no filter is active
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull());
  });

  it('filtered title count updates when filters change', async () => {
    renderLib({ statuses: { 1: { status: 'want' } } });
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    fireEvent.click(screen.getByRole('button', { name: '📋 To Read' }));
    await waitFor(() => {
      // Only 1 book with 'want' status → count label "1 titles"
      const countEl = screen.getByText(/titles/i);
      expect(countEl.textContent).toMatch(/^1/);
    });
  });
});

// ── Book detail navigation ────────────────────────────────────────────────────
describe('LibrarySection — book detail navigation', () => {
  it('clicking a catalogue book card opens BookDetail', () => {
    renderLib();
    fireEvent.click(screen.getByText('Horus Rising'));
    expect(screen.getByTestId('book-detail')).toBeInTheDocument();
  });

  it('Back button in BookDetail returns to the catalogue', () => {
    renderLib();
    fireEvent.click(screen.getByText('Horus Rising'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('book-detail')).toBeNull();
    expect(screen.getByRole('heading', { name: 'The Library' })).toBeInTheDocument();
  });

  it('openDetailBook prop immediately shows BookDetail for that book', () => {
    const book = { id: 1, title: 'Horus Rising', series: 'Horus Heresy', num: 1, author: 'Dan Abnett', type: 'Novel', era: 'Horus Heresy', faction: 'Space Marines' };
    renderLib({ openDetailBook: book });
    expect(screen.getByTestId('book-detail')).toBeInTheDocument();
    // The stub renders the book title
    expect(screen.getByText('Horus Rising', { selector: '[data-testid="book-detail"] span' })).toBeInTheDocument();
  });
});

// ── Shelf tab ─────────────────────────────────────────────────────────────────
describe('LibrarySection — shelf tab', () => {
  it('shows the empty state when supabase returns no ebook files', async () => {
    setupSupabase({ files: [] });
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: /My Shelf/i }));
    await waitFor(() => {
      expect(screen.getByText('No ebooks loaded')).toBeInTheDocument();
    });
  });

  it('"Go to Catalogue →" switches back to the catalogue tab', async () => {
    setupSupabase({ files: [] });
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: /My Shelf/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go to Catalogue →' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Go to Catalogue →' }));
    expect(screen.getByPlaceholderText('Search titles, authors, series…')).toBeInTheDocument();
  });

  it('shows shelf books when supabase returns ebook_files rows', async () => {
    setupSupabase({
      files: [
        { book_id: 1, file_name: 'horus.epub', file_path: 'user-1/1/horus.epub', file_type: 'epub' },
      ],
    });
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: /My Shelf/i }));
    await waitFor(() => {
      expect(screen.getByText('Horus Rising')).toBeInTheDocument();
    });
  });

  it('shelf search filters the displayed books', async () => {
    setupSupabase({
      files: [
        { book_id: 1, file_name: 'horus.epub',      file_path: 'user-1/1/horus.epub',      file_type: 'epub' },
        { book_id: 2, file_name: 'false-gods.epub', file_path: 'user-1/2/false-gods.epub', file_type: 'epub' },
      ],
    });
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: /My Shelf/i }));
    await waitFor(() => expect(screen.getByText('Horus Rising')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Search your ebooks...'), {
      target: { value: 'False Gods' },
    });
    await waitFor(() => {
      expect(screen.getByText('False Gods')).toBeInTheDocument();
      expect(screen.queryByText('Horus Rising')).toBeNull();
    });
  });

  it('loads shelf from localStorage when supabase returns no files', async () => {
    setupSupabase({ files: [] });
    // Seed the localStorage meta for book 1
    localStorage.setItem(
      `wh40k_ebook_${USER.id}_1`,
      JSON.stringify({ book_id: 1, file_name: 'horus.epub', file_path: 'user-1/1/horus.epub', file_type: 'epub' })
    );
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: /My Shelf/i }));
    await waitFor(() => {
      expect(screen.getByText('Horus Rising')).toBeInTheDocument();
    });
  });
});

// ── Upcoming tab ──────────────────────────────────────────────────────────────
describe('LibrarySection — upcoming tab', () => {
  it('shows release month groups when Upcoming tab is clicked', () => {
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
    // UPCOMING_RELEASES has a "June 2026" group
    expect(screen.getByText('June 2026')).toBeInTheDocument();
  });

  it('shows a Black Library external link', () => {
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
    const link = screen.getByRole('link', { name: /blacklibrary/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('blacklibrary.com'));
  });

  it('renders release items with title and author', () => {
    renderLib();
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
    // The first release in June 2026 is "The Iron Vow" by Guy Haley
    expect(screen.getByText('The Iron Vow')).toBeInTheDocument();
    expect(screen.getByText(/Guy Haley/)).toBeInTheDocument();
  });
});
