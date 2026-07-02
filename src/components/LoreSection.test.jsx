import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithLang, screen, fireEvent } from "../test/utils.jsx";
import LoreSection from "./LoreSection.jsx";

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(() => { vi.restoreAllMocks(); });

// ── WH40K mode (default) ──────────────────────────────────────────────────────
describe('LoreSection — WH40K universe', () => {
  const render40K = () => renderWithLang(<LoreSection universe="wh40k" />);

  it('renders the section heading', () => {
    render40K();
    expect(screen.getByRole('heading', { name: 'Lore & Resources' })).toBeInTheDocument();
  });

  it('shows the "Warhammer 40,000" subtitle', () => {
    render40K();
    expect(screen.getByText('Warhammer 40,000')).toBeInTheDocument();
  });

  it('shows the 40K intro text', () => {
    render40K();
    expect(screen.getByText(/Direct access to the best online encyclopedias/)).toBeInTheDocument();
  });

  it('renders Warhammer 40k Wiki and Lexicanum resource cards', () => {
    render40K();
    expect(screen.getByText('Warhammer 40k Wiki')).toBeInTheDocument();
    expect(screen.getByText('Lexicanum')).toBeInTheDocument();
  });

  it('renders 40K quick-access faction links', () => {
    render40K();
    expect(screen.getByText('Space Marines')).toBeInTheDocument();
    expect(screen.getByText('Necrons')).toBeInTheDocument();
    expect(screen.getByText('Tyranids')).toBeInTheDocument();
    expect(screen.getByText('Primarchs')).toBeInTheDocument();
    expect(screen.getByText('Horus Heresy')).toBeInTheDocument();
  });

  it('does NOT render AoS realm cards', () => {
    render40K();
    expect(screen.queryByText('The Mortal Realms')).toBeNull();
    expect(screen.queryByText('Realm of Aqshy')).toBeNull();
  });

  it('does NOT render AoS faction links', () => {
    render40K();
    expect(screen.queryByText('Stormcast Eternals')).toBeNull();
    expect(screen.queryByText('Sylvaneth')).toBeNull();
  });

  it('renders the in-reader hint with "underlined in blue"', () => {
    render40K();
    expect(screen.getByText('underlined in blue')).toBeInTheDocument();
  });

  it('renders the 40K search placeholder', () => {
    render40K();
    expect(screen.getByPlaceholderText('Space Marines, Horus, Aeldari…')).toBeInTheDocument();
  });
});

// ── AoS mode ──────────────────────────────────────────────────────────────────
describe('LoreSection — AoS universe', () => {
  const renderAoS = () => renderWithLang(<LoreSection universe="aos" />);

  it('shows the "Warhammer: Age of Sigmar" subtitle', () => {
    renderAoS();
    expect(screen.getByText('Warhammer: Age of Sigmar')).toBeInTheDocument();
  });

  it('shows the AoS intro text', () => {
    renderAoS();
    expect(screen.getByText(/Direct access to the best online encyclopedias of the Mortal Realms/)).toBeInTheDocument();
  });

  it('renders AoS resource cards', () => {
    renderAoS();
    expect(screen.getByText('Lexicanum AoS')).toBeInTheDocument();
    expect(screen.getByText('Sigmar Wiki')).toBeInTheDocument();
  });

  it('does NOT render 40K resource cards', () => {
    renderAoS();
    expect(screen.queryByText('Warhammer 40k Wiki')).toBeNull();
  });

  it('renders AoS quick-access faction links', () => {
    renderAoS();
    expect(screen.getByText('Stormcast Eternals')).toBeInTheDocument();
    expect(screen.getByText('Sylvaneth')).toBeInTheDocument();
    expect(screen.getByText('Skaven')).toBeInTheDocument();
    expect(screen.getByText('Nagash')).toBeInTheDocument();
  });

  it('does NOT render 40K faction links', () => {
    renderAoS();
    expect(screen.queryByText('Space Marines')).toBeNull();
    expect(screen.queryByText('Necrons')).toBeNull();
  });

  it('renders "The Mortal Realms" section header', () => {
    renderAoS();
    expect(screen.getByText('The Mortal Realms')).toBeInTheDocument();
  });

  it('renders all 8 Mortal Realm buttons', () => {
    renderAoS();
    const realms = ['Realm of Aqshy', 'Realm of Ghyran', 'Realm of Shyish', 'Realm of Azyr',
                    'Realm of Chamon', 'Realm of Ghur', 'Realm of Ulgu', 'Realm of Hysh'];
    realms.forEach(name => expect(screen.getByText(name)).toBeInTheDocument());
  });

  it('renders the AoS search placeholder', () => {
    renderAoS();
    expect(screen.getByPlaceholderText('Sigmar, Stormcast, Nagash…')).toBeInTheDocument();
  });
});

// ── Search functionality ──────────────────────────────────────────────────────
describe('LoreSection — wiki search', () => {
  it('40K: opens Fandom wiki on Search button click', () => {
    renderWithLang(<LoreSection universe="wh40k" />);
    fireEvent.change(screen.getByPlaceholderText('Space Marines, Horus, Aeldari…'), { target: { value: 'Necrons' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search ↗' }));
    expect(window.open).toHaveBeenCalledOnce();
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('warhammer40k.fandom.com');
    expect(url).toContain('Necrons');
  });

  it('40K: opens Fandom wiki on Enter key', () => {
    renderWithLang(<LoreSection universe="wh40k" />);
    const input = screen.getByPlaceholderText('Space Marines, Horus, Aeldari…');
    fireEvent.change(input, { target: { value: 'Orks' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(window.open).toHaveBeenCalledOnce();
    expect(window.open.mock.calls[0][0]).toContain('Orks');
  });

  it('40K: does NOT open a window when search is empty', () => {
    renderWithLang(<LoreSection universe="wh40k" />);
    fireEvent.click(screen.getByRole('button', { name: 'Search ↗' }));
    expect(window.open).not.toHaveBeenCalled();
  });

  it('40K: does NOT open a window when search is whitespace only', () => {
    renderWithLang(<LoreSection universe="wh40k" />);
    fireEvent.change(screen.getByPlaceholderText('Space Marines, Horus, Aeldari…'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search ↗' }));
    expect(window.open).not.toHaveBeenCalled();
  });

  it('AoS: opens AoS Lexicanum on Search button click', () => {
    renderWithLang(<LoreSection universe="aos" />);
    fireEvent.change(screen.getByPlaceholderText('Sigmar, Stormcast, Nagash…'), { target: { value: 'Nagash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search ↗' }));
    expect(window.open).toHaveBeenCalledOnce();
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('ageofsigmar.lexicanum.com');
    expect(url).toContain('Nagash');
  });

  it('AoS: opens AoS Lexicanum on Enter key', () => {
    renderWithLang(<LoreSection universe="aos" />);
    const input = screen.getByPlaceholderText('Sigmar, Stormcast, Nagash…');
    fireEvent.change(input, { target: { value: 'Stormcast' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(window.open).toHaveBeenCalledOnce();
    expect(window.open.mock.calls[0][0]).toContain('ageofsigmar.lexicanum.com');
  });

  it('URL-encodes spaces in the search query', () => {
    renderWithLang(<LoreSection universe="wh40k" />);
    fireEvent.change(screen.getByPlaceholderText('Space Marines, Horus, Aeldari…'), { target: { value: 'Horus Heresy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search ↗' }));
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('Horus%20Heresy');
  });
});

// ── Realm card clicks ─────────────────────────────────────────────────────────
describe('LoreSection — AoS realm card clicks', () => {
  it('clicking Realm of Aqshy opens the correct Lexicanum page', () => {
    renderWithLang(<LoreSection universe="aos" />);
    fireEvent.click(screen.getByRole('button', { name: /Realm of Aqshy/ }));
    expect(window.open).toHaveBeenCalledOnce();
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('ageofsigmar.lexicanum.com');
    expect(url).toContain('Realm_of_Aqshy');
  });

  it('clicking Realm of Shyish opens the correct Lexicanum page', () => {
    renderWithLang(<LoreSection universe="aos" />);
    fireEvent.click(screen.getByRole('button', { name: /Realm of Shyish/ }));
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('Realm_of_Shyish');
  });

  it('spaces in realm names are replaced with underscores in the URL', () => {
    renderWithLang(<LoreSection universe="aos" />);
    fireEvent.click(screen.getByRole('button', { name: /Realm of Azyr/ }));
    const [url] = window.open.mock.calls[0];
    expect(url).not.toContain(' ');
    expect(url).toContain('Realm_of_Azyr');
  });
});
